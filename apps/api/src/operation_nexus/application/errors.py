"""Application-layer errors, mapped to HTTP responses by the API layer."""

from __future__ import annotations

from uuid import UUID


class InvalidTeamName(Exception):
    """The name a player typed can't identify a team."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)


class NoFurtherPhase(Exception):
    """The team is already standing in the scenario's last phase."""

    def __init__(self, current: int) -> None:
        self.current = current
        super().__init__(f"already in the final phase ({current})")


class RunAlreadyResolved(Exception):
    """The team has already solved the case or burned all its attempts."""

    def __init__(self, team_id: UUID, status: str) -> None:
        self.team_id = team_id
        self.status = status
        super().__init__(f"team {team_id} has finished its run ({status})")


class GuessLocked(Exception):
    """Naming a suspect is only unlocked in the final phase.

    Without this gate a team could open the app and guess blind on turn one;
    three tries over eight suspects is a 37% coin flip, which would beat
    actually investigating.
    """

    def __init__(self, current_round: int, required_round: int) -> None:
        self.current_round = current_round
        self.required_round = required_round
        super().__init__(
            f"guessing unlocks in phase {required_round}; team is in phase {current_round}"
        )


class NoAttemptsRemaining(Exception):
    def __init__(self, team_id: UUID) -> None:
        self.team_id = team_id
        super().__init__(f"team {team_id} has no guess attempts left")


class UnknownSuspect(Exception):
    """The guessed id isn't a Person in this scenario."""

    def __init__(self, person_id: str) -> None:
        self.person_id = person_id
        super().__init__(f"not a suspect in this case: {person_id}")


class HintNotFound(Exception):
    def __init__(self, hint_id: str) -> None:
        self.hint_id = hint_id
        super().__init__(f"unknown hint: {hint_id}")


class HintLocked(Exception):
    """The hint belongs to a phase the team hasn't reached yet."""

    def __init__(self, hint_id: str, hint_round: int, current_round: int) -> None:
        self.hint_id = hint_id
        self.hint_round = hint_round
        self.current_round = current_round
        super().__init__(
            f"hint {hint_id} belongs to phase {hint_round}; team is in phase {current_round}"
        )
