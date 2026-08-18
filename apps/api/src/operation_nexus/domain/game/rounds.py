"""Phase progression for a self-paced team.

Pure domain module: no framework imports, no I/O. A phase has no lifecycle of
its own any more -- there is no PENDING/ACTIVE/ENDED, because no host starts or
stops anything. Each team simply carries an integer `current_round` and walks it
forward at its own pace, so all that is left is arithmetic over "how many phases
does this scenario declare".

The total is **scenario-driven**: it is however many entries the scenario's
`rounds.yaml` lists, persisted per game in the `rounds` table, and passed in
explicitly. Nothing here assumes a fixed number of phases.
"""

from __future__ import annotations


def next_round_number(current: int, total_rounds: int) -> int:
    """Return the phase after `current`, raising once the scenario runs out."""
    if total_rounds < 1:
        raise ValueError(f"invalid total_rounds: {total_rounds}")
    if not 1 <= current <= total_rounds:
        raise ValueError(f"invalid round number: {current}")
    if current >= total_rounds:
        raise ValueError("game has no further rounds")
    return current + 1


def is_final_round(current: int, total_rounds: int) -> bool:
    """True when `current` is the last phase the scenario defines."""
    return current >= total_rounds
