"""Round progression state machine: PENDING -> ACTIVE -> ENDED.

Pure domain module: no framework imports, no I/O. There are exactly 4 rounds
per game (CONTRACT.md §7); illegal transitions -- skipping a state, going
backwards, or acting on an already-ended round -- raise `IllegalRoundTransition`.
"""

from __future__ import annotations

from enum import StrEnum

TOTAL_ROUNDS = 4


class RoundStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"


class IllegalRoundTransition(Exception):
    """Raised when a round is asked to move to a status it cannot legally reach."""

    def __init__(self, current: RoundStatus, target: RoundStatus) -> None:
        self.current = current
        self.target = target
        super().__init__(f"cannot transition round from {current} to {target}")


_ALLOWED_TRANSITIONS: dict[RoundStatus, frozenset[RoundStatus]] = {
    RoundStatus.PENDING: frozenset({RoundStatus.ACTIVE}),
    RoundStatus.ACTIVE: frozenset({RoundStatus.ENDED}),
    RoundStatus.ENDED: frozenset(),
}


def transition(current: RoundStatus, target: RoundStatus) -> RoundStatus:
    """Validate (and return) a status transition, raising if it is illegal."""
    if target not in _ALLOWED_TRANSITIONS[current]:
        raise IllegalRoundTransition(current, target)
    return target


def next_round_number(current: int) -> int:
    """Return the next round number after `current`, raising at the last round."""
    if not 1 <= current <= TOTAL_ROUNDS:
        raise ValueError(f"invalid round number: {current}")
    if current >= TOTAL_ROUNDS:
        raise ValueError("game has no further rounds")
    return current + 1


class RoundStateMachine:
    """Wraps a single round's status and enforces legal transitions."""

    def __init__(self, number: int, status: RoundStatus = RoundStatus.PENDING) -> None:
        if not 1 <= number <= TOTAL_ROUNDS:
            raise ValueError(f"invalid round number: {number}")
        self.number = number
        self._status = status

    @property
    def status(self) -> RoundStatus:
        return self._status

    def start(self) -> RoundStatus:
        self._status = transition(self._status, RoundStatus.ACTIVE)
        return self._status

    def end(self) -> RoundStatus:
        self._status = transition(self._status, RoundStatus.ENDED)
        return self._status
