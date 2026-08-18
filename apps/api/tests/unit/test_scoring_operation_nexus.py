"""Score the real operation_nexus ground_truth.yaml — allowed here, never in AI tests."""

from __future__ import annotations

from uuid import uuid4

from operation_nexus.domain.game.contracts import Accusation, FraudPattern, ScoreBreakdown
from operation_nexus.domain.game.scoring import (
    CORRECT_COORDINATOR_POINTS,
    CORRECT_FRAUDSTER_POINTS,
    CORRECT_PATTERN_POINTS,
    FALSE_POSITIVE_AVOIDED_POINTS,
    KEY_RELATIONSHIP_POINTS,
    LEGITIMATE_ACCUSED_PENALTY,
    RULE_FALSE_POSITIVE_AVOIDED,
    RULE_LEGITIMATE_ACCUSED,
    GroundTruth,
    load_ground_truth,
    score_accusation,
)
from operation_nexus.infrastructure.neo4j.seeder import find_repo_root

_TEAM_ID = uuid4()


def _score(accusation: Accusation, ground_truth: GroundTruth) -> ScoreBreakdown:
    return score_accusation(
        accusation,
        ground_truth,
        credits_remaining=0,
        credits_total=520,
        team_id=_TEAM_ID,
        round_number=4,
    )


def test_perfect_accusation_against_real_ground_truth() -> None:
    ground_truth = load_ground_truth("operation_nexus", find_repo_root() / "scenarios")
    accusation = Accusation(
        accused_person_ids=list(ground_truth.fraudsters),
        coordinator_person_id=ground_truth.coordinator,
        pattern=ground_truth.pattern,
        evidence_ids=["evidence_01"],
        key_relationship_ids=list(ground_truth.key_relationships),
        confidence=100,
        rationale="full ring, coordinator, pattern and key relationships",
    )

    breakdown = _score(accusation, ground_truth)

    expected = (
        len(ground_truth.fraudsters) * CORRECT_FRAUDSTER_POINTS
        + CORRECT_COORDINATOR_POINTS
        + len(ground_truth.key_relationships) * KEY_RELATIONSHIP_POINTS
        + len(ground_truth.designed_false_positives) * FALSE_POSITIVE_AVOIDED_POINTS
        + CORRECT_PATTERN_POINTS
    )
    assert breakdown.total == expected
    assert not any(event.rule == RULE_LEGITIMATE_ACCUSED for event in breakdown.events)
    fp_avoided = [e for e in breakdown.events if e.rule == RULE_FALSE_POSITIVE_AVOIDED]
    assert len(fp_avoided) == len(ground_truth.designed_false_positives)
    assert any("person_08" in event.detail for event in fp_avoided)


def test_accusing_the_worst_credit_score_decoy_is_worse_than_leaving_them_out() -> None:
    ground_truth = load_ground_truth("operation_nexus", find_repo_root() / "scenarios")
    assert "person_08" in ground_truth.designed_false_positives

    decoy_accusation = Accusation(
        accused_person_ids=["person_08"],
        coordinator_person_id="person_08",
        pattern=FraudPattern.OTHER,
        evidence_ids=["evidence_01"],
        key_relationship_ids=[],
        confidence=40,
        rationale="worst credit score in the dataset",
    )
    left_out = Accusation(
        accused_person_ids=[],
        coordinator_person_id="unknown",
        pattern=FraudPattern.OTHER,
        evidence_ids=["evidence_01"],
        key_relationship_ids=[],
        confidence=0,
        rationale="did not accuse the credit-score decoy",
    )

    decoy_breakdown = _score(decoy_accusation, ground_truth)
    left_out_breakdown = _score(left_out, ground_truth)

    decoy_penalties = [e for e in decoy_breakdown.events if e.rule == RULE_LEGITIMATE_ACCUSED]
    assert len(decoy_penalties) == 1
    assert decoy_penalties[0].delta == LEGITIMATE_ACCUSED_PENALTY
    assert "person_08" in decoy_penalties[0].detail
    assert not any(
        e.rule == RULE_FALSE_POSITIVE_AVOIDED and "person_08" in e.detail
        for e in decoy_breakdown.events
    )

    assert any(
        e.rule == RULE_FALSE_POSITIVE_AVOIDED and "person_08" in e.detail
        for e in left_out_breakdown.events
    )
    assert left_out_breakdown.total - decoy_breakdown.total == (
        FALSE_POSITIVE_AVOIDED_POINTS - LEGITIMATE_ACCUSED_PENALTY
    )
    assert decoy_breakdown.total < left_out_breakdown.total
