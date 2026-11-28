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

# "Sign in with Google": the OAuth client ID from Google Cloud Console.
GOOGLE_CLIENT_ID = env("GOOGLE_CLIENT_ID", "")

# Preview only: sign in with any email, no verification. Admin accounts are
# never allowed through it. MUST be false for launch.
DEMO_EMAIL_LOGIN = env_bool("DEMO_EMAIL_LOGIN", False)

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

# Vercel system variables: always match the current deployment host.
for _name in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
    _host = env(_name)
    if _host and _host not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(_host)

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
    "support",
]


# --------------------------------------------------
# MIDDLEWARE
# --------------------------------------------------

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
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
# Reuse database connections for up to this many seconds instead of opening a
# new one per request. Health checks drop dead connections before use.
DB_CONN_MAX_AGE = int(env("DB_CONN_MAX_AGE", "60"))
# Per-request limits, applied with SET LOCAL inside each request's transaction
# (safe behind the transaction pooler). Migrations and commands are not limited.
DB_STATEMENT_TIMEOUT_MS = int(env("DB_STATEMENT_TIMEOUT_MS", "5000"))
DB_LOCK_TIMEOUT_MS = int(env("DB_LOCK_TIMEOUT_MS", "3000"))

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
                conn_max_age=DB_CONN_MAX_AGE,
                conn_health_checks=True,
                ssl_require=env_bool(
                    "DB_SSL_REQUIRED",
                    not DEBUG
                ),
            )
        }
        # Serverless functions must not use Supabase's *session* pooler
        # (port 5432 on *.pooler.supabase.com): it allows only pool_size clients
        # (15) and every warm function instance keeps one, so it fills up
        # ("EMAXCONNSESSION max clients reached") and the whole API fails.
        # In production the same host is used in transaction mode (port 6543),
        # which serves many clients. DB_SESSION_POOLER=true keeps session mode.
        use_transaction_pooler = parsed.port == 6543 or env_bool("DB_TRANSACTION_POOLER", False)
        if (
            not DEBUG
            and (parsed.hostname or "").endswith(".pooler.supabase.com")
            and (parsed.port or 5432) == 5432
            and not env_bool("DB_SESSION_POOLER", False)
        ):
            DATABASES["default"]["PORT"] = 6543
            use_transaction_pooler = True
        # Supabase's transaction pooler (port 6543, Supavisor/PgBouncer) hands each
        # transaction to any server connection: no server-side cursors or
        # prepared statements can survive between transactions.
        if use_transaction_pooler:
            DATABASES["default"]["DISABLE_SERVER_SIDE_CURSORS"] = True
            DATABASES["default"].setdefault("OPTIONS", {})["prepare_threshold"] = None

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
            "CONN_MAX_AGE": DB_CONN_MAX_AGE,
            "CONN_HEALTH_CHECKS": True,
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
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
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

supabase_storage_values = {
    "url": env("SUPABASE_URL"),
    "bucket": env("SUPABASE_STORAGE_BUCKET"),
    "region": env("SUPABASE_STORAGE_REGION"),
    "access_key": env("SUPABASE_S3_ACCESS_KEY_ID"),
    "secret_key": env("SUPABASE_S3_SECRET_ACCESS_KEY"),
}
supabase_storage_configured = any(supabase_storage_values.values())
supabase_storage_missing = [name for name, value in supabase_storage_values.items() if not value]


def _supabase_project_ref(raw_url):
    """Project ref from SUPABASE_URL. Accepts https://<ref>.supabase.co with or
    without a trailing path (/rest/v1, /storage/v1, ...) or without https://."""
    value = (raw_url or "").strip()
    if value and "://" not in value:
        value = f"https://{value}"
    host = (urlparse(value).hostname or "").lower()
    if not host.endswith(".supabase.co"):
        return None
    labels = [label for label in host.removesuffix(".supabase.co").split(".") if label not in ("db", "storage", "pooler", "www")]
    return labels[0] if labels else None


