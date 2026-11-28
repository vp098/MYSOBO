from datetime import timedelta
import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .google import GoogleTokenError, verify_google_credential
from .models import OTPChallenge, Profile, User
from .sessions import signed_in
from .otp import (
    OTPDeliveryError,
    generate_otp,
    normalize_mobile_number,
    set_authenticated_user_rls_context,
    send_login_otp,
    set_otp_rls_context,
)


OTP_LIFETIME = timedelta(minutes=5)
OTP_RESEND_DELAY = timedelta(seconds=60)
OTP_DAILY_LIMIT = 5
OTP_IP_HOURLY_LIMIT = 30
OTP_ATTEMPT_LIMIT = 5


class MobileSerializer(serializers.Serializer):
    mobile = serializers.CharField(max_length=32)

    def validate_mobile(self, value):
        try:
            return normalize_mobile_number(value)
        except ValueError as error:
            raise serializers.ValidationError(str(error)) from error


class OTPRequestSerializer(MobileSerializer):
    consent = serializers.BooleanField()

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Consent is required to continue.")
        return value


class OTPRequestView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    def post(self, request):
        blocked = google_only()
        if blocked:
            return blocked
        serializer = OTPRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data["mobile"]
        now = timezone.now()
        ip_address = request.META.get("REMOTE_ADDR")
        set_otp_rls_context(mobile, ip_address)
        recent_mobile = OTPChallenge.objects.filter(
            mobile=mobile, created_at__gte=now - timedelta(days=1)
        )
        last_challenge = recent_mobile.order_by("-created_at").first()
        if last_challenge and last_challenge.created_at > now - OTP_RESEND_DELAY:
            retry_after = max(
                1,
                int((last_challenge.created_at + OTP_RESEND_DELAY - now).total_seconds()),
            )
            return Response(
                {"detail": "Please wait before requesting another code."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(retry_after)},
            )
        if recent_mobile.count() >= OTP_DAILY_LIMIT:
            return Response(
                {"detail": "Too many code requests. Try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        if ip_address and OTPChallenge.objects.filter(
            request_ip=ip_address, created_at__gte=now - timedelta(hours=1)
        ).count() >= OTP_IP_HOURLY_LIMIT:
            return Response(
                {"detail": "Too many code requests. Try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        code = generate_otp()
        OTPChallenge.objects.filter(
            mobile=mobile,
            consumed_at__isnull=True,
        ).update(consumed_at=now)
        challenge = OTPChallenge.objects.create(
            mobile=mobile,
            code_hash=make_password(code),
            request_ip=ip_address,
            expires_at=now + OTP_LIFETIME,
            consent_version=settings.OTP_CONSENT_VERSION,
        )
        try:
            send_login_otp(mobile, code)
        except OTPDeliveryError:
            challenge.delete()
            return Response(
                {"detail": "We could not send a code right now. Please try again later."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ImproperlyConfigured:
            challenge.delete()
            return Response(
                {"detail": "Phone sign-in is not configured. Contact support."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response({
            "detail": "If this number can receive messages, a verification code was sent.",
            "expires_in": int(OTP_LIFETIME.total_seconds()),
            "resend_after_seconds": int(OTP_RESEND_DELAY.total_seconds()),
        })


class OTPVerifySerializer(MobileSerializer):
    code = serializers.RegexField(r"^\d{6}$", max_length=6)


class OTPVerifyView(APIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)

    @transaction.atomic
    def post(self, request):
        blocked = google_only()
        if blocked:
            return blocked
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        mobile = serializer.validated_data["mobile"]
        code = serializer.validated_data["code"]
        now = timezone.now()
        set_otp_rls_context(mobile, request.META.get("REMOTE_ADDR"))
        challenge = OTPChallenge.objects.select_for_update().filter(
            mobile=mobile,
            consumed_at__isnull=True,
            expires_at__gt=now,
        ).order_by("-created_at").first()
        if not challenge or challenge.attempts >= OTP_ATTEMPT_LIMIT:
            return Response(
                {"detail": "Invalid or expired verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not check_password(code, challenge.code_hash):
            challenge.attempts += 1
            if challenge.attempts >= OTP_ATTEMPT_LIMIT:
                challenge.consumed_at = now
            challenge.save(update_fields=("attempts", "consumed_at"))
            return Response(
                {"detail": "Invalid or expired verification code."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        challenge.consumed_at = now
        challenge.save(update_fields=("consumed_at",))
        user = User.objects.select_for_update().filter(mobile=mobile).first()
        if not user:
            user = User.objects.create_user(
                username=f"resident-{mobile}-{uuid.uuid4().hex[:8]}",
                mobile=mobile,
            )
        set_authenticated_user_rls_context(user.pk)
        if not user.is_active:
            return Response(
                {"detail": "This account cannot sign in. Contact support."},
                status=status.HTTP_403_FORBIDDEN,
            )
        profile = Profile.objects.filter(id=user).first()
        if profile and profile.deleted_at is not None:
            return Response(
                {"detail": "This account cannot sign in. Contact support."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if profile is None:
            profile = Profile.objects.create(id=user, mobile=mobile)
        profile.consent_at = now
        profile.consent_version = challenge.consent_version
        if not profile.mobile:
            profile.mobile = mobile
        profile.save(
            update_fields=("consent_at", "consent_version", "mobile")
        )
        return signed_in(request, user)


class GoogleLoginThrottle(ScopedRateThrottle):
    scope = "google_login"


def google_only():
    """The response other sign-in methods give while Google is the only way in."""
    if getattr(settings, "ALLOW_PASSWORD_LOGIN", False):
        return None
    return Response({"detail": "Please continue with Google.", "code": "google_only"}, status=status.HTTP_404_NOT_FOUND)


class AuthConfigView(APIView):
    """Public sign-in settings for the web app. The Google client id is public by design."""

    authentication_classes = ()
    permission_classes = (AllowAny,)

    def get(self, request):
        return Response({
            "google_client_id": settings.GOOGLE_CLIENT_ID or "",
            "google_enabled": bool(settings.GOOGLE_CLIENT_ID),
            "password_login": bool(getattr(settings, "ALLOW_PASSWORD_LOGIN", False)),
        })


class GoogleLoginView(APIView):
    """Sign up or log in with a Google ID token. Body: {credential, account_type?}.

    1. The token is verified with Google (audience, issuer, expiry, verified email).
    2. The person is found by their Google id; if this Google account was never
       used before, an existing MySobo account with the same verified email is
       linked; otherwise a new account and profile are created.
    3. A session cookie is set and the person's home dashboard is returned.
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (GoogleLoginThrottle,)

    @transaction.atomic
    def post(self, request):
        from .models import SocialIdentity

        if not settings.GOOGLE_CLIENT_ID:
            return Response(
                {"detail": "Google sign-in is not set up yet.", "code": "not_configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            claims = verify_google_credential(str(request.data.get("credential", "")))
        except GoogleTokenError as error:
            return Response({"detail": str(error), "code": "invalid_token"}, status=status.HTTP_400_BAD_REQUEST)

        subject = str(claims["sub"])
        email = claims["email"].strip().lower()
        full_name = " ".join(str(claims.get("name", "")).split())[:200]
        picture = str(claims.get("picture", ""))[:500]
        identity = SocialIdentity.objects.select_for_update().select_related("user").filter(
            provider=SocialIdentity.Provider.GOOGLE, subject=subject
        ).first()
        created = False
        if identity is not None:
            user = identity.user
        else:
            user = User.objects.select_for_update().filter(email__iexact=email).order_by("date_joined").first()
            if user is not None and SocialIdentity.objects.filter(user=user, provider=SocialIdentity.Provider.GOOGLE).exists():
                # This MySobo account is already linked to a different Google account.
                return Response(
                    {"detail": "This email is linked to another Google account. Contact support.", "code": "conflict"},
                    status=status.HTTP_409_CONFLICT,
                )
            if user is None:
                user = User.objects.create_user(
                    username=f"google-{subject}"[:150],
                    email=email,
                    first_name=str(claims.get("given_name", ""))[:150],
                    last_name=str(claims.get("family_name", ""))[:150],
                )
                user.set_unusable_password()
                user.save(update_fields=("password",))
                created = True
            identity = SocialIdentity(user=user, provider=SocialIdentity.Provider.GOOGLE, subject=subject)

        set_authenticated_user_rls_context(user.pk)
        if not user.is_active:
            return Response({"detail": "This account cannot sign in. Contact support.", "code": "inactive"},
                            status=status.HTTP_403_FORBIDDEN)
        profile = Profile.objects.filter(id=user).first()
        if profile and profile.deleted_at is not None:
            return Response({"detail": "This account cannot sign in. Contact support.", "code": "inactive"},
                            status=status.HTTP_403_FORBIDDEN)
        if profile is None:
            account_type = str(request.data.get("account_type", Profile.AccountType.RESIDENT))
            if account_type not in Profile.AccountType.values:
                account_type = Profile.AccountType.RESIDENT
            profile = Profile.objects.create(id=user, name=full_name, account_type=account_type)
        elif not profile.name and full_name:
            profile.name = full_name
            profile.save(update_fields=("name",))
        if profile.consent_at is None:
            profile.consent_at = timezone.now()
            profile.consent_version = "google-signin"
            profile.save(update_fields=("consent_at", "consent_version"))

        identity.email = email
        identity.email_verified = True
        identity.name = full_name
        identity.picture = picture
        identity.last_login_at = timezone.now()
        identity.save()
        response = signed_in(request, user)
        response.data["new"] = created
        return response


class DemoLoginThrottle(ScopedRateThrottle):
    scope = "demo_login"


class DemoEmailLoginView(APIView):
    """Preview-only sign-in: any email logs in without verification.

    Enabled only when DEMO_EMAIL_LOGIN=true. Never signs into staff or admin
    accounts. Turn it off before launch.
    """

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (DemoLoginThrottle,)

    @transaction.atomic
    def post(self, request):
        blocked = google_only()
        if blocked:
            return blocked
        if not settings.DEMO_EMAIL_LOGIN:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        email = str(request.data.get("email", "")).strip().lower()
        try:
            serializers.EmailField().run_validation(email)
        except serializers.ValidationError:
            return Response({"detail": "Enter a valid email address."}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.select_for_update().filter(email__iexact=email).order_by("date_joined").first()
        if user and (user.is_staff or user.is_superuser or user.admin_roles.exists()):
            return Response(
                {"detail": "Admin accounts must sign in with their password."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if user is None:
            parts = [part for part in email.split("@")[0].replace("_", ".").replace("-", ".").split(".") if part.isalpha()]
            user = User.objects.create_user(
                username=f"demo-{uuid.uuid4().hex[:10]}",
                email=email,
                first_name=(parts[0].title() if parts else "")[:150],
                last_name=(" ".join(parts[1:]).title())[:150],
            )
            user.set_unusable_password()
            user.save(update_fields=("password",))
        if not user.is_active:
            return Response({"detail": "This account cannot sign in."}, status=status.HTTP_403_FORBIDDEN)
        set_authenticated_user_rls_context(user.pk)
        Profile.objects.get_or_create(id=user, defaults={"name": user.get_full_name()})
        return signed_in(request, user)


# --------------------------------------------------
# EMAIL + PASSWORD ACCOUNTS
# --------------------------------------------------

class EmailAuthThrottle(ScopedRateThrottle):
    scope = "email_auth"


_DUMMY_HASH = make_password("mysobo-timing-guard")


def _is_admin(user):
    return user.is_staff or user.is_superuser or user.admin_roles.exists()


def _token_for(request, user, status_code=200):
    set_authenticated_user_rls_context(user.pk)
    Profile.objects.get_or_create(id=user, defaults={"name": user.get_full_name()})
    return signed_in(request, user, status_code)


class EmailRegisterView(APIView):
    """Create an account with email and password. Body: {name, email, password}."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (EmailAuthThrottle,)

    @transaction.atomic
    def post(self, request):
        blocked = google_only()
        if blocked:
            return blocked
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        name = " ".join(str(request.data.get("name", "")).split())[:150]
        email = str(request.data.get("email", "")).strip().lower()
        password = str(request.data.get("password", ""))
        try:
            serializers.EmailField().run_validation(email)
        except serializers.ValidationError:
            return Response({"detail": "Enter a valid email address.", "field": "email"}, status=status.HTTP_400_BAD_REQUEST)
        if len(name) < 2:
            return Response({"detail": "Enter your name.", "field": "name"}, status=status.HTTP_400_BAD_REQUEST)

        first, _, last = name.partition(" ")
        existing = User.objects.select_for_update().filter(email__iexact=email).order_by("date_joined").first()
        if existing and (existing.has_usable_password() or _is_admin(existing) or not settings.DEMO_EMAIL_LOGIN):
            return Response(
                {"detail": "An account with this email already exists. Log in instead.", "field": "email", "code": "exists"},
                status=status.HTTP_409_CONFLICT,
            )
        user = existing or User(username=f"u-{uuid.uuid4().hex[:12]}", email=email)
        user.first_name, user.last_name = first[:150], last[:150]
        try:
            validate_password(password, user)
        except DjangoValidationError as error:
            return Response({"detail": " ".join(error.messages), "field": "password"}, status=status.HTTP_400_BAD_REQUEST)
        # In preview mode an account first made with the passwordless preview
        # login can be given a password here. In production that is refused above.
        user.set_password(password)
        user.save()
        account_type = str(request.data.get("account_type", "resident"))
        if account_type not in Profile.AccountType.values:
            account_type = Profile.AccountType.RESIDENT
        Profile.objects.update_or_create(id=user, defaults={"name": name, "account_type": account_type})
        return _token_for(request, user, status.HTTP_201_CREATED)


class EmailLoginView(APIView):
    """Log in with email (or username, for staff) and password."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = (EmailAuthThrottle,)

    def post(self, request):
        blocked = google_only()
        if blocked:
            return blocked
        identifier = str(request.data.get("email", "")).strip()
        password = str(request.data.get("password", ""))
        if not identifier or not password:
            return Response({"detail": "Enter your email and password."}, status=status.HTTP_400_BAD_REQUEST)
        candidates = list(User.objects.filter(email__iexact=identifier).order_by("date_joined")[:5])
        if not candidates:
            candidates = list(User.objects.filter(username=identifier)[:1])
        user = next((item for item in candidates if item.is_active and item.check_password(password)), None)
        if user is None:
            if not candidates:
                check_password(password, _DUMMY_HASH)  # keep timing similar
            return Response({"detail": "Email or password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
        return _token_for(request, user)
