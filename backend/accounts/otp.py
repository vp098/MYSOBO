import base64
import logging
import re
import secrets
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import connection


logger = logging.getLogger(__name__)


class OTPDeliveryError(Exception):
    pass


def normalize_mobile_number(value):
    if not isinstance(value, str) or not re.fullmatch(r"[+\d\s()-]+", value.strip()):
        raise ValueError("Enter a valid Indian mobile number.")
    digits = re.sub(r"\D", "", value)
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10 or digits[0] not in "6789":
        raise ValueError("Enter a valid 10-digit Indian mobile number.")
    return digits


def generate_otp():
    return f"{secrets.randbelow(900000) + 100000:06d}"


def set_otp_rls_context(mobile, ip_address):
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT set_config('mysobo.otp_mobile', %s, true), "
            "set_config('mysobo.otp_ip', %s, true)",
            [mobile, ip_address or ""],
        )


def set_authenticated_user_rls_context(user_id):
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT set_config('mysobo.user_id', %s, true)",
            [str(user_id)],
        )


def send_login_otp(mobile, code):
    backend = getattr(settings, "OTP_SMS_BACKEND", "console" if settings.DEBUG else "twilio")
    if backend == "console":
        if not settings.DEBUG:
            raise ImproperlyConfigured("The console OTP backend is only available in DEBUG mode.")
        logger.warning("Development-only MySobo OTP: %s", code)
        return
    if backend != "twilio":
        raise ImproperlyConfigured("OTP_SMS_BACKEND must be 'console' or 'twilio'.")

    account_sid = getattr(settings, "TWILIO_ACCOUNT_SID", "")
    auth_token = getattr(settings, "TWILIO_AUTH_TOKEN", "")
    from_number = getattr(settings, "TWILIO_FROM_NUMBER", "")
    if not account_sid or not auth_token or not from_number:
        raise OTPDeliveryError("SMS delivery is not configured.")

    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    payload = urlencode({
        "From": from_number,
        "To": f"+91{mobile}",
        "Body": f"Your MySobo verification code is {code}. It expires in 5 minutes.",
    }).encode()
    credentials = base64.b64encode(f"{account_sid}:{auth_token}".encode()).decode()
    request = Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            if response.status not in (200, 201):
                raise OTPDeliveryError("SMS provider did not accept the message.")
    except HTTPError as error:
        logger.error("SMS provider rejected OTP delivery with HTTP status %s.", error.code)
        raise OTPDeliveryError("SMS provider rejected the message.") from error
    except (URLError, TimeoutError) as error:
        logger.error("SMS provider could not be reached for OTP delivery.")
        raise OTPDeliveryError("SMS provider could not be reached.") from error
