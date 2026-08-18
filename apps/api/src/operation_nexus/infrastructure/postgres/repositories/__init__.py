"""Thin Postgres repositories -- return domain contracts, never ORM rows."""

from __future__ import annotations

from operation_nexus.infrastructure.postgres.repositories.action_repository import ActionRepository
from operation_nexus.infrastructure.postgres.repositories.discovery_repository import (
    DiscoveryRepository,
)
from operation_nexus.infrastructure.postgres.repositories.game_repository import (
    GameNotFound,
    GameRepository,
    RoundNotFound,
)
from operation_nexus.infrastructure.postgres.repositories.guess_repository import GuessRepository
from operation_nexus.infrastructure.postgres.repositories.hint_repository import HintRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)

__all__ = [
    "ActionRepository",
    "DiscoveryRepository",
    "GameNotFound",
    "GameRepository",
    "GuessRepository",
    "HintRepository",
    "RoundNotFound",
    "TeamNotFound",
    "TeamRepository",
]
