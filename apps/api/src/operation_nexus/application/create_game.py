"""Use case: create a new game from a scenario slug.

Round title/narrative/duration are copied from `scenarios/<slug>/rounds.yaml`
so the host/projector have copy to show. Credits still come from CONTRACT.md §7.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from operation_nexus.domain.game.contracts import GameState
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.settings import get_settings


def load_round_metadata(
    scenario_slug: str, scenarios_dir: Path | None = None
) -> list[dict[str, Any]]:
    root = scenarios_dir or get_settings().scenarios_dir
    path = root / scenario_slug / "rounds.yaml"
    if not path.is_file():
        return []
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    rounds = raw.get("rounds") or []
    return [row for row in rounds if isinstance(row, dict)]


class CreateGame:
    def __init__(self, game_repo: GameRepository, scenarios_dir: Path | None = None) -> None:
        self._game_repo = game_repo
        self._scenarios_dir = scenarios_dir

    async def execute(self, scenario_slug: str) -> GameState:
        metadata = load_round_metadata(scenario_slug, self._scenarios_dir)
        return await self._game_repo.create(scenario_slug, rounds_meta=metadata)
