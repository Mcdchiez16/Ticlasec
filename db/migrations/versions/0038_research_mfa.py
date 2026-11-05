"""Individual encrypted TOTP factors; no legacy user or investigation changes."""
from alembic import op
import sqlalchemy as sa

revision = "0038_research_mfa"
down_revision = "0037_investigation_messages"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("user_mfa",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("encrypted_secret", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("pending_until", sa.BigInteger(), nullable=False),
        sa.Column("last_counter", sa.BigInteger(), nullable=False, server_default="-1"),
        sa.Column("recovery_hashes", sa.Text(), nullable=False, server_default="[]"))


def downgrade():
    op.drop_table("user_mfa")
