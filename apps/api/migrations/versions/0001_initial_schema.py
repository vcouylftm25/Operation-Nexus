"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-08-17 00:00:00

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "games",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("scenario_slug", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("current_round", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_games"),
    )

    op.create_table(
        "rounds",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("credits_awarded", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("narrative", sa.String(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], name="fk_rounds_game_id_games", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_rounds"),
        sa.UniqueConstraint("game_id", "number", name="uq_rounds_game_number"),
    )
    op.create_index("ix_rounds_game_id", "rounds", ["game_id"])

    op.create_table(
        "teams",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("game_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("join_code", sa.String(), nullable=False),
        sa.Column("credits_balance", sa.Integer(), nullable=False),
        sa.Column("credits_total_awarded", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], name="fk_teams_game_id_games", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_teams"),
        sa.UniqueConstraint("game_id", "name", name="uq_teams_game_name"),
    )
    op.create_index("ix_teams_game_id", "teams", ["game_id"])
    op.create_index("ix_teams_join_code", "teams", ["join_code"], unique=True)

    op.create_table(
        "team_sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_team_sessions_team_id_teams", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_team_sessions"),
    )
    op.create_index("ix_team_sessions_team_id", "team_sessions", ["team_id"])
    op.create_index("ix_team_sessions_token_hash", "team_sessions", ["token_hash"], unique=True)

    op.create_table(
        "investigation_actions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("question", sa.String(), nullable=False),
        sa.Column("answer_text", sa.String(), nullable=False),
        sa.Column("plan", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("answer", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("credits_charged", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["team_id"], ["teams.id"], name="fk_investigation_actions_team_id_teams", ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name="pk_investigation_actions"),
    )
    op.create_index("ix_investigation_actions_team_id", "investigation_actions", ["team_id"])

    op.create_table(
        "discoveries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("node_id", sa.String(), nullable=True),
        sa.Column("relationship_id", sa.String(), nullable=True),
        sa.Column("source_action_id", sa.Uuid(), nullable=True),
        sa.Column("discovered_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_discoveries_team_id_teams", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["source_action_id"],
            ["investigation_actions.id"],
            name="fk_discoveries_source_action_id_investigation_actions",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_discoveries"),
        sa.UniqueConstraint("team_id", "node_id", name="uq_discoveries_team_node"),
        sa.UniqueConstraint("team_id", "relationship_id", name="uq_discoveries_team_relationship"),
        sa.CheckConstraint(
            "(node_id IS NOT NULL) <> (relationship_id IS NOT NULL)",
            name="ck_discoveries_node_xor_relationship",
        ),
    )
    op.create_index("ix_discoveries_team_id", "discoveries", ["team_id"])

    op.create_table(
        "score_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("rule", sa.String(), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("detail", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_score_events_team_id_teams", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_score_events"),
    )
    op.create_index("ix_score_events_team_id", "score_events", ["team_id"])

    op.create_table(
        "accusations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("accused_person_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("coordinator_person_id", sa.String(), nullable=False),
        sa.Column("pattern", sa.String(), nullable=False),
        sa.Column("evidence_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("key_relationship_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("rationale", sa.String(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("scored_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_accusations_team_id_teams", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name="pk_accusations"),
    )
    op.create_index("ix_accusations_team_id", "accusations", ["team_id"], unique=True)

    op.create_table(
        "ai_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("team_id", sa.Uuid(), nullable=False),
        sa.Column("investigation_action_id", sa.Uuid(), nullable=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=True),
        sa.Column("completion_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("raw_request", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("raw_response", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], name="fk_ai_runs_team_id_teams", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["investigation_action_id"],
            ["investigation_actions.id"],
            name="fk_ai_runs_investigation_action_id_investigation_actions",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ai_runs"),
    )
    op.create_index("ix_ai_runs_team_id", "ai_runs", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_runs_team_id", table_name="ai_runs")
    op.drop_table("ai_runs")

    op.drop_index("ix_accusations_team_id", table_name="accusations")
    op.drop_table("accusations")

    op.drop_index("ix_score_events_team_id", table_name="score_events")
    op.drop_table("score_events")

    op.drop_index("ix_discoveries_team_id", table_name="discoveries")
    op.drop_table("discoveries")

    op.drop_index("ix_investigation_actions_team_id", table_name="investigation_actions")
    op.drop_table("investigation_actions")

    op.drop_index("ix_team_sessions_token_hash", table_name="team_sessions")
    op.drop_index("ix_team_sessions_team_id", table_name="team_sessions")
    op.drop_table("team_sessions")

    op.drop_index("ix_teams_join_code", table_name="teams")
    op.drop_index("ix_teams_game_id", table_name="teams")
    op.drop_table("teams")

    op.drop_index("ix_rounds_game_id", table_name="rounds")
    op.drop_table("rounds")

    op.drop_table("games")
