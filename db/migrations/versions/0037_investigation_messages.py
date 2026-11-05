"""Add persisted evidence-grounded investigation conversations.

Revision ID: 0037_investigation_messages
Revises: 0036_multiuser_security
Create Date: 2026-10-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "0037_investigation_messages"
down_revision: Union[str, None] = "0036_multiuser_security"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "investigation_messages",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("investigation_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=10), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("citations", sa.JSON(), nullable=True),
        sa.Column("model_used", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_investigation_messages_role",
        ),
        sa.ForeignKeyConstraint(
            ["investigation_id"], ["investigations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_investigation_messages_investigation_created",
        "investigation_messages",
        ["investigation_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_investigation_messages_user_id",
        "investigation_messages",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        "ix_pages_investigation_id",
        "pages",
        ["investigation_id"],
        unique=False,
    )
    op.create_index(
        "ix_investigation_entity_links_page_id",
        "investigation_entity_links",
        ["page_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_investigation_entity_links_page_id",
        table_name="investigation_entity_links",
    )
    op.drop_index("ix_pages_investigation_id", table_name="pages")
    op.drop_index(
        "ix_investigation_messages_user_id",
        table_name="investigation_messages",
    )
    op.drop_index(
        "ix_investigation_messages_investigation_created",
        table_name="investigation_messages",
    )
    op.drop_table("investigation_messages")
