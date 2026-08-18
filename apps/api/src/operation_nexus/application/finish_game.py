"""Use case: finish a game -- scores every team's accusation and broadcasts
`GAME_FINISHED` (`POST /host/games/{id}/finish`).

This is the only place in `application/` that ever touches ground truth, and
even here only indirectly: it loads `GroundTruth` via
`domain.game.scoring.load_ground_truth` and hands it straight into the pure,
deterministic `score_accusation` function. Teams that never submitted an
accusation are simply skipped -- they finish with zero score events.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID

from operation_nexus.application.ports import EventBroadcaster
from operation_nexus.domain.game.contracts import ScoreBreakdown
from operation_nexus.domain.game.scoring import load_ground_truth, score_accusation
from operation_nexus.infrastructure.postgres.repositories.game_repository import (
    GameNotFound,
    GameRepository,
)
from operation_nexus.infrastructure.postgres.repositories.score_repository import ScoreRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository


class FinishGame:
    def __init__(
        self,
        game_repo: GameRepository,
        team_repo: TeamRepository,
        score_repo: ScoreRepository,
        broadcaster: EventBroadcaster,
        scenarios_dir: Path,
    ) -> None:
        self._game_repo = game_repo
        self._team_repo = team_repo
        self._score_repo = score_repo
        self._broadcaster = broadcaster
        self._scenarios_dir = scenarios_dir

    async def execute(self, game_id: UUID) -> list[ScoreBreakdown]:
        game = await self._game_repo.get(game_id)
        if game is None:
            raise GameNotFound(game_id)

        ground_truth = await asyncio.to_thread(
            load_ground_truth, game.scenario_slug, self._scenarios_dir
        )

        breakdowns: list[ScoreBreakdown] = []
        for team in await self._team_repo.list_for_game(game_id):
            stored = await self._team_repo.get_accusation(team.team_id)
            if stored is None:
                breakdowns.append(ScoreBreakdown(team_id=team.team_id, events=[], total=0))
                continue

            breakdown = score_accusation(
                stored.accusation,
                ground_truth,
                credits_remaining=team.credits_balance,
                credits_total=team.credits_total_awarded,
                team_id=team.team_id,
                round_number=stored.round_number,
            )
            await self._score_repo.record_events(breakdown.events)
            await self._team_repo.mark_accusation_scored(team.team_id)
            breakdowns.append(breakdown)

            await self._broadcaster.broadcast_to_team(
                game_id,
                team.team_id,
                "TEAM_SCORE_UPDATED",
                {"team_id": str(team.team_id), "total": breakdown.total},
            )

        await self._game_repo.mark_finished(game_id)

        await self._broadcaster.broadcast_to_game(
            game_id,
            "GAME_FINISHED",
            {
                "scoreboard": [
                    {"team_id": str(b.team_id), "total": b.total}
                    for b in sorted(breakdowns, key=lambda b: -b.total)
                ]
            },
        )
        return breakdowns
