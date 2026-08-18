"""Tests for `domain.game.scoring.score_accusation` -- CONTRACT.md §6, every rule."""

from __future__ import annotations

from uuid import uuid4

from operation_nexus.domain.game.contracts import Accusation, FraudPattern
from operation_nexus.domain.game.scoring import (
    CORRECT_COORDINATOR_POINTS,
    CORRECT_FRAUDSTER_POINTS,
    CORRECT_PATTERN_POINTS,
    FALSE_POSITIVE_AVOIDED_POINTS,
    KEY_RELATIONSHIP_POINTS,
    LEGITIMATE_ACCUSED_PENALTY,
    RULE_CORRECT_COORDINATOR,
    RULE_CORRECT_FRAUDSTER,
    RULE_CORRECT_PATTERN,
    RULE_CREDIT_EFFICIENCY,
    RULE_FALSE_POSITIVE_AVOIDED,
    RULE_KEY_RELATIONSHIP,
    RULE_LEGITIMATE_ACCUSED,
    GroundTruth,
    score_accusation,
)

GROUND_TRUTH = GroundTruth(
    fraudsters=["person_03", "person_08", "person_14"],
    coordinator="person_08",
    pattern=FraudPattern.IDENTITY_RING,
    key_relationships=["rel_008", "rel_011", "rel_029"],
    designed_false_positives=["person_05", "person_12"],
    decoy_notes="person_05 has the worst credit score and is fully legitimate",
)


def _accusation(**overrides: object) -> Accusation:
    defaults: dict[str, object] = {
        "accused_person_ids": ["person_03", "person_08", "person_14"],
        "coordinator_person_id": "person_08",
        "pattern": FraudPattern.IDENTITY_RING,
        "evidence_ids": ["evidence_01"],
        "key_relationship_ids": ["rel_008", "rel_011", "rel_029"],
        "confidence": 90,
        "rationale": "the usual suspects",
    }
    defaults.update(overrides)
    return Accusation.model_validate(defaults)


def test_perfect_accusation_awards_every_rule() -> None:
    team_id = uuid4()
    accusation = _accusation()

    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=260,
        credits_total=520,
        team_id=team_id,
        round_number=4,
    )

    rules = [event.rule for event in breakdown.events]
    assert rules.count(RULE_CORRECT_FRAUDSTER) == 3
    assert rules.count(RULE_CORRECT_COORDINATOR) == 1
    assert rules.count(RULE_KEY_RELATIONSHIP) == 3
    assert rules.count(RULE_FALSE_POSITIVE_AVOIDED) == 2
    assert rules.count(RULE_CORRECT_PATTERN) == 1
    assert rules.count(RULE_CREDIT_EFFICIENCY) == 1
    assert RULE_LEGITIMATE_ACCUSED not in rules

    expected_total = (
        3 * CORRECT_FRAUDSTER_POINTS
        + CORRECT_COORDINATOR_POINTS
        + 3 * KEY_RELATIONSHIP_POINTS
        + 2 * FALSE_POSITIVE_AVOIDED_POINTS
        + CORRECT_PATTERN_POINTS
        + 5  # round(10 * 260 / 520) == 5
    )
    assert breakdown.total == expected_total
    assert breakdown.team_id == team_id
    for event in breakdown.events:
        assert event.round == 4
        assert event.team_id == team_id


def test_correct_fraudster_awards_positive_points() -> None:
    accusation = _accusation(accused_person_ids=["person_03"], key_relationship_ids=[])
    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=0,
        credits_total=100,
        team_id=uuid4(),
        round_number=1,
    )
    fraudster_events = [e for e in breakdown.events if e.rule == RULE_CORRECT_FRAUDSTER]
    assert len(fraudster_events) == 1
    assert fraudster_events[0].delta == CORRECT_FRAUDSTER_POINTS == 12


