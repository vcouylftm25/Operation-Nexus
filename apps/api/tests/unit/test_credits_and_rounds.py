"""Credit ledger rollover and round state machine — CONTRACT.md §7."""

from __future__ import annotations

import pytest

from operation_nexus.domain.game.credits import (
    ROUND_CREDIT_ALLOWANCE,
    CreditLedger,
    InsufficientCredits,
    credits_for_round,
)
from operation_nexus.domain.game.rounds import (
    IllegalRoundTransition,
    RoundStateMachine,
    RoundStatus,
    next_round_number,
    transition,
)


def test_round_credit_allowance_matches_contract() -> None:
    assert ROUND_CREDIT_ALLOWANCE == (100, 120, 140, 160)
    assert [credits_for_round(n) for n in range(1, 5)] == [100, 120, 140, 160]


def test_award_round_rolls_over_unspent_credits() -> None:
    ledger = CreditLedger()
    assert ledger.award_round(1) == 100
    assert ledger.charge(40) == 60
    # Unspent 60 rolls into round 2's 120 grant.
    assert ledger.award_round(2) == 180
    assert ledger.balance == 180
    assert ledger.total_awarded == 220
    assert ledger.rounds_applied == frozenset({1, 2})


def test_charge_beyond_balance_raises_insufficient_credits() -> None:
    ledger = CreditLedger()
    ledger.award_round(1)
    with pytest.raises(InsufficientCredits) as exc_info:
        ledger.charge(101)
    assert exc_info.value.required == 101
    assert exc_info.value.available == 100
    assert ledger.balance == 100


def test_can_afford_and_exact_charge() -> None:
    ledger = CreditLedger()
    ledger.award_round(1)
    assert ledger.can_afford(100)
    assert not ledger.can_afford(101)
    assert ledger.charge(100) == 0


def test_refund_restores_balance() -> None:
    ledger = CreditLedger()
    ledger.award_round(1)
    ledger.charge(25)
    assert ledger.refund(25) == 100


def test_cannot_apply_the_same_round_grant_twice() -> None:
    ledger = CreditLedger()
    ledger.award_round(1)
    with pytest.raises(ValueError, match="already applied"):
        ledger.award_round(1)


def test_happy_path_pending_active_ended() -> None:
    machine = RoundStateMachine(1)
    assert machine.status is RoundStatus.PENDING
    assert machine.start() is RoundStatus.ACTIVE
    assert machine.end() is RoundStatus.ENDED


def test_pending_cannot_skip_to_ended() -> None:
    machine = RoundStateMachine(1)
    with pytest.raises(IllegalRoundTransition) as exc_info:
        machine.end()
    assert exc_info.value.current is RoundStatus.PENDING
    assert exc_info.value.target is RoundStatus.ENDED


def test_cannot_restart_or_reverse_an_ended_round() -> None:
    machine = RoundStateMachine(1)
    machine.start()
    machine.end()
    with pytest.raises(IllegalRoundTransition):
        machine.start()
    with pytest.raises(IllegalRoundTransition):
        transition(RoundStatus.ENDED, RoundStatus.ACTIVE)
    with pytest.raises(IllegalRoundTransition):
        transition(RoundStatus.ACTIVE, RoundStatus.PENDING)


def test_cannot_start_an_already_active_round() -> None:
    machine = RoundStateMachine(1)
    machine.start()
    with pytest.raises(IllegalRoundTransition) as exc_info:
        machine.start()
    assert exc_info.value.current is RoundStatus.ACTIVE
    assert exc_info.value.target is RoundStatus.ACTIVE


def test_next_round_number_advances_until_the_finale() -> None:
    assert next_round_number(1) == 2
    assert next_round_number(3) == 4
    with pytest.raises(ValueError, match="no further rounds"):
        next_round_number(4)
