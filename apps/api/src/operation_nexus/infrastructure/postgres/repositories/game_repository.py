"""Repository for games and their phase catalogue."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.domain.game.contracts import GameState, GameStatus, RoundState
from operation_nexus.domain.game.credits import DEFAULT_ROUND_CREDITS
from operation_nexus.infrastructure.postgres.models import GameModel, RoundModel


class GameNotFound(Exception):
    def __init__(self, game_id: UUID) -> None:
        self.game_id = game_id
        super().__init__(f"game not found: {game_id}")


class RoundNotFound(Exception):
    def __init__(self, game_id: UUID, number: int) -> None:
        self.game_id = game_id
        self.number = number
        super().__init__(f"round {number} not found for game {game_id}")


def _round_to_state(row: RoundModel) -> RoundState:
    return RoundState(
        game_id=row.game_id,
        number=row.number,
        credits_awarded=row.credits_awarded,
        title=row.title,
        narrative=row.narrative,
        duration_seconds=row.duration_seconds,
    )


class GameRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, scenario_slug: str, rounds_meta: list[dict[str, Any]] | None = None
    ) -> GameState:
        game = GameModel(
            id=uuid4(),
            scenario_slug=scenario_slug,
            status=GameStatus.ACTIVE.value,
        )
        self._session.add(game)
        await self._session.flush()

        # The scenario's rounds.yaml decides how many phases a game has and what
        # each one grants -- nothing here assumes a fixed count, so a 3-phase and
        # a 4-round scenario can coexist.
        meta_by_number = {int(row["number"]): row for row in (rounds_meta or []) if "number" in row}
        rounds = []
        for number in sorted(meta_by_number) or [1]:
            meta = meta_by_number.get(number, {})
            rounds.append(
                RoundModel(
                    id=uuid4(),
                    game_id=game.id,
                    number=number,
                    credits_awarded=int(meta.get("credits") or DEFAULT_ROUND_CREDITS),
                    title=str(meta["title"]) if meta.get("title") else None,
                    narrative=str(meta["narrative"]).strip() if meta.get("narrative") else None,
                    duration_seconds=int(meta["duration_seconds"])
                    if meta.get("duration_seconds")
                    else None,
                )
            )
        self._session.add_all(rounds)
        await self._session.commit()

        return GameState(
            game_id=game.id,
            scenario_slug=game.scenario_slug,
            status=GameStatus(game.status),
            created_at=game.created_at,
            finished_at=game.finished_at,
            rounds=[_round_to_state(r) for r in rounds],
            teams=[],
        )

    async def find_open_for_scenario(self, scenario_slug: str) -> GameState | None:
        """The room teams walk into when they type a name.

        Players never create a game explicitly, so `/play/start` reuses the
        most recent unfinished game for the scenario and only creates one when
        there is none.
        """
        result = await self._session.execute(
            select(GameModel)
            .where(
                GameModel.scenario_slug == scenario_slug,
                GameModel.finished_at.is_(None),
            )
            .order_by(GameModel.created_at.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return None if row is None else await self.get(row.id)

    async def get(self, game_id: UUID) -> GameState | None:
        game = await self._session.get(GameModel, game_id)
        if game is None:
            return None
        rounds = (
            (await self._session.execute(select(RoundModel).where(RoundModel.game_id == game_id)))
            .scalars()
            .all()
        )
        return GameState(
            game_id=game.id,
            scenario_slug=game.scenario_slug,
            status=GameStatus(game.status),
            created_at=game.created_at,
            finished_at=game.finished_at,
            rounds=sorted((_round_to_state(r) for r in rounds), key=lambda r: r.number),
            teams=[],
        )

    async def require(self, game_id: UUID) -> GameState:
        game = await self.get(game_id)
        if game is None:
            raise GameNotFound(game_id)
        return game

    async def get_round(self, game_id: UUID, number: int) -> RoundState | None:
        result = await self._session.execute(
            select(RoundModel).where(RoundModel.game_id == game_id, RoundModel.number == number)
        )
        row = result.scalar_one_or_none()
        return None if row is None else _round_to_state(row)

    async def require_round(self, game_id: UUID, number: int) -> RoundState:
        found = await self.get_round(game_id, number)
        if found is None:
            raise RoundNotFound(game_id, number)
        return found

    async def count_rounds(self, game_id: UUID) -> int:
        result = await self._session.execute(
            select(RoundModel.number).where(RoundModel.game_id == game_id)
        )
        return len(list(result.scalars().all()))

    async def mark_finished(self, game_id: UUID) -> GameState:
        game = await self._session.get(GameModel, game_id)
        if game is None:
            raise GameNotFound(game_id)
        game.status = GameStatus.FINISHED.value
        game.finished_at = datetime.now(UTC)
        await self._session.commit()
        return await self.require(game_id)
