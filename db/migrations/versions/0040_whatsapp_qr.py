"""Distinguish official API links from per-user QR-linked device sessions."""
from alembic import op
import sqlalchemy as sa

revision = "0040_whatsapp_qr"
down_revision = "0039_channels"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("channel_connections", sa.Column("transport", sa.String(16), nullable=False, server_default="api"))


def downgrade():
    op.drop_column("channel_connections", "transport")
