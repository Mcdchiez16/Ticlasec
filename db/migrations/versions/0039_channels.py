"""Private chat linking and replay protection; no existing case data changes."""
from alembic import op
import sqlalchemy as sa

revision = "0039_channels"
down_revision = "0038_research_mfa"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("channel_connections",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(100)),
        sa.Column("code_hash", sa.String(64), unique=True),
        sa.Column("code_expires_at", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("linked_at", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("last_inbound_at", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("last_command_at", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("last_investigation_at", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("model", sa.String(150), nullable=False, server_default="gpt-4o-mini"),
        sa.UniqueConstraint("user_id", "provider"),
        sa.UniqueConstraint("provider", "external_id"))
    op.create_table("channel_events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("provider", sa.String(20), nullable=False),
        sa.Column("external_id", sa.String(255), nullable=False),
        sa.Column("created_at", sa.BigInteger(), nullable=False),
        sa.UniqueConstraint("provider", "external_id"))
    op.create_index("ix_channel_events_created_at", "channel_events", ["created_at"])


def downgrade():
    op.drop_table("channel_events")
    op.drop_table("channel_connections")
