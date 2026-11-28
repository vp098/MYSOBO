from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import OTPChallenge, Profile, User
from .otp import send_login_otp


@override_settings(ALLOW_PASSWORD_LOGIN=True)
class OTPAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @override_settings(OTP_SMS_BACKEND="mock", IS_CI=True)
    @patch("accounts.otp.urlopen")
    def test_ci_mock_otp_backend_never_calls_sms_provider(self, urlopen_mock):
        response = self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "9876543210", "consent": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        urlopen_mock.assert_not_called()

    @override_settings(OTP_SMS_BACKEND="mock", IS_CI=False)
    def test_mock_otp_backend_is_rejected_outside_ci(self):
        with self.assertRaises(ImproperlyConfigured):
            send_login_otp("9876543210", "123456")

    @patch("accounts.views.send_login_otp")
    def test_mobile_otp_creates_and_authenticates_resident_once(self, send_otp):
        sent_codes = []
        send_otp.side_effect = lambda mobile, code: sent_codes.append((mobile, code))

        request = self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "+91 98765 43210", "consent": True},
            format="json",
        )
        self.assertEqual(request.status_code, 200)
        self.assertEqual(sent_codes[0][0], "9876543210")
        challenge = OTPChallenge.objects.get(mobile="9876543210")
        self.assertNotEqual(challenge.code_hash, sent_codes[0][1])
        self.assertTrue(check_password(sent_codes[0][1], challenge.code_hash))

        verify = self.client.post(
            "/api/auth/otp/verify/",
            {"mobile": "9876543210", "code": sent_codes[0][1]},
            format="json",
        )
        self.assertEqual(verify.status_code, 200)
        self.assertEqual(verify.data["home"], "/sobo/resident")
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 200)  # session cookie works
        self.assertTrue(User.objects.filter(mobile="9876543210").exists())
        profile = Profile.objects.get(id__mobile="9876543210")
        self.assertIsNotNone(profile.consent_at)
        self.assertEqual(profile.consent_version, settings.OTP_CONSENT_VERSION)
        self.assertIsNotNone(OTPChallenge.objects.get(mobile="9876543210").consumed_at)

        replay = self.client.post(
            "/api/auth/otp/verify/",
            {"mobile": "9876543210", "code": sent_codes[0][1]},
            format="json",
        )
        self.assertEqual(replay.status_code, 400)

    @patch("accounts.views.send_login_otp")
    def test_mobile_otp_request_is_rate_limited(self, send_otp):
        first = self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "9876543210", "consent": True},
            format="json",
        )
        second = self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "9876543210", "consent": True},
            format="json",
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(send_otp.call_count, 1)

    @patch("accounts.views.send_login_otp")
    def test_invalid_mobile_and_wrong_codes_are_rejected(self, send_otp):
        invalid = self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "123", "consent": True},
            format="json",
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertFalse(OTPChallenge.objects.exists())

        send_otp.side_effect = lambda mobile, code: None
        self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "9876543210", "consent": True},
            format="json",
        )
        for _ in range(5):
            wrong_code = self.client.post(
                "/api/auth/otp/verify/",
                {"mobile": "9876543210", "code": "000000"},
                format="json",
            )
        self.assertEqual(wrong_code.status_code, 400)
        self.assertFalse(User.objects.filter(mobile="9876543210").exists())

    def test_otp_request_requires_explicit_consent(self):
        missing = self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "9876543210"},
            format="json",
        )
        declined = self.client.post(
            "/api/auth/otp/request/",
            {"mobile": "9876543210", "consent": False},
            format="json",
        )
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(declined.status_code, 400)
        self.assertFalse(OTPChallenge.objects.exists())


class GoogleLoginTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.claims = {
            "aud": "test-client.apps.googleusercontent.com",
            "iss": "https://accounts.google.com",
            "exp": str(int(__import__("time").time()) + 600),
            "email": "Owner@Gmail.com",
            "email_verified": "true",
            "sub": "1234567890",
            "given_name": "Hetal",
            "family_name": "Shah",
            "name": "Hetal Shah",
        }

    def login(self, claims):
        from unittest import mock
        from django.test import override_settings
        with override_settings(GOOGLE_CLIENT_ID="test-client.apps.googleusercontent.com"), \
                mock.patch("accounts.google.fetch_token_info", return_value=claims):
            return self.client.post("/api/auth/google/", {"credential": "x" * 40}, format="json")

    def test_new_google_user_gets_token_and_account(self):
        response = self.login(self.claims)
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="owner@gmail.com")
        self.assertEqual(user.first_name, "Hetal")
        self.assertFalse(user.has_usable_password())
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.json()["email"], "owner@gmail.com")

    def test_existing_email_signs_into_same_account(self):
        existing = User.objects.create_user(username="old", email="owner@gmail.com", password="x")
        response = self.login(self.claims)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(email__iexact="owner@gmail.com").count(), 1)
        self.assertEqual(self.client.session["_auth_user_id"], str(existing.pk))

    def test_rejects_token_for_another_app(self):
        response = self.login({**self.claims, "aud": "someone-else"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(User.objects.filter(email__iexact="owner@gmail.com").exists())

    def test_rejects_unverified_email(self):
        self.assertEqual(self.login({**self.claims, "email_verified": "false"}).status_code, 400)

    def test_rejects_expired_token(self):
        self.assertEqual(self.login({**self.claims, "exp": "100"}).status_code, 400)

    def test_inactive_user_cannot_sign_in(self):
        User.objects.create_user(username="off", email="owner@gmail.com", is_active=False)
        self.assertEqual(self.login(self.claims).status_code, 403)

    def test_not_configured_returns_503(self):
        from django.test import override_settings
        with override_settings(GOOGLE_CLIENT_ID=""):
            response = self.client.post("/api/auth/google/", {"credential": "x"}, format="json")
        self.assertEqual(response.status_code, 503)


@override_settings(ALLOW_PASSWORD_LOGIN=True)
class DemoEmailLoginTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()

    def post(self, email):
        return self.client.post("/api/auth/demo-email/", {"email": email}, format="json")

    @override_settings(DEMO_EMAIL_LOGIN=False)
    def test_disabled_by_default(self):
        self.assertEqual(self.post("a@b.com").status_code, 404)
        self.assertFalse(User.objects.filter(email="a@b.com").exists())

    @override_settings(DEMO_EMAIL_LOGIN=True)
    def test_any_email_signs_in_and_reuses_account(self):
        first = self.post("Riya.Shah@Gmail.com")
        self.assertEqual(first.status_code, 200)
        second = self.post("riya.shah@gmail.com")
        self.assertEqual(second.status_code, 200)
        user = User.objects.get(email="riya.shah@gmail.com")
        self.assertEqual(self.client.session["_auth_user_id"], str(user.pk))
        self.assertEqual((user.first_name, user.last_name), ("Riya", "Shah"))

    @override_settings(DEMO_EMAIL_LOGIN=True)
    def test_rejects_bad_email(self):
        self.assertEqual(self.post("not-an-email").status_code, 400)

    @override_settings(DEMO_EMAIL_LOGIN=True)
    def test_never_signs_into_admin_accounts(self):
        from .models import AdminRole
        staff = User.objects.create_user(username="boss", email="boss@mysobo.in", password="x", is_staff=True)
        admin = User.objects.create_user(username="ops", email="ops@mysobo.in", password="x")
        AdminRole.objects.create(user=admin, role=AdminRole.Role.SUPER_ADMIN)
        self.assertEqual(self.post("boss@mysobo.in").status_code, 403)
        self.assertEqual(self.post("ops@mysobo.in").status_code, 403)
        self.assertFalse(Token.objects.filter(user__in=[staff, admin]).exists())


@override_settings(ALLOW_PASSWORD_LOGIN=True)
class EmailPasswordAuthTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()  # throttle counters
        self.client = APIClient()

    def register(self, **body):
        data = {"name": "Hetal Shah", "email": "hetal@example.com", "password": "Neem-leaf-2026"}
        data.update(body)
        return self.client.post("/api/auth/email/register/", data, format="json")

    def test_signup_then_login_with_any_valid_email(self):
        response = self.register()
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["home"], "/sobo/resident")
        self.assertNotIn("token", response.json())  # nothing secret for the browser to store
        self.assertIn("mysobo_session", response.cookies)
        self.assertTrue(response.cookies["mysobo_session"]["httponly"])
        me = self.client.get("/api/auth/me/")
        self.assertEqual(me.status_code, 200)
        user = User.objects.get(email="hetal@example.com")
        self.assertEqual(user.first_name, "Hetal")
        self.assertTrue(user.check_password("Neem-leaf-2026"))
        # Logging out ends the session but keeps the account.
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 204)
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        self.assertTrue(User.objects.filter(pk=user.pk).exists())
        login = self.client.post("/api/auth/email/login/", {"email": "HETAL@example.com", "password": "Neem-leaf-2026"}, format="json")
        self.assertEqual(login.status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me/").json()["email"], "hetal@example.com")

    def test_owner_signup_goes_to_owner_dashboard_and_session_lasts_30_days(self):
        response = self.register(account_type="business_owner", email="owner2@example.com")
        self.assertEqual(response.json()["home"], "/sobo/business-owner")
        self.assertEqual(self.client.session.get_expiry_age(), 30 * 24 * 60 * 60)
        me = self.client.get("/api/auth/me/").json()
        self.assertEqual((me["account_type"], me["home"]), ("business_owner", "/sobo/business-owner"))

    def test_csrf_is_enforced_for_session_requests(self):
        self.register()
        strict = APIClient(enforce_csrf_checks=True)
        strict.cookies = self.client.cookies
        blocked = strict.patch("/api/me/preferences/", {"theme": "dark"}, format="json")
        self.assertEqual(blocked.status_code, 403)
        strict.get("/api/auth/csrf/")
        token = strict.cookies["csrftoken"].value
        ok = strict.patch("/api/me/preferences/", {"theme": "dark"}, format="json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["theme"], "dark")

    def test_clear_errors(self):
        self.assertEqual(self.register(email="not-an-email").json()["field"], "email")
        self.assertEqual(self.register(name="").json()["field"], "name")
        weak = self.register(password="12345678")
        self.assertEqual(weak.status_code, 400)
        self.assertEqual(weak.json()["field"], "password")
        self.assertEqual(self.register(password="short").json()["field"], "password")
        self.register()
        again = self.register()
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.json()["code"], "exists")
        wrong = self.client.post("/api/auth/email/login/", {"email": "hetal@example.com", "password": "nope-nope-1"}, format="json")
        self.assertEqual(wrong.status_code, 400)
        self.assertEqual(wrong.json()["detail"], "Email or password is incorrect.")
        missing = self.client.post("/api/auth/email/login/", {"email": "nobody@example.com", "password": "whatever-123"}, format="json")
        self.assertEqual(missing.json()["detail"], "Email or password is incorrect.")

    def test_staff_can_log_in_with_username(self):
        User.objects.create_user(username="ops", password="Ops-pass-2026", is_staff=True)
        response = self.client.post("/api/auth/email/login/", {"email": "ops", "password": "Ops-pass-2026"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_cannot_take_over_admin_or_password_accounts(self):
        admin = User.objects.create_user(username="boss", email="boss@example.com")
        admin.set_unusable_password()
        admin.is_staff = True
        admin.save()
        with self.settings(DEMO_EMAIL_LOGIN=True):
            self.assertEqual(self.register(email="boss@example.com").status_code, 409)
        admin.refresh_from_db()
        self.assertFalse(admin.has_usable_password())

    def test_preview_accounts_can_set_a_password_only_in_preview_mode(self):
        user = User.objects.create_user(username="demo-x", email="demo@example.com")
        user.set_unusable_password()
        user.save()
        with self.settings(DEMO_EMAIL_LOGIN=False):
            self.assertEqual(self.register(email="demo@example.com").status_code, 409)
        with self.settings(DEMO_EMAIL_LOGIN=True):
            self.assertEqual(self.register(email="demo@example.com").status_code, 201)
        user.refresh_from_db()
        self.assertTrue(user.check_password("Neem-leaf-2026"))



class GoogleOnlyTests(TestCase):
    def setUp(self):
        from django.core.cache import cache
        cache.clear()
        self.client = APIClient()
        self.claims = {
            "aud": "test-client.apps.googleusercontent.com", "iss": "https://accounts.google.com",
            "exp": str(int(__import__("time").time()) + 600), "email": "new@gmail.com", "email_verified": "true",
            "sub": "g-42", "given_name": "Mira", "family_name": "Desai", "name": "Mira Desai", "picture": "https://lh3.googleusercontent.com/a/x",
        }

    def login(self, claims, **body):
        from unittest import mock
        with override_settings(GOOGLE_CLIENT_ID="test-client.apps.googleusercontent.com"), \
                mock.patch("accounts.google.fetch_token_info", return_value=claims):
            return self.client.post("/api/auth/google/", {"credential": "x" * 40, **body}, format="json")

    def test_new_user_gets_identity_profile_and_chosen_role(self):
        from accounts.models import Profile, SocialIdentity
        response = self.login(self.claims, account_type="business_owner")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(response.json()["new"])
        self.assertEqual(response.json()["home"], "/sobo/business-owner")
        identity = SocialIdentity.objects.get(subject="g-42")
        self.assertEqual((identity.email, identity.name, identity.provider), ("new@gmail.com", "Mira Desai", "google"))
        self.assertEqual(Profile.objects.get(id=identity.user).account_type, "business_owner")

    def test_returning_user_matched_by_google_id_even_if_email_changes(self):
        first = self.login(self.claims)
        self.client.post("/api/auth/logout/")
        again = self.login({**self.claims, "email": "mira.new@gmail.com"}, account_type="business_owner")
        self.assertFalse(again.json()["new"])
        self.assertEqual(User.objects.filter(identities__subject="g-42").count(), 1)
        self.assertEqual(User.objects.count(), 1)
        from accounts.models import Profile
        self.assertEqual(Profile.objects.get().account_type, "resident")  # role is only chosen at sign-up
        self.assertEqual(first.status_code, 200)

    def test_other_methods_are_off_by_default(self):
        for path, body in (("/api/auth/email/login/", {"email": "a@b.c", "password": "x"}),
                           ("/api/auth/email/register/", {"name": "Ab", "email": "a@b.c", "password": "x"}),
                           ("/api/auth/otp/request/", {"mobile": "9876543210", "consent": True}),
                           ("/api/auth/demo-email/", {"email": "a@b.c"})):
            response = self.client.post(path, body, format="json")
            self.assertEqual(response.status_code, 404, path)
            self.assertEqual(response.json()["code"], "google_only")

    def test_config_endpoint(self):
        with override_settings(GOOGLE_CLIENT_ID="abc.apps.googleusercontent.com"):
            data = self.client.get("/api/auth/config/").json()
        self.assertEqual(data, {"google_client_id": "abc.apps.googleusercontent.com", "google_enabled": True, "password_login": False})

    def test_dashboards_need_sign_in(self):
        self.assertIn(self.client.get("/api/auth/me/").status_code, (401, 403))
        self.assertIn(self.client.get("/api/owner/businesses/").status_code, (401, 403))
        self.assertIn(self.client.get("/api/admin/overview/").status_code, (401, 403))
