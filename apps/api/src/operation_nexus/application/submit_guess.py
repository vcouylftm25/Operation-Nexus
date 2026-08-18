"""Use case: a team names the fraudster.

This is the ONLY module outside `domain/game/scoring.py` allowed to touch
ground truth, and the allowlist is enforced by
`tests/unit/test_no_ground_truth_leak.py`. Everything it learns is a boolean:
`is_fraudster` takes the guessed id and returns whether it was right, so there
is no path by which the answer can reach a response body or a prompt.

Two rules keep the guess honest rather than a coin flip:
  * it is locked until the final phase, so a team can't open the app and stab
    at eight names before reading anything;
  * a wrong guess costs points, so the third attempt is worth much less than
    the first.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from operation_nexus.application.errors import (
    GuessLocked,
    NoAttemptsRemaining,
    RunAlreadyResolved,
    UnknownSuspect,
)
from operation_nexus.application.ports import EventBroadcaster, GraphReader
from operation_nexus.domain.game.contracts import GuessResult, TeamStatus
from operation_nexus.domain.game.ranking import (
    attempts_remaining,
    elapsed_seconds,
    status_after_guess,
    team_score,
)
from operation_nexus.domain.game.scoring import is_fraudster, load_ground_truth
from operation_nexus.infrastructure.postgres.repositories.game_repository import GameRepository
from operation_nexus.infrastructure.postgres.repositories.guess_repository import GuessRepository
from operation_nexus.infrastructure.postgres.repositories.hint_repository import HintRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import (
    TeamNotFound,
    TeamRepository,
)


class SubmitGuess:
    def __init__(
        self,
        team_repo: TeamRepository,
        game_repo: GameRepository,
        guess_repo: GuessRepository,
        hint_repo: HintRepository,
        graph_reader: GraphReader,
        broadcaster: EventBroadcaster,
        scenarios_dir: Path,
    ) -> None:
        self._team_repo = team_repo
        self._game_repo = game_repo
        self._guess_repo = guess_repo
        self._hint_repo = hint_repo
        self._graph_reader = graph_reader
        self._broadcaster = broadcaster
        self._scenarios_dir = scenarios_dir

    async def execute(self, team_id: UUID, guessed_person_id: str) -> GuessResult:
        team = await self._team_repo.get(team_id)
        if team is None:
            raise TeamNotFound(team_id)
        if team.status is not TeamStatus.PLAYING:
            raise RunAlreadyResolved(team_id, team.status.value)
        if attempts_remaining(team.attempts_used) <= 0:
            raise NoAttemptsRemaining(team_id)

        game = await self._game_repo.require(team.game_id)
        final_round = len(game.rounds) or 1
        if team.current_round < final_round:
            raise GuessLocked(team.current_round, final_round)

        suspect_id = guessed_person_id.strip()
        suspects = await self._graph_reader.list_suspects(team.current_round)
        if suspect_id not in suspects:
            raise UnknownSuspect(suspect_id)

        ground_truth = load_ground_truth(game.scenario_slug, self._scenarios_dir)
        correct = is_fraudster(suspect_id, ground_truth)

        attempt_number = team.attempts_used + 1
        status = status_after_guess(correct=correct, attempts_used=attempt_number)
        await self._guess_repo.record(
            team_id,
            attempt_number=attempt_number,
            guessed_person_id=suspect_id,
            correct=correct,
            round_number=team.current_round,
        )
        updated = await self._team_repo.record_guess_outcome(
            team_id, correct=correct, status=status
        )

        wrong = await self._guess_repo.count_wrong(team_id)
        hints_bought = await self._hint_repo.count_for_team(team_id)
        score = team_score(
            solved=updated.status is TeamStatus.SOLVED,
            wrong_guesses=wrong,
            hints_purchased=hints_bought,
            credits_remaining=updated.credits_balance,
        )
        seconds = elapsed_seconds(updated.started_at, updated.solved_at) or 0

        # The leaderboard is public, so this event carries standings only --
        # never the guessed id, which would leak the answer to every other
        # team the moment somebody got it right.
        await self._broadcaster.broadcast_to_game(
            team.game_id,
            "LEADERBOARD_CHANGED",
            {
                "team_id": str(team_id),
                "team_name": updated.name,
                "status": updated.status.value,
                "score": score,
            },
        )

        return GuessResult(
            correct=correct,
            attempts_used=updated.attempts_used,
            attempts_remaining=attempts_remaining(updated.attempts_used),
            status=updated.status,
            elapsed_seconds=seconds,
            score=score,
        )