# Media storage problems never stop the whole site. Without a working Storage
# setup, uploads answer 503 "not set up yet" and STORAGE_PROBLEM says why
# (setting names only, never values); /api/health/ reports it.
STORAGE_PROBLEM = ""
supabase_project_ref = None
if supabase_storage_configured:
    if supabase_storage_missing:
        STORAGE_PROBLEM = "Supabase Storage is missing: " + ", ".join(supabase_storage_missing)
    else:
        supabase_project_ref = _supabase_project_ref(supabase_storage_values["url"])
        if not supabase_project_ref:
            STORAGE_PROBLEM = "SUPABASE_URL must look like https://<project>.supabase.co"
elif not DEBUG and not IS_CI:
    STORAGE_PROBLEM = "Supabase Storage is not configured"

MEDIA_UPLOADS_ENABLED = bool(DEBUG or IS_CI or supabase_project_ref)

if supabase_project_ref:
    supabase_bucket = supabase_storage_values["bucket"]
    supabase_public_domain = (
        f"{supabase_project_ref}.supabase.co/storage/v1/object/public/{supabase_bucket}"
    )
    default_storage = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": supabase_bucket,
            "endpoint_url": (
                f"https://{supabase_project_ref}.storage.supabase.co/storage/v1/s3"
            ),
            "region_name": supabase_storage_values["region"],
            "access_key": supabase_storage_values["access_key"],
            "secret_key": supabase_storage_values["secret_key"],
            "addressing_style": "path",
            "custom_domain": supabase_public_domain,
            "querystring_auth": False,
            "file_overwrite": False,
        },
    }
else:
    default_storage = {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    }

STORAGES = {
    "default": default_storage,
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

# Fallback: if STATIC_ROOT is missing in the bundle, serve straight from
# the installed packages (e.g. Django admin assets).
WHITENOISE_USE_FINDERS = True

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
    "EXCEPTION_HANDLER": "mysobo.exceptions.api_exception_handler",
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
        "google_login": "20/min",
        "demo_login": "20/min",
        "photo_upload": "60/hour",
        "email_auth": "20/min",
        "support": "20/hour",
    },
}


# --------------------------------------------------
# BROWSER SESSIONS
# --------------------------------------------------
# The web app signs in with an httpOnly session cookie (no tokens in browser
# storage). In production the frontend proxies /api through its own domain
# (see frontend/vercel.json), so the cookie is first-party.

FRONTEND_URL = env("FRONTEND_URL", "https://mysobo.vercel.app").rstrip("/")

# Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" to /api/cron/billing/.
CRON_SECRET = env("CRON_SECRET", "") or ""

# MySobo signs people in with Google only. Email/password, mobile OTP and the
# preview demo login stay switched off unless this is set (local testing only).
ALLOW_PASSWORD_LOGIN = env_bool("ALLOW_PASSWORD_LOGIN", False)

# Initial Super Admin(s): Google accounts (verified email) that become Super
# Admin when they sign in. Server-side only; comma separated.
SUPERADMIN_EMAILS = {
    email.strip().lower() for email in (env("SUPERADMIN_EMAILS", "") or "").split(",") if email.strip()
}

# Seller details printed on invoices. Without a GSTIN the PDF says "INVOICE", not "TAX INVOICE".
INVOICE_SELLER_NAME = env("INVOICE_SELLER_NAME", "MySobo") or "MySobo"
INVOICE_SELLER_ADDRESS = env("INVOICE_SELLER_ADDRESS", "South Bopal, Ahmedabad, Gujarat") or ""
INVOICE_SELLER_GSTIN = (env("INVOICE_SELLER_GSTIN", "") or "").strip().upper()
for _origin in [FRONTEND_URL] + (["http://localhost:4173", "http://127.0.0.1:4173"] if DEBUG else []):
    if _origin and _origin not in CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS.append(_origin)

SESSION_COOKIE_NAME = "mysobo_session"
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30  # 30 days, renewed when the app is opened
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # the app reads it to send X-CSRFToken


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

# --------------------------------------------------
# LOGGING: errors go to the server log, never to API responses
# --------------------------------------------------

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "loggers": {
        "mysobo.api": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
    },
}
