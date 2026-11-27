"""Verify "Sign in with Google" ID tokens.

Google checks the token's signature and expiry at its tokeninfo endpoint; we
then make sure it was issued for this app and the email is verified. This
avoids adding a crypto dependency; swap for google-auth if traffic grows.
"""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
VALID_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleTokenError(Exception):
    pass


def fetch_token_info(credential: str) -> dict:
    data = urllib.parse.urlencode({"id_token": credential}).encode()
    request = urllib.request.Request(TOKENINFO_URL, data=data, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        raise GoogleTokenError("Google could not verify this sign-in.") from error
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        raise GoogleTokenError("Could not reach Google. Try again.") from error


def verify_google_credential(credential: str) -> dict:
    if not credential or len(credential) > 4096:
        raise GoogleTokenError("Missing Google sign-in token.")
    claims = fetch_token_info(credential)
    if claims.get("aud") != settings.GOOGLE_CLIENT_ID:
        raise GoogleTokenError("This sign-in was not issued for MySobo.")
    if claims.get("iss") not in VALID_ISSUERS:
        raise GoogleTokenError("This sign-in was not issued by Google.")
    try:
        expires = int(claims.get("exp", 0))
    except (TypeError, ValueError):
        expires = 0
    if expires <= int(time.time()):
        raise GoogleTokenError("This Google sign-in has expired. Try again.")
    if str(claims.get("email_verified")).lower() != "true" or not claims.get("email"):
        raise GoogleTokenError("Use a Google account with a verified email address.")
    if not claims.get("sub"):
        raise GoogleTokenError("Google did not return an account id.")
    return claims
