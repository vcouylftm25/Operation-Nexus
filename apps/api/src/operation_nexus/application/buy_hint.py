"""Use cases: browse the hint shelf and pay to unlock one."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from operation_nexus.application.errors import HintLocked, HintNotFound
from operation_nexus.application.hints import HintCard, find_hint, load_hints, to_cards
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.hint_repository import HintRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class ListHints:
    def __init__(
        self,
        team_repo: TeamRepository,
        game_repo: GameRepository,
        hint_repo: HintRepository,
        scenarios_dir: Path,
    ) -> None:
        self._team_repo = team_repo
        self._game_repo = game_repo
        self._hint_repo = hint_repo
        self._scenarios_dir = scenarios_dir

    async def execute(self, team_id: UUID) -> list[HintCard]:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)
        game = await self._game_repo.require(team.game_id)
        specs = load_hints(game.scenario_slug, self._scenarios_dir)
        purchased = await self._hint_repo.list_purchased_ids(team_id)
        return to_cards(specs, purchased, team.current_round)


class BuyHint:
    def __init__(
        self,
        team_repo: TeamRepository,
        game_repo: GameRepository,
        hint_repo: HintRepository,
        scenarios_dir: Path,
    ) -> None:
        self._team_repo = team_repo
        self._game_repo = game_repo
        self._hint_repo = hint_repo
        self._scenarios_dir = scenarios_dir

    async def execute(self, team_id: UUID, hint_id: str) -> tuple[HintCard, int]:
        """Unlock a hint's text. Returns the card and the new credit balance."""
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)
        game = await self._game_repo.require(team.game_id)

        spec = find_hint(game.scenario_slug, hint_id, self._scenarios_dir)
        if spec is None:
            raise HintNotFound(hint_id)
        if spec.round > team.current_round:
            raise HintLocked(hint_id, spec.round, team.current_round)

        purchased = await self._hint_repo.list_purchased_ids(team_id)
        if hint_id in purchased:
            # Re-reading a hint you already own is free; a refresh or a
            # double-tap must not be billed a second time.
            card = HintCard(
                id=spec.id,
                round=spec.round,
                cost=spec.cost,
                title=spec.title,
                purchased=True,
                text=spec.text,
            )
            return card, team.credits_balance

        # Charge first: this raises InsufficientCredits (HTTP 402) and leaves
        # no purchase record behind, so the text stays locked.
        new_balance = await self._team_repo.charge_credits(team_id, spec.cost)
        await self._hint_repo.record(
            team_id,
            hint_id,
            round_number=team.current_round,
            credits_charged=spec.cost,
        )
        card = HintCard(
            id=spec.id,
            round=spec.round,
            cost=spec.cost,
            title=spec.title,
            purchased=True,
            text=spec.text,
        )
        return card, new_balance
