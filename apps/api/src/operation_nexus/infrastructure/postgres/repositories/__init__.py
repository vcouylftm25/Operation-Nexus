"""Thin Postgres repositories -- return domain contracts, never ORM rows."""

from __future__ import annotations

from operation_nexus.infrastructure.postgres.repositories.action_repository import ActionRepository
from operation_nexus.infrastructure.postgres.repositories.discovery_repository import (
    DiscoveryRepository,
)
from operation_nexus.infrastructure.postgres.repositories.evidence_reveal_repository import (
    EvidenceRevealRepository,
)
from operation_nexus.infrastructure.postgres.repositories.game_repository import (
    GameNotFound,
    GameRepository,
    RoundNotFound,
)
from operation_nexus.infrastructure.postgres.repositories.score_repository import ScoreRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    AccusationNotFound,
    TeamNotFound,
    TeamRepository,
)

__all__ = [
    "AccusationNotFound",
    "ActionRepository",
    "DiscoveryRepository",
    "EvidenceRevealRepository",
    "GameNotFound",
    "GameRepository",
    "RoundNotFound",
    "ScoreRepository",
    "TeamNotFound",
    "TeamRepository",
]
