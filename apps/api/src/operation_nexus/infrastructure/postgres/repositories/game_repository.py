"""Repository for games and their rounds."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from operation_nexus.domain.game.contracts import GameState, GameStatus, RoundState, RoundStatus
from operation_nexus.domain.game.credits import TOTAL_ROUNDS, credits_for_round
from operation_nexus.domain.game.rounds import RoundStateMachine
from operation_nexus.domain.game.rounds import RoundStatus as DomainRoundStatus
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
        status=RoundStatus(row.status),
        credits_awarded=row.credits_awarded,
        title=row.title,
        narrative=row.narrative,
        duration_seconds=row.duration_seconds,
        started_at=row.started_at,
        ended_at=row.ended_at,
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
            status=GameStatus.PENDING.value,
            current_round=0,
        )
        self._session.add(game)
        await self._session.flush()

        meta_by_number = {int(row["number"]): row for row in (rounds_meta or []) if "number" in row}
        rounds = []
        for number in range(1, TOTAL_ROUNDS + 1):
            meta = meta_by_number.get(number, {})
            rounds.append(
                RoundModel(
                    id=uuid4(),
                    game_id=game.id,
                    number=number,
                    status=DomainRoundStatus.PENDING.value,
                    credits_awarded=credits_for_round(number),
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
            current_round=game.current_round,
            created_at=game.created_at,
            finished_at=game.finished_at,
            rounds=[_round_to_state(r) for r in rounds],
            teams=[],
        )

    async def _get_model(self, game_id: UUID) -> GameModel:
        game = await self._session.get(GameModel, game_id)
        if game is None:
            raise GameNotFound(game_id)
        return game

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
            current_round=game.current_round,
            created_at=game.created_at,
            finished_at=game.finished_at,
            rounds=sorted((_round_to_state(r) for r in rounds), key=lambda r: r.number),
            teams=[],
        )

    async def get_round(self, game_id: UUID, number: int) -> RoundState | None:
        result = await self._session.execute(
            select(RoundModel).where(RoundModel.game_id == game_id, RoundModel.number == number)
        )
        row = result.scalar_one_or_none()
        return None if row is None else _round_to_state(row)

    async def get_active_round(self, game_id: UUID) -> RoundState | None:
        result = await self._session.execute(
            select(RoundModel).where(
                RoundModel.game_id == game_id, RoundModel.status == DomainRoundStatus.ACTIVE.value
            )
        )
        row = result.scalar_one_or_none()
        return None if row is None else _round_to_state(row)

    async def start_round(self, game_id: UUID, number: int) -> RoundState:
        """Transition round `number` PENDING -> ACTIVE and mark it as the
        game's current round. Raises `IllegalRoundTransition` if the round
        isn't PENDING (via `RoundStateMachine`).
        """
        result = await self._session.execute(
            select(RoundModel)
            .where(RoundModel.game_id == game_id, RoundModel.number == number)
            .with_for_update()
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise RoundNotFound(game_id, number)

        machine = RoundStateMachine(number, DomainRoundStatus(row.status))
        machine.start()  # raises IllegalRoundTransition if not PENDING

        now = datetime.now(UTC)
        row.status = machine.status.value
        row.started_at = now

        game = await self._get_model(game_id)
        game.current_round = number
        if game.status == GameStatus.PENDING.value:
            game.status = GameStatus.ACTIVE.value

        await self._session.commit()
        return _round_to_state(row)

    async def end_round(self, game_id: UUID, number: int) -> RoundState:
        """Transition round `number` ACTIVE -> ENDED."""
        result = await self._session.execute(
            select(RoundModel)
            .where(RoundModel.game_id == game_id, RoundModel.number == number)
            .with_for_update()
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise RoundNotFound(game_id, number)

        machine = RoundStateMachine(number, DomainRoundStatus(row.status))
        machine.end()  # raises IllegalRoundTransition if not ACTIVE

        row.status = machine.status.value
        row.ended_at = datetime.now(UTC)

        await self._session.commit()
        return _round_to_state(row)

    async def mark_finished(self, game_id: UUID) -> GameState:
        game = await self._get_model(game_id)
        game.status = GameStatus.FINISHED.value
        game.finished_at = datetime.now(UTC)
        await self._session.commit()
        state = await self.get(game_id)
        if state is None:  # pragma: no cover - just persisted above
            raise GameNotFound(game_id)
        return state
