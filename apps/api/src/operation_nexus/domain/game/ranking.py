"""Deterministic team scoring and ranking.

Pure domain module: no framework imports, no I/O, and -- importantly -- **no
ground truth**. Everything here is arithmetic over facts the game engine
already recorded about a team's own run (did it solve, how many wrong guesses,
how many hints it bought, what it had left in the bank). Whether a guess was
right is decided in `domain/game/scoring.py`; by the time a number reaches this
module it is just a boolean.

The scoring shape the game uses:

    pontos = base do acerto
             - penalidade por tentativa errada
             - penalidade por dica comprada
             + creditos que sobraram

A hint is charged twice on purpose: once in credits at the moment of purchase,
and again here as a flat penalty. A hint is a shortcut past the investigation
the game is trying to teach, so it should cost more than spending the same
credits on a tool. Teams that never solve score zero and rank below every team
that did, no matter how frugal they were.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from operation_nexus.domain.game.contracts import LeaderboardRow, TeamStatus

#: A team gets three shots at naming the fraudster, then it is out.
MAX_GUESS_ATTEMPTS = 3

SOLVE_BASE_POINTS = 1000
WRONG_GUESS_PENALTY = 150
HINT_PENALTY = 25


def team_score(
    *,
    solved: bool,
    wrong_guesses: int,
    hints_purchased: int,
    credits_remaining: int,
) -> int:
    """Score one team's run. Never negative; unsolved runs are worth nothing."""
    if not solved:
        return 0
    if wrong_guesses < 0 or hints_purchased < 0 or credits_remaining < 0:
        raise ValueError("score inputs must be non-negative")
    raw = (
        SOLVE_BASE_POINTS
        - WRONG_GUESS_PENALTY * wrong_guesses
        - HINT_PENALTY * hints_purchased
        + credits_remaining
    )
    return max(0, raw)


def attempts_remaining(attempts_used: int) -> int:
    return max(0, MAX_GUESS_ATTEMPTS - attempts_used)


def status_after_guess(*, correct: bool, attempts_used: int) -> TeamStatus:
    """A team is SOLVED on a hit, FAILED once it burns all three tries."""
    if correct:
        return TeamStatus.SOLVED
    return TeamStatus.PLAYING if attempts_remaining(attempts_used) > 0 else TeamStatus.FAILED


def rank(rows: list[LeaderboardRow]) -> list[LeaderboardRow]:
    """Order the leaderboard: solvers first, then by score, then by speed.

    Time only breaks ties. Score already folds in wrong guesses and hints, so
    sorting by time first would reward a team that guessed blind at minute one
    over a team that actually investigated.
    """

    def key(row: LeaderboardRow) -> tuple[int, int, int, str]:
        solved_first = 0 if row.status is TeamStatus.SOLVED else 1
        elapsed = row.elapsed_seconds if row.elapsed_seconds is not None else 10**9
        return (solved_first, -row.score, elapsed, row.team_name.casefold())

    return sorted(rows, key=key)


def elapsed_seconds(started_at: datetime | None, finished_at: datetime | None) -> int | None:
    """Whole seconds between two instants, or None if either is missing."""
    if started_at is None or finished_at is None:
        return None
    return max(0, int((finished_at - started_at).total_seconds()))


def leaderboard_row(
    *,
    team_id: UUID,
    team_name: str,
    status: TeamStatus,
    score: int,
    attempts_used: int,
    seconds: int | None,
    current_round: int,
) -> LeaderboardRow:
    return LeaderboardRow(
        team_id=team_id,
        team_name=team_name,
        status=status,
        score=score,
        attempts_used=attempts_used,
        elapsed_seconds=seconds,
        current_round=current_round,
    )
