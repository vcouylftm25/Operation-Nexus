"""Credit ledger rollover and self-paced phase progression — CONTRACT.md §7."""

from __future__ import annotations

import pytest

from operation_nexus.domain.game.credits import (
    DEFAULT_ROUND_CREDITS,
    CreditLedger,
    InsufficientCredits,
)
from operation_nexus.domain.game.rounds import is_final_round, next_round_number


def test_award_round_uses_the_amount_the_scenario_declares() -> None:
    """Allowances come from the scenario's rounds.yaml, not a hardcoded table."""
    ledger = CreditLedger()
    assert ledger.award_round(1, 150) == 150
    assert ledger.award_round(2, 90) == 240


def test_award_round_falls_back_when_the_scenario_omits_credits() -> None:
    ledger = CreditLedger()
    assert ledger.award_round(1) == DEFAULT_ROUND_CREDITS


def test_award_round_rolls_over_unspent_credits() -> None:
    ledger = CreditLedger()
    assert ledger.award_round(1, 100) == 100
    assert ledger.charge(40) == 60
    # Unspent 60 rolls into round 2's 120 grant.
    assert ledger.award_round(2, 120) == 180
    assert ledger.balance == 180
    assert ledger.total_awarded == 220
    assert ledger.rounds_applied == frozenset({1, 2})


def test_charge_beyond_balance_raises_insufficient_credits() -> None:
    ledger = CreditLedger()
    ledger.award_round(1, 100)
    with pytest.raises(InsufficientCredits) as exc_info:
        ledger.charge(101)
    assert exc_info.value.required == 101
    assert exc_info.value.available == 100
    assert ledger.balance == 100


def test_can_afford_and_exact_charge() -> None:
    ledger = CreditLedger()
    ledger.award_round(1, 100)
    assert ledger.can_afford(100)
    assert not ledger.can_afford(101)
    assert ledger.charge(100) == 0


def test_refund_restores_balance() -> None:
    ledger = CreditLedger()
    ledger.award_round(1, 100)
    ledger.charge(25)
    assert ledger.refund(25) == 100


def test_cannot_apply_the_same_round_grant_twice() -> None:
    ledger = CreditLedger()
    ledger.award_round(1, 100)
    with pytest.raises(ValueError, match="already applied"):
        ledger.award_round(1, 100)


def test_next_round_number_advances_until_the_finale() -> None:
    """The finale is wherever the scenario's rounds.yaml stops, not a global 4."""
    assert next_round_number(1, 4) == 2
    assert next_round_number(3, 4) == 4
    with pytest.raises(ValueError, match="no further rounds"):
        next_round_number(4, 4)

    # A 3-phase scenario ends one round earlier, with the same helper.
    assert next_round_number(2, 3) == 3
    with pytest.raises(ValueError, match="no further rounds"):
        next_round_number(3, 3)


def test_is_final_round_follows_the_scenario_total() -> None:
    assert is_final_round(3, 3)
    assert not is_final_round(3, 4)


def test_next_round_number_rejects_a_round_outside_the_scenario() -> None:
    with pytest.raises(ValueError, match="invalid round number"):
        next_round_number(0, 3)
    with pytest.raises(ValueError, match="invalid round number"):
        next_round_number(5, 3)
