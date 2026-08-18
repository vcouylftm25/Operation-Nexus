"""Per-team credit ledger: charge, refund, balance and round-to-round rollover.

Pure domain module: no framework imports, no I/O. Round allowances come from
CONTRACT.md §7: `[100, 120, 140, 160]` credits for rounds 1..4, and unspent
credits always roll over -- a round grant simply adds on top of whatever
balance remains.
"""

from __future__ import annotations

ROUND_CREDIT_ALLOWANCE: tuple[int, int, int, int] = (100, 120, 140, 160)
TOTAL_ROUNDS = len(ROUND_CREDIT_ALLOWANCE)


class InsufficientCredits(Exception):
    """Raised when a charge would exceed the team's current balance.

    The API layer maps this to HTTP 402 with body
    `{"error": "INSUFFICIENT_CREDITS", "required": N, "available": M}`
    (CONTRACT.md §7) -- keep the attribute names in sync with that shape.
    """

    def __init__(self, required: int, available: int) -> None:
        self.required = required
        self.available = available
        super().__init__(f"insufficient credits: required={required} available={available}")


def credits_for_round(round_number: int) -> int:
    """Return the credit allowance granted for a 1-indexed round number."""
    if not 1 <= round_number <= TOTAL_ROUNDS:
        raise ValueError(f"invalid round number: {round_number}")
    return ROUND_CREDIT_ALLOWANCE[round_number - 1]


class CreditLedger:
    """Tracks one team's credit balance across the whole game.

    Unspent credits roll over between rounds: `award_round` never resets the
    balance, it only adds the new round's allowance on top of it.
    """

    def __init__(self, balance: int = 0, total_awarded: int = 0) -> None:
        if balance < 0:
            raise ValueError("initial balance must be non-negative")
        if total_awarded < 0:
            raise ValueError("initial total_awarded must be non-negative")
        self._balance = balance
        self._total_awarded = total_awarded
        self._rounds_applied: set[int] = set()

    @property
    def balance(self) -> int:
        return self._balance

    @property
    def total_awarded(self) -> int:
        return self._total_awarded

    @property
    def rounds_applied(self) -> frozenset[int]:
        return frozenset(self._rounds_applied)

    def can_afford(self, amount: int) -> bool:
        return amount <= self._balance

    def award_round(self, round_number: int, amount: int | None = None) -> int:
        """Add a round's credit allowance to the balance (rollover of unspent credits)."""
        if round_number in self._rounds_applied:
            raise ValueError(f"credits for round {round_number} already applied")
        granted = credits_for_round(round_number) if amount is None else amount
        if granted < 0:
            raise ValueError("credit award must be non-negative")
        self._balance += granted
        self._total_awarded += granted
        self._rounds_applied.add(round_number)
        return self._balance

    def charge(self, amount: int) -> int:
        if amount < 0:
            raise ValueError("charge amount must be non-negative")
        if amount > self._balance:
            raise InsufficientCredits(required=amount, available=self._balance)
        self._balance -= amount
        return self._balance

    def refund(self, amount: int) -> int:
        if amount < 0:
            raise ValueError("refund amount must be non-negative")
        self._balance += amount
        return self._balance
