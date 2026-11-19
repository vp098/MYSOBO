from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.operations import CryptoExtension, TrigramExtension, UnaccentExtension
from django.db import migrations


EXTENSION_OPERATIONS = (TrigramExtension(), UnaccentExtension(), CryptoExtension())
SEARCH_INDEXES = (
    GinIndex(fields=["name"], opclasses=["gin_trgm_ops"], name="business_name_trgm_idx"),
    GinIndex(
        fields=["description"],
        opclasses=["gin_trgm_ops"],
        name="business_description_trgm_idx",
    ),
)


def install_postgresql_extensions(apps, schema_editor):
    for operation in EXTENSION_OPERATIONS:
        operation.database_forwards("directory", schema_editor, None, None)


def uninstall_postgresql_extensions(apps, schema_editor):
    for operation in reversed(EXTENSION_OPERATIONS):
        operation.database_backwards("directory", schema_editor, None, None)


def create_search_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    business_model = apps.get_model("directory", "Business")
    for index in SEARCH_INDEXES:
        schema_editor.add_index(business_model, index)


def remove_search_indexes(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    business_model = apps.get_model("directory", "Business")
    for index in reversed(SEARCH_INDEXES):
        schema_editor.remove_index(business_model, index)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_profile_consent_and_active_otp_constraint"),
        ("directory", "0007_postgresql_row_level_security"),
    ]

    operations = [
        migrations.RunPython(
            install_postgresql_extensions,
            uninstall_postgresql_extensions,
        ),
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(create_search_indexes, remove_search_indexes),
            ],
            state_operations=[
                migrations.AddIndex(
                    model_name="business",
                    index=SEARCH_INDEXES[0],
                ),
                migrations.AddIndex(
                    model_name="business",
                    index=SEARCH_INDEXES[1],
                ),
            ],
        ),
    ]
