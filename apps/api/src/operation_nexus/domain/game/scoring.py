"""Deterministic accusation scoring (CONTRACT.md §6).

THIS IS THE ONLY MODULE IN THE ENTIRE CODEBASE ALLOWED TO TOUCH GROUND TRUTH.

`ground_truth.yaml` is quarantined by design (CONTRACT.md golden rule #4): it
must never enter an LLM prompt, a tool result, or an API response before
`GAME_FINISHED`. Concretely that means:

  * `GroundTruth` and `load_ground_truth` live here and nowhere else.
  * No other module in `domain/`, `application/` or `api/` may import this
    module's `GroundTruth` type or call `load_ground_truth`.
  * `score_accusation` is pure and synchronous -- there is no LLM anywhere in
    the scoring path.

Callers (the `finish_game` use case) pass in already-loaded data and get back
a `ScoreBreakdown`; they never see `GroundTruth` fields directly.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

import yaml
from pydantic import BaseModel, Field

from operation_nexus.domain.game.contracts import (
    Accusation,
    FraudPattern,
    ScoreBreakdown,
    ScoreEvent,
)

# --- rule point values, CONTRACT.md §6, verbatim ---------------------------
CORRECT_FRAUDSTER_POINTS = 12
LEGITIMATE_ACCUSED_PENALTY = -8
CORRECT_COORDINATOR_POINTS = 10
KEY_RELATIONSHIP_POINTS = 20
FALSE_POSITIVE_AVOIDED_POINTS = 15
CORRECT_PATTERN_POINTS = 10
MAX_CREDIT_EFFICIENCY_POINTS = 10

RULE_CORRECT_FRAUDSTER = "CORRECT_FRAUDSTER"
RULE_LEGITIMATE_ACCUSED = "LEGITIMATE_ACCUSED"
RULE_CORRECT_COORDINATOR = "CORRECT_COORDINATOR"
RULE_KEY_RELATIONSHIP = "KEY_RELATIONSHIP"
RULE_FALSE_POSITIVE_AVOIDED = "FALSE_POSITIVE_AVOIDED"
RULE_CORRECT_PATTERN = "CORRECT_PATTERN"
RULE_CREDIT_EFFICIENCY = "CREDIT_EFFICIENCY"


class GroundTruth(BaseModel):
    """Shape of `scenarios/<slug>/ground_truth.yaml` (CONTRACT.md §14)."""

    fraudsters: list[str]
    coordinator: str
    pattern: FraudPattern
    key_relationships: list[str]
    designed_false_positives: list[str] = Field(default_factory=list)
    decoy_notes: str = ""


def load_ground_truth(scenario_slug: str, scenarios_dir: Path) -> GroundTruth:
    """Load and parse `ground_truth.yaml` for a scenario. The only entry point
    into this file anywhere in the codebase.
    """
    path = scenarios_dir / scenario_slug / "ground_truth.yaml"
    with path.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh)
    return GroundTruth.model_validate(raw)


def _credit_efficiency_points(credits_remaining: int, credits_total: int) -> int:
    if credits_total <= 0:
        return 0
    raw = round(MAX_CREDIT_EFFICIENCY_POINTS * credits_remaining / credits_total)
    return max(0, min(MAX_CREDIT_EFFICIENCY_POINTS, raw))


def score_accusation(
    accusation: Accusation,
    ground_truth: GroundTruth,
    credits_remaining: int,
    credits_total: int,
    *,
    team_id: UUID,
    round_number: int,
) -> ScoreBreakdown:
    """Score one team's accusation against ground truth, per CONTRACT.md §6:

        +12  per correct fraudster accused
         -8  per legitimate person accused
        +10  correct coordinator
        +20  per key relationship discovered (from ground_truth.key_relationships)
        +15  per designed false-positive correctly NOT accused
        +10  correct fraud pattern
        + 0..10  credit efficiency: round(10 * credits_remaining / credits_total)

    Every award emits a `ScoreEvent` naming the `rule` that produced it, which
    is exactly what gets shown on the projector as the score breakdown.
    """
    events: list[ScoreEvent] = []
    fraudster_set = set(ground_truth.fraudsters)
    # De-duplicate defensively: an accusation shouldn't be able to farm points
    # by repeating the same person_id.
    accused_ids = list(dict.fromkeys(accusation.accused_person_ids))
    accused_set = set(accused_ids)

    for person_id in accused_ids:
        if person_id in fraudster_set:
            events.append(
                ScoreEvent(
                    team_id=team_id,
                    round=round_number,
                    rule=RULE_CORRECT_FRAUDSTER,
                    delta=CORRECT_FRAUDSTER_POINTS,
                    detail=f"correctly accused fraudster {person_id}",
                )
            )
        else:
            events.append(
                ScoreEvent(
                    team_id=team_id,
                    round=round_number,
                    rule=RULE_LEGITIMATE_ACCUSED,
                    delta=LEGITIMATE_ACCUSED_PENALTY,
                    detail=f"accused legitimate person {person_id}",
                )
            )

    if accusation.coordinator_person_id == ground_truth.coordinator:
        events.append(
            ScoreEvent(
                team_id=team_id,
                round=round_number,
                rule=RULE_CORRECT_COORDINATOR,
                delta=CORRECT_COORDINATOR_POINTS,
                detail=f"correctly identified coordinator {ground_truth.coordinator}",
            )
        )

    cited_relationships = set(accusation.key_relationship_ids)
    for rel_id in ground_truth.key_relationships:
        if rel_id in cited_relationships:
            events.append(
                ScoreEvent(
                    team_id=team_id,
                    round=round_number,
                    rule=RULE_KEY_RELATIONSHIP,
                    delta=KEY_RELATIONSHIP_POINTS,
                    detail=f"correctly cited key relationship {rel_id}",
                )
            )

    for person_id in ground_truth.designed_false_positives:
        if person_id not in accused_set:
            events.append(
                ScoreEvent(
                    team_id=team_id,
                    round=round_number,
                    rule=RULE_FALSE_POSITIVE_AVOIDED,
                    delta=FALSE_POSITIVE_AVOIDED_POINTS,
                    detail=f"correctly did not accuse decoy {person_id}",
                )
            )

    if accusation.pattern == ground_truth.pattern:
        events.append(
            ScoreEvent(
                team_id=team_id,
                round=round_number,
                rule=RULE_CORRECT_PATTERN,
                delta=CORRECT_PATTERN_POINTS,
                detail=f"correctly identified pattern {ground_truth.pattern.value}",
            )
        )

    efficiency = _credit_efficiency_points(credits_remaining, credits_total)
    events.append(
        ScoreEvent(
            team_id=team_id,
            round=round_number,
            rule=RULE_CREDIT_EFFICIENCY,
            delta=efficiency,
            detail=f"{credits_remaining}/{credits_total} credits remaining",
        )
    )

    total = sum(event.delta for event in events)
    return ScoreBreakdown(team_id=team_id, events=events, total=total)
