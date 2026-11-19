from django.db import migrations


RLS_FUNCTIONS = """
CREATE OR REPLACE FUNCTION public.mysobo_rls_user_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT NULLIF(current_setting('mysobo.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION public.mysobo_rls_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT COALESCE((
        SELECT u.is_superuser
        FROM public.accounts_user AS u
        WHERE u.id = public.mysobo_rls_user_id()
    ), false)
    OR EXISTS (
        SELECT 1
        FROM public.accounts_adminrole AS r
        WHERE r.user_id = public.mysobo_rls_user_id()
          AND r.role = 'super_admin'
    )
$$;

CREATE OR REPLACE FUNCTION public.mysobo_rls_is_member(target_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT public.mysobo_rls_is_admin()
    OR EXISTS (
        SELECT 1
        FROM public.directory_businessmember AS m
        WHERE m.business_id = target_business_id
          AND m.user_id = public.mysobo_rls_user_id()
    )
$$;

CREATE OR REPLACE FUNCTION public.mysobo_rls_is_public_business(target_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.directory_business AS b
        WHERE b.id = target_business_id
          AND b.hidden = false
          AND b.deleted_at IS NULL
    )
$$;
"""


POLICIES = {
    "accounts.Profile": [
        ("profile_read_own", "SELECT", "id_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", None),
        ("profile_write_own", "ALL", "id_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", "id_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()"),
    ],
    "accounts.OTPChallenge": [
        (
            "otp_current_request_only",
            "ALL",
            "mobile = NULLIF(current_setting('mysobo.otp_mobile', true), '') OR request_ip::text = NULLIF(current_setting('mysobo.otp_ip', true), '')",
            "mobile = NULLIF(current_setting('mysobo.otp_mobile', true), '') OR request_ip::text = NULLIF(current_setting('mysobo.otp_ip', true), '')",
        ),
    ],
    "directory.Category": [
        ("category_public_read", "SELECT", "active", None),
        ("category_admin_manage", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "directory.Subcategory": [
        ("subcategory_public_read", "SELECT", "active AND approved AND EXISTS (SELECT 1 FROM public.directory_category AS c WHERE c.id = category_id AND c.active)", None),
        ("subcategory_admin_manage", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "directory.CategoryField": [
        ("category_field_public_read", "SELECT", "active AND EXISTS (SELECT 1 FROM public.directory_category AS c WHERE c.id = category_id AND c.active)", None),
        ("category_field_admin_manage", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "directory.Business": [
        ("business_read_visible_or_owned", "SELECT", "deleted_at IS NULL AND (hidden = false OR created_by_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_member(id) OR public.mysobo_rls_is_admin())", None),
        ("business_owner_create", "INSERT", None, "public.mysobo_rls_is_admin() OR (created_by_id = public.mysobo_rls_user_id() AND source = 'owner' AND hidden = true AND verification_level = 0)"),
        ("business_member_update", "UPDATE", "public.mysobo_rls_is_admin() OR public.mysobo_rls_is_member(id)", "public.mysobo_rls_is_admin() OR public.mysobo_rls_is_member(id)"),
        ("business_admin_delete", "DELETE", "public.mysobo_rls_is_admin()", None),
    ],
    "directory.BusinessMember": [
        ("business_member_read_self", "SELECT", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", None),
        ("business_member_create_owner", "INSERT", None, "public.mysobo_rls_is_admin() OR (user_id = public.mysobo_rls_user_id() AND role = 'owner' AND EXISTS (SELECT 1 FROM public.directory_business AS b WHERE b.id = business_id AND b.created_by_id = public.mysobo_rls_user_id()))"),
        ("business_member_update_admin", "UPDATE", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
        ("business_member_delete_self_admin", "DELETE", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", None),
    ],
    "directory.SavedBusiness": [
        ("saved_business_owner_only", "ALL", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()"),
    ],
    "directory.Review": [
        ("review_public_read", "SELECT", "public.mysobo_rls_is_public_business(business_id) OR public.mysobo_rls_is_admin()", None),
        ("review_author_create", "INSERT", None, "user_id = public.mysobo_rls_user_id() AND public.mysobo_rls_is_public_business(business_id)"),
        ("review_author_update", "UPDATE", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()"),
        ("review_author_delete", "DELETE", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", None),
    ],
    "directory.Claim": [
        ("claim_participant_read", "SELECT", "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", None),
        ("claim_owner_create", "INSERT", None, "user_id = public.mysobo_rls_user_id() AND status = 'pending'"),
        ("claim_admin_update", "UPDATE", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
        ("claim_admin_delete", "DELETE", "public.mysobo_rls_is_admin()", None),
    ],
    "directory.BusinessHour": [
        ("business_hours_read", "SELECT", "public.mysobo_rls_is_public_business(business_id) OR public.mysobo_rls_is_member(business_id)", None),
        ("business_hours_manage", "ALL", "public.mysobo_rls_is_member(business_id)", "public.mysobo_rls_is_member(business_id)"),
    ],
    "directory.BusinessPhoto": [
        ("business_photos_read", "SELECT", "public.mysobo_rls_is_public_business(business_id) OR public.mysobo_rls_is_member(business_id)", None),
        ("business_photos_manage", "ALL", "public.mysobo_rls_is_member(business_id)", "public.mysobo_rls_is_member(business_id)"),
    ],
    "directory.BusinessPost": [
        ("business_posts_read", "SELECT", "(status = 'approved' AND public.mysobo_rls_is_public_business(business_id)) OR public.mysobo_rls_is_member(business_id)", None),
        ("business_posts_manage", "ALL", "public.mysobo_rls_is_member(business_id)", "public.mysobo_rls_is_member(business_id)"),
    ],
    "directory.BusinessProduct": [
        ("products_public_read", "SELECT", "(active AND available AND public.mysobo_rls_is_public_business(business_id)) OR public.mysobo_rls_is_member(business_id)", None),
        ("products_owner_manage", "ALL", "public.mysobo_rls_is_member(business_id)", "public.mysobo_rls_is_member(business_id)"),
    ],
    "directory.BusinessService": [
        ("services_public_read", "SELECT", "(active AND available AND public.mysobo_rls_is_public_business(business_id)) OR public.mysobo_rls_is_member(business_id)", None),
        ("services_owner_manage", "ALL", "public.mysobo_rls_is_member(business_id)", "public.mysobo_rls_is_member(business_id)"),
    ],
    "directory.Report": [
        ("reporter_read_own", "SELECT", "reporter_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()", None),
        ("reporter_create", "INSERT", None, "reporter_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin()"),
        ("report_admin_update", "UPDATE", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
        ("report_admin_delete", "DELETE", "public.mysobo_rls_is_admin()", None),
    ],
    "directory.AuditLog": [
        ("audit_admin_only", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "directory.Event": [
        (
            "event_user_or_public_contact",
            "ALL",
            "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin() OR "
            "(user_id IS NULL AND type IN ('call', 'whatsapp') "
            "AND public.mysobo_rls_is_public_business(business_id))",
            "user_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_admin() OR "
            "(user_id IS NULL AND type IN ('call', 'whatsapp') "
            "AND public.mysobo_rls_is_public_business(business_id))",
        ),
    ],
    "directory.EventDaily": [
        ("event_daily_admin_only", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "billing.PlanPrice": [
        ("plan_price_public_read", "SELECT", "active", None),
        ("plan_price_admin_manage", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "billing.Subscription": [
        ("subscription_owner_read", "SELECT", "public.mysobo_rls_is_member(business_id)", None),
        ("subscription_admin_manage", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "billing.SubscriptionRequest": [
        ("subscription_request_participant_read", "SELECT", "requested_by_id = public.mysobo_rls_user_id() OR public.mysobo_rls_is_member(business_id)", None),
        ("subscription_request_owner_create", "INSERT", None, "requested_by_id = public.mysobo_rls_user_id() AND public.mysobo_rls_is_member(business_id) AND status = 'pending'"),
        ("subscription_request_admin_update", "UPDATE", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
        ("subscription_request_admin_delete", "DELETE", "public.mysobo_rls_is_admin()", None),
    ],
    "billing.Payment": [
        ("payment_business_read", "SELECT", "EXISTS (SELECT 1 FROM public.billing_subscription AS s WHERE s.id = subscription_id AND public.mysobo_rls_is_member(s.business_id))", None),
        ("payment_admin_manage", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "billing.Invoice": [
        ("invoice_business_read", "SELECT", "EXISTS (SELECT 1 FROM public.billing_payment AS p JOIN public.billing_subscription AS s ON s.id = p.subscription_id WHERE p.id = payment_id AND public.mysobo_rls_is_member(s.business_id))", None),
        ("invoice_admin_manage", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
    "billing.AppSetting": [
        ("app_setting_admin_only", "ALL", "public.mysobo_rls_is_admin()", "public.mysobo_rls_is_admin()"),
    ],
}


def install_rls(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    schema_editor.execute(RLS_FUNCTIONS)
    for model_label, policies in POLICIES.items():
        model = apps.get_model(*model_label.split("."))
        table = schema_editor.quote_name(model._meta.db_table)
        schema_editor.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        for policy_name, command, using, check in policies:
            quoted_policy = schema_editor.quote_name(policy_name)
            schema_editor.execute(f"DROP POLICY IF EXISTS {quoted_policy} ON {table}")
            statement = f"CREATE POLICY {quoted_policy} ON {table} FOR {command}"
            if using:
                statement += f" USING ({using})"
            if check:
                statement += f" WITH CHECK ({check})"
            schema_editor.execute(statement)


def remove_rls(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return

    for model_label, policies in reversed(list(POLICIES.items())):
        model = apps.get_model(*model_label.split("."))
        table = schema_editor.quote_name(model._meta.db_table)
        for policy_name, _, _, _ in policies:
            quoted_policy = schema_editor.quote_name(policy_name)
            schema_editor.execute(f"DROP POLICY IF EXISTS {quoted_policy} ON {table}")
        schema_editor.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    schema_editor.execute("DROP FUNCTION IF EXISTS public.mysobo_rls_is_public_business(uuid)")
    schema_editor.execute("DROP FUNCTION IF EXISTS public.mysobo_rls_is_member(uuid)")
    schema_editor.execute("DROP FUNCTION IF EXISTS public.mysobo_rls_is_admin()")
    schema_editor.execute("DROP FUNCTION IF EXISTS public.mysobo_rls_user_id()")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_otpchallenge"),
        ("billing", "0002_subscriptionrequest"),
        ("directory", "0006_business_category_data_business_cover_image_and_more"),
    ]

    operations = [
        migrations.RunPython(install_rls, remove_rls),
    ]