def test_legitimate_person_accused_is_penalized() -> None:
    # person_01 is neither a fraudster nor a designed false positive.
    accusation = _accusation(
        accused_person_ids=["person_01"],
        coordinator_person_id="person_99",
        key_relationship_ids=[],
        pattern=FraudPattern.OTHER,
    )
    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=0,
        credits_total=100,
        team_id=uuid4(),
        round_number=1,
    )
    legitimate_events = [e for e in breakdown.events if e.rule == RULE_LEGITIMATE_ACCUSED]
    assert len(legitimate_events) == 1
    assert legitimate_events[0].delta == LEGITIMATE_ACCUSED_PENALTY == -8
    # Isolate the penalty: no key-rel / pattern / coordinator bonuses in this fixture.
    penalty_and_efficiency = sum(
        e.delta
        for e in breakdown.events
        if e.rule in {RULE_LEGITIMATE_ACCUSED, RULE_CREDIT_EFFICIENCY}
    )
    assert penalty_and_efficiency < 0


def test_false_positive_wrongly_accused_gets_no_bonus_and_a_penalty() -> None:
    truth = GROUND_TRUTH.model_copy(update={"designed_false_positives": ["person_05"]})
    accusation = _accusation(
        accused_person_ids=["person_05"],
        coordinator_person_id="nobody",
        key_relationship_ids=[],
        pattern=FraudPattern.OTHER,
    )
    breakdown = score_accusation(
        accusation,
        truth,
        credits_remaining=0,
        credits_total=100,
        team_id=uuid4(),
        round_number=1,
    )
    rules = [event.rule for event in breakdown.events]
    assert RULE_FALSE_POSITIVE_AVOIDED not in rules
    assert rules.count(RULE_LEGITIMATE_ACCUSED) == 1


def test_duplicate_accused_ids_are_not_double_counted() -> None:
    accusation = _accusation(
        accused_person_ids=["person_03", "person_03", "person_03"], key_relationship_ids=[]
    )
    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=0,
        credits_total=100,
        team_id=uuid4(),
        round_number=1,
    )
    assert sum(1 for e in breakdown.events if e.rule == RULE_CORRECT_FRAUDSTER) == 1


def test_wrong_coordinator_and_pattern_score_nothing_for_those_rules() -> None:
    accusation = _accusation(
        coordinator_person_id="person_03",
        pattern=FraudPattern.MULE_ACCOUNTS,
        key_relationship_ids=[],
    )
    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=0,
        credits_total=100,
        team_id=uuid4(),
        round_number=1,
    )
    rules = [event.rule for event in breakdown.events]
    assert RULE_CORRECT_COORDINATOR not in rules
    assert RULE_CORRECT_PATTERN not in rules


def test_credit_efficiency_full_balance_awards_max_points() -> None:
    accusation = _accusation(
        accused_person_ids=[], key_relationship_ids=[], coordinator_person_id="nobody"
    )
    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=520,
        credits_total=520,
        team_id=uuid4(),
        round_number=4,
    )
    efficiency_event = next(e for e in breakdown.events if e.rule == RULE_CREDIT_EFFICIENCY)
    assert efficiency_event.delta == 10


def test_credit_efficiency_zero_balance_awards_zero_points() -> None:
    accusation = _accusation(
        accused_person_ids=[], key_relationship_ids=[], coordinator_person_id="nobody"
    )
    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=0,
        credits_total=520,
        team_id=uuid4(),
        round_number=4,
    )
    efficiency_event = next(e for e in breakdown.events if e.rule == RULE_CREDIT_EFFICIENCY)
    assert efficiency_event.delta == 0


def test_credit_efficiency_rounds_and_clamps() -> None:
    accusation = _accusation(
        accused_person_ids=[], key_relationship_ids=[], coordinator_person_id="nobody"
    )
    # 10 * 300/520 = 5.769... -> rounds to 6
    breakdown = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=300,
        credits_total=520,
        team_id=uuid4(),
        round_number=4,
    )
    efficiency_event = next(e for e in breakdown.events if e.rule == RULE_CREDIT_EFFICIENCY)
    assert efficiency_event.delta == 6

    # credits_total <= 0 is degenerate; must not raise or go negative.
    breakdown_degenerate = score_accusation(
        accusation,
        GROUND_TRUTH,
        credits_remaining=0,
        credits_total=0,
        team_id=uuid4(),
        round_number=4,
    )
    efficiency_event = next(
        e for e in breakdown_degenerate.events if e.rule == RULE_CREDIT_EFFICIENCY
    )
    assert efficiency_event.delta == 0
