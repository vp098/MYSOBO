from datetime import timedelta
import uuid

from django.contrib.auth.hashers import check_password, make_password
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import OTPChallenge, Profile, User
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
        token, _ = Token.objects.get_or_create(user=user)
        return Response({"token": token.key})
