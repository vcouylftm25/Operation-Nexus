"""persist host-released evidence

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-18 00:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "evidence_reveals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_id", sa.String(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("revealed_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["game_id"], ["games.id"], name="fk_evidence_reveals_game_id_games", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_evidence_reveals"),
        sa.UniqueConstraint(
            "game_id", "evidence_id", name="uq_evidence_reveals_game_evidence"
        ),
    )
    op.create_index("ix_evidence_reveals_game_id", "evidence_reveals", ["game_id"])


def downgrade() -> None:
    op.drop_index("ix_evidence_reveals_game_id", table_name="evidence_reveals")
    op.drop_table("evidence_reveals")
