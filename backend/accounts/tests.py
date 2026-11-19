from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import OTPChallenge, Profile, User
from .otp import send_login_otp


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
        self.assertTrue(verify.data["token"])
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
