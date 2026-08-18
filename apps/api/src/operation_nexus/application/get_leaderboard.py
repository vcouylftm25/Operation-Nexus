"""Use case: the public ranking shown on the projector.

Carries standings only -- team name, status, score, time. Never a person id,
never a suspect name: the board is on a wall that every team can see, so
anything it shows about *who* did it would end the game for the room.
"""

from __future__ import annotations

from uuid import UUID

from operation_nexus.domain.game.contracts import LeaderboardRow, TeamStatus
from operation_nexus.domain.game.ranking import elapsed_seconds, leaderboard_row, rank, team_score
from operation_nexus.infrastructure.postgres.repositories.guess_repository import GuessRepository
from operation_nexus.infrastructure.postgres.repositories.hint_repository import HintRepository
from operation_nexus.infrastructure.postgres.repositories.team_repository import TeamRepository


class GetLeaderboard:
    def __init__(
        self,
        team_repo: TeamRepository,
        guess_repo: GuessRepository,
        hint_repo: HintRepository,
    ) -> None:
        self._team_repo = team_repo
        self._guess_repo = guess_repo
        self._hint_repo = hint_repo

    async def execute(self, game_id: UUID) -> list[LeaderboardRow]:
        teams = await self._team_repo.list_for_game(game_id)
        team_ids = [team.team_id for team in teams]
        wrong_by_team = await self._guess_repo.count_wrong_by_team(team_ids)
        hints_by_team = await self._hint_repo.count_by_team(team_ids)

        rows = [
            leaderboard_row(
                team_id=team.team_id,
                team_name=team.name,
                status=team.status,
                score=team_score(
                    solved=team.status is TeamStatus.SOLVED,
                    wrong_guesses=wrong_by_team.get(team.team_id, 0),
                    hints_purchased=hints_by_team.get(team.team_id, 0),
                    credits_remaining=team.credits_balance,
                ),
                attempts_used=team.attempts_used,
                seconds=elapsed_seconds(team.started_at, team.solved_at),
                current_round=team.current_round,
            )
            for team in teams
        ]
        return rank(rows)
