"""Application-layer errors, mapped to HTTP responses by the API layer."""

from __future__ import annotations

from uuid import UUID


class InvalidJoinCode(Exception):
    def __init__(self, join_code: str) -> None:
        self.join_code = join_code
        super().__init__(f"invalid or unknown join code: {join_code}")


class NoAccusationSubmitted(Exception):
    def __init__(self, team_id: UUID) -> None:
        self.team_id = team_id
        super().__init__(f"team {team_id} has not submitted an accusation")


class RoundSequenceError(Exception):
    """Raised when a round is started out of sequence."""

    def __init__(self, requested: int, expected: int) -> None:
        self.requested = requested
        self.expected = expected
        super().__init__(f"cannot start round {requested}: expected round {expected} next")


class NoActiveRound(Exception):
    def __init__(self, game_id: UUID) -> None:
        self.game_id = game_id
        super().__init__(f"game {game_id} has no active round to advance")
