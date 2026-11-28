from django.db import migrations

# Django's icontains on Postgres compiles to UPPER(col::text) LIKE UPPER(%term%),
# so these trigram indexes are on the same expression. SQLite (local tests) skips this.
INDEXES = [
    ("directory_business", "name", "business_name_trgm_idx"),
    ("directory_business", "description", "business_desc_trgm_idx"),
    ("directory_category", "name", "category_name_trgm_idx"),
    ("directory_subcategory", "name", "subcategory_name_trgm_idx"),
    ("directory_businessservice", "name", "service_name_trgm_idx"),
    ("directory_businessproduct", "name", "product_name_trgm_idx"),
]


def _trgm_schema(cursor):
    cursor.execute(
        "SELECT n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_trgm'"
    )
    row = cursor.fetchone()
    return row[0] if row else None


def add_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        schema = _trgm_schema(cursor)
        if schema is None:
            cursor.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
            schema = _trgm_schema(cursor)
        for table, column, name in INDEXES:
            cursor.execute(
                f'CREATE INDEX IF NOT EXISTS {name} ON {table} '
                f'USING gin ((UPPER("{column}"::text)) "{schema}".gin_trgm_ops)'
            )


def drop_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for _, _, name in INDEXES:
            cursor.execute(f"DROP INDEX IF EXISTS {name}")


class Migration(migrations.Migration):
    dependencies = [("directory", "0014_savedbusiness_created_at")]
    operations = [migrations.RunPython(add_indexes, drop_indexes)]
