
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

import dj_database_url
from dotenv import load_dotenv
from django.core.exceptions import ImproperlyConfigured


# --------------------------------------------------
# BASE CONFIGURATION
# --------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env(name, default=None):
    value = os.getenv(name)
    return default if value in (None, "") else value


def env_bool(name, default):
    value = env(name, str(default)).strip().lower()

    if value not in ("true", "false"):
        raise ImproperlyConfigured(
            f"{name} must be 'true' or 'false'."
        )

    return value == "true"


# --------------------------------------------------
# DEBUG AND SECRET KEY
# --------------------------------------------------

DEBUG = env_bool("DJANGO_DEBUG", False)

SECRET_KEY = env("DJANGO_SECRET_KEY")

if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY must be configured in production."
        )

    SECRET_KEY = "local-development-only-not-for-production"

elif not DEBUG and SECRET_KEY.lower() in {
    "replace-me",
    "changeme",
    "development-only-change-me",
    "local-development-only-not-for-production",
}:
    raise ImproperlyConfigured(
        "DJANGO_SECRET_KEY must not use a placeholder in production."
    )


# --------------------------------------------------
# OTP CONFIGURATION
# --------------------------------------------------

IS_CI = env("CI", "false").strip().lower() == "true"

OTP_SMS_BACKEND = env(
    "OTP_SMS_BACKEND",
    "console" if DEBUG else "twilio"
).strip().lower()

if OTP_SMS_BACKEND not in ("console", "twilio", "mock"):
    raise ImproperlyConfigured(
        "OTP_SMS_BACKEND must be console, twilio, or mock."
    )

if OTP_SMS_BACKEND == "console" and not DEBUG:
    raise ImproperlyConfigured(
        "Console SMS backend is only allowed in DEBUG mode."
    )

if OTP_SMS_BACKEND == "mock" and not IS_CI:
    raise ImproperlyConfigured(
        "Mock SMS backend is only allowed in CI."
    )

TWILIO_ACCOUNT_SID = env("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = env("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = env("TWILIO_FROM_NUMBER", "")

OTP_CONSENT_VERSION = env(
    "OTP_CONSENT_VERSION",
    "mysobo-consent-v1"
)


# --------------------------------------------------
# ALLOWED HOSTS
# --------------------------------------------------

allowed_hosts = env("DJANGO_ALLOWED_HOSTS")

if not allowed_hosts:
    if not DEBUG:
        raise ImproperlyConfigured(
            "DJANGO_ALLOWED_HOSTS must be configured."
        )

    allowed_hosts = "localhost,127.0.0.1"

ALLOWED_HOSTS = [
    host.strip()
    for host in allowed_hosts.split(",")
    if host.strip()
]

if not ALLOWED_HOSTS:
    raise ImproperlyConfigured(
        "DJANGO_ALLOWED_HOSTS cannot be empty."
    )


# --------------------------------------------------
# INSTALLED APPS
# --------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",

    "corsheaders",
    "rest_framework",
    "rest_framework.authtoken",
    "drf_spectacular",

    "accounts",
    "directory",
    "billing",
]


# --------------------------------------------------
# MIDDLEWARE
# --------------------------------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "accounts.middleware.PostgreSQLRLSContextMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


# --------------------------------------------------
# URLS AND TEMPLATES
# --------------------------------------------------

ROOT_URLCONF = "mysobo.urls"

WSGI_APPLICATION = "mysobo.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# --------------------------------------------------
# DATABASE CONFIGURATION
# --------------------------------------------------

DATABASE_URL = env("DATABASE_URL")

if DATABASE_URL:
    parsed = urlparse(DATABASE_URL)

    if parsed.scheme in ("postgres", "postgresql"):

        if not parsed.hostname or not parsed.path.lstrip("/"):
            raise ImproperlyConfigured(
                "DATABASE_URL must contain a hostname and database name."
            )

        DATABASES = {
            "default": dj_database_url.parse(
                DATABASE_URL,
                conn_max_age=0,
                ssl_require=env_bool(
                    "DB_SSL_REQUIRED",
                    not DEBUG
                ),
            )
        }

    elif parsed.scheme == "sqlite" and DEBUG:

        database_name = (
            unquote(parsed.path.lstrip("/")) or ":memory:"
        )

        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": database_name,
            }
        }

    else:
        raise ImproperlyConfigured(
            "DATABASE_URL must use PostgreSQL in production. "
            "SQLite is allowed only in DEBUG mode."
        )

else:

    if not DEBUG:
        raise ImproperlyConfigured(
            "DATABASE_URL must be configured in production."
        )

    database_variables = (
        "DB_NAME",
        "DB_USER",
        "DB_PASSWORD",
        "DB_HOST",
        "DB_PORT",
    )

    missing_variables = [
        variable
        for variable in database_variables
        if not env(variable)
    ]

    if missing_variables:
        raise ImproperlyConfigured(
            "Missing database variables: "
            + ", ".join(missing_variables)
        )

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("DB_NAME"),
            "USER": env("DB_USER"),
            "PASSWORD": env("DB_PASSWORD"),
            "HOST": env("DB_HOST"),
            "PORT": env("DB_PORT"),
            "CONN_MAX_AGE": 0,
            "OPTIONS": {
                "sslmode": "require",
            },
        }
    }


# --------------------------------------------------
# AUTHENTICATION
# --------------------------------------------------

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "UserAttributeSimilarityValidator"
        )
    },
    {
        "NAME": (
            "django.contrib.auth.password_validation."
            "MinimumLengthValidator"
        )
    },
]


# --------------------------------------------------
# LANGUAGE AND TIMEZONE
# --------------------------------------------------

LANGUAGE_CODE = "en-us"

TIME_ZONE = "Asia/Kolkata"

USE_I18N = True

USE_TZ = True


# --------------------------------------------------
# STATIC AND MEDIA FILES
# --------------------------------------------------

STATIC_URL = "/static/"

STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"

MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"


# --------------------------------------------------
# CORS CONFIGURATION
# --------------------------------------------------

CORS_ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in env(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173"
        if DEBUG else "",
    ).split(",")
    if origin.strip()
]


# --------------------------------------------------
# CSRF CONFIGURATION
# --------------------------------------------------

CSRF_TRUSTED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in env(
        "CSRF_TRUSTED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173"
        if DEBUG else "",
    ).split(",")
    if origin.strip()
]


# --------------------------------------------------
# DJANGO REST FRAMEWORK
# --------------------------------------------------

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly"
    ],
    "DEFAULT_PAGINATION_CLASS": (
        "rest_framework.pagination.PageNumberPagination"
    ),
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": (
        "drf_spectacular.openapi.AutoSchema"
    ),
    "DEFAULT_THROTTLE_RATES": {
        "business_contact_event": "60/min",
    },
}


# --------------------------------------------------
# PRODUCTION SECURITY
# --------------------------------------------------

if not DEBUG:

    SESSION_COOKIE_SECURE = True

    CSRF_COOKIE_SECURE = True

    SECURE_CONTENT_TYPE_NOSNIFF = True

    SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

    SECURE_PROXY_SSL_HEADER = (
        "HTTP_X_FORWARDED_PROTO",
        "https",
    )

    SECURE_HSTS_SECONDS = int(
        env("SECURE_HSTS_SECONDS", "31536000")
    )

    SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool(
        "SECURE_HSTS_INCLUDE_SUBDOMAINS",
        False
    )


# --------------------------------------------------
# API DOCUMENTATION
# --------------------------------------------------

SPECTACULAR_SETTINGS = {
    "TITLE": "MySobo API",
    "VERSION": "1.0.0",
}
