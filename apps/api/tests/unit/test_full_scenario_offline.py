"""Offline gate: the mystery files under scenarios/operation_nexus are well-formed.

Loading ground_truth here is allowed — this is scenario/scoring, not an AI test.
"""

from __future__ import annotations

from operation_nexus.domain.game.contracts import FraudPattern
from operation_nexus.domain.game.scoring import load_ground_truth
from operation_nexus.domain.graph.scenario import validate_scenario
from operation_nexus.infrastructure.neo4j.seeder import find_repo_root, load_scenario_from_dir


def test_operation_nexus_scenario_validates_with_zero_errors() -> None:
    scenario_dir = find_repo_root() / "scenarios" / "operation_nexus"
    scenario = load_scenario_from_dir(scenario_dir)
    errors = validate_scenario(scenario)
    assert errors == [], "\n".join(str(error) for error in errors)


def test_ground_truth_coordinator_pattern_and_credit_score_decoy() -> None:
    ground_truth = load_ground_truth("operation_nexus", find_repo_root() / "scenarios")
    assert ground_truth.coordinator == "person_04"
    assert ground_truth.pattern is FraudPattern.IDENTITY_RING
    assert "person_08" in ground_truth.designed_false_positives
