"""Scoring and ranking for self-paced runs."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from operation_nexus.domain.game.contracts import TeamStatus
from operation_nexus.domain.game.ranking import (
    HINT_PENALTY,
    MAX_GUESS_ATTEMPTS,
    SOLVE_BASE_POINTS,
    WRONG_GUESS_PENALTY,
    attempts_remaining,
    elapsed_seconds,
    leaderboard_row,
    rank,
    status_after_guess,
    team_score,
)


def test_a_clean_first_try_solve_scores_base_plus_leftover_credits() -> None:
    assert (
        team_score(solved=True, wrong_guesses=0, hints_purchased=0, credits_remaining=80)
        == SOLVE_BASE_POINTS + 80
    )


def test_wrong_guesses_and_hints_both_cost_points() -> None:
    score = team_score(solved=True, wrong_guesses=2, hints_purchased=3, credits_remaining=50)
    assert score == SOLVE_BASE_POINTS - 2 * WRONG_GUESS_PENALTY - 3 * HINT_PENALTY + 50


def test_a_hint_costs_more_than_spending_the_same_credits_on_a_tool() -> None:
    """Buying a hint is a shortcut, so it is billed in credits *and* points."""
    spent_on_tools = team_score(
        solved=True, wrong_guesses=0, hints_purchased=0, credits_remaining=70
    )
    spent_on_a_hint = team_score(
        solved=True, wrong_guesses=0, hints_purchased=1, credits_remaining=70
    )
    assert spent_on_a_hint < spent_on_tools


def test_an_unsolved_run_scores_zero_however_frugal() -> None:
    assert team_score(solved=False, wrong_guesses=0, hints_purchased=0, credits_remaining=500) == 0


def test_score_never_goes_negative() -> None:
    assert team_score(solved=True, wrong_guesses=99, hints_purchased=99, credits_remaining=0) == 0


def test_score_rejects_impossible_inputs() -> None:
    with pytest.raises(ValueError, match="non-negative"):
        team_score(solved=True, wrong_guesses=-1, hints_purchased=0, credits_remaining=0)


def test_a_team_gets_three_attempts_then_fails() -> None:
    assert attempts_remaining(0) == MAX_GUESS_ATTEMPTS
    assert status_after_guess(correct=False, attempts_used=1) is TeamStatus.PLAYING
    assert status_after_guess(correct=False, attempts_used=2) is TeamStatus.PLAYING
    assert status_after_guess(correct=False, attempts_used=3) is TeamStatus.FAILED


def test_a_correct_guess_solves_even_on_the_last_attempt() -> None:
    assert status_after_guess(correct=True, attempts_used=3) is TeamStatus.SOLVED


def test_elapsed_seconds_needs_both_ends() -> None:
    start = datetime(2026, 8, 18, 12, 0, tzinfo=UTC)
    assert elapsed_seconds(start, start + timedelta(minutes=7)) == 420
    assert elapsed_seconds(start, None) is None
    assert elapsed_seconds(None, start) is None


def _row(name: str, status: TeamStatus, score: int, seconds: int | None):
    return leaderboard_row(
        team_id=uuid4(),
        team_name=name,
        status=status,
        score=score,
        attempts_used=1,
        seconds=seconds,
        current_round=3,
    )


def test_solvers_outrank_everyone_even_with_a_lower_score() -> None:
    still_playing = _row("Ainda jogando", TeamStatus.PLAYING, 0, None)
    solver = _row("Resolveu", TeamStatus.SOLVED, 10, 3000)
    assert [row.team_name for row in rank([still_playing, solver])] == [
        "Resolveu",
        "Ainda jogando",
    ]


def test_time_only_breaks_ties_between_equal_scores() -> None:
    """A fast blind guess must not beat a slower, better investigation."""
    fast_but_sloppy = _row("Chute rapido", TeamStatus.SOLVED, 700, 120)
    slow_but_sharp = _row("Investigou", TeamStatus.SOLVED, 1050, 1800)
    assert [row.team_name for row in rank([fast_but_sloppy, slow_but_sharp])] == [
        "Investigou",
        "Chute rapido",
    ]

    tie_slow = _row("Empate lento", TeamStatus.SOLVED, 900, 1800)
    tie_fast = _row("Empate rapido", TeamStatus.SOLVED, 900, 600)
    assert [row.team_name for row in rank([tie_slow, tie_fast])] == [
        "Empate rapido",
        "Empate lento",
    ]
