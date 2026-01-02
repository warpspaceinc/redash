"""Add ontology column to data_sources table.

Revision ID: a1b2c3d4e5f6
Revises: e5c7a4e2df4d
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "a1b2c3d4e5f6"
down_revision = "db0aca1ebd32"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "data_sources",
        sa.Column(
            "ontology",
            sa.Text(),
            nullable=True,
        ),
    )


def downgrade():
    op.drop_column("data_sources", "ontology")
