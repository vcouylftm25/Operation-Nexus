"""One test per `ScenarioError` class from CONTRACT.md §10/§14, using
deliberately broken in-memory scenarios (see `_base_scenario()` for the
known-good baseline every test starts from and breaks exactly one way)."""

from __future__ import annotations

from operation_nexus.domain.graph.scenario import (
    EntitySpec,
    EvidenceSpec,
    RelationshipSpec,
    RoundSpec,
    ScenarioError,
    ScenarioErrorCode,
    ScenarioMeta,
    ScenarioSpec,
    validate_scenario,
)
from operation_nexus.domain.graph.schema import NodeLabel, RelationshipType

_PERSON_PROPS = {
    "name": "Someone",
    "cpf_masked": "***.000.000-**",
    "age": 30,
    "occupation": "Autônomo",
    "income_declared": 5000.0,
    "credit_score": 700,
}


def _person(entity_id: str, visible_from_round: int = 1) -> EntitySpec:
    return EntitySpec(
        id=entity_id,
        label=NodeLabel.PERSON,
        visible_from_round=visible_from_round,
        label_display=entity_id,
        properties=dict(_PERSON_PROPS),
    )


def _device(entity_id: str, visible_from_round: int = 1) -> EntitySpec:
    return EntitySpec(
        id=entity_id,
        label=NodeLabel.DEVICE,
        visible_from_round=visible_from_round,
        label_display=entity_id,
        properties={"fingerprint": "fp", "os": "os", "first_seen": "2026-01-01T00:00:00Z"},
    )


def _used_device_rel(
    rel_id: str, start_id: str, end_id: str, visible_from_round: int = 1
) -> RelationshipSpec:
    return RelationshipSpec(
        id=rel_id,
        type=RelationshipType.USED_DEVICE,
        start_id=start_id,
        end_id=end_id,
        visible_from_round=visible_from_round,
        source="device_fingerprinting",
        confidence=0.9,
    )


def _message(
    evidence_id: str,
    *,
    sent_by: str | None = "person_01",
    sent_to: list[str] | None = None,
    mentions: list[str] | None = None,
) -> EvidenceSpec:
    return EvidenceSpec(
        id=evidence_id,
        kind="Message",
        visible_from_round=1,
        label_display=evidence_id,
        content="hello",
        captured_at="2026-01-01T00:00:00Z",
        source="seized_device",
        channel="sms",
        sent_by=sent_by,
        sent_to=sent_to or ["person_02"],
        mentions=mentions or [],
    )


def _round() -> RoundSpec:
    return RoundSpec(
        number=1,
        title="t",
        narrative="n",
        credits=100,
        unlocks=[NodeLabel.PERSON],
        duration_seconds=600,
    )


def _base_scenario() -> ScenarioSpec:
    """A known-good, error-free scenario: 2 persons sharing a device, linked
    by a message, all reachable, all required properties present."""
    return ScenarioSpec(
        meta=ScenarioMeta(name="Test", slug="test", description="d", version="0.1.0"),
        entities=[_person("person_01"), _person("person_02"), _device("device_01")],
        relationships=[
            _used_device_rel("rel_001", "person_01", "device_01"),
            _used_device_rel("rel_002", "person_02", "device_01"),
        ],
        evidence=[_message("message_01")],
        rounds=[_round()],
    )


def _codes(errors: list[ScenarioError]) -> set[ScenarioErrorCode]:
    return {error.code for error in errors}


def test_base_scenario_is_valid() -> None:
    """Sanity check: the baseline every other test mutates must itself be
    error-free, or the individual-defect tests below would be meaningless."""
    assert validate_scenario(_base_scenario()) == []


def test_id_regex_violation() -> None:
    scenario = _base_scenario()
    scenario.entities.append(_person("person_1"))  # only 1 digit, needs 2-3

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.ID_REGEX_VIOLATION in _codes(errors)
    bad = next(e for e in errors if e.code == ScenarioErrorCode.ID_REGEX_VIOLATION)
    assert bad.subject_id == "person_1"
    assert "person_1" in bad.message


def test_duplicate_id() -> None:
    scenario = _base_scenario()
    scenario.entities.append(_person("person_01"))  # already exists

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.DUPLICATE_ID in _codes(errors)
    dup = next(e for e in errors if e.code == ScenarioErrorCode.DUPLICATE_ID)
    assert dup.subject_id == "person_01"


def test_unknown_entity_reference_in_relationship() -> None:
    scenario = _base_scenario()
    scenario.relationships.append(_used_device_rel("rel_003", "person_99", "device_01"))

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.UNKNOWN_ENTITY_REFERENCE in _codes(errors)
    unknown = next(e for e in errors if e.code == ScenarioErrorCode.UNKNOWN_ENTITY_REFERENCE)
    assert unknown.subject_id == "rel_003"
    assert "person_99" in unknown.message


def test_relationship_visible_before_endpoint() -> None:
    scenario = _base_scenario()
    # device_02 only becomes visible at round 2, but the relationship to it
    # is visible at round 1 — a relationship can never precede its endpoints.
    scenario.entities.append(_device("device_02", visible_from_round=2))
    scenario.relationships.append(
        _used_device_rel("rel_003", "person_01", "device_02", visible_from_round=1)
    )

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.RELATIONSHIP_VISIBILITY_TOO_LOW in _codes(errors)
    bad = next(e for e in errors if e.code == ScenarioErrorCode.RELATIONSHIP_VISIBILITY_TOO_LOW)
    assert bad.subject_id == "rel_003"


def test_evidence_with_no_mentions_and_no_sent_by() -> None:
    scenario = _base_scenario()
    scenario.evidence.append(_message("message_02", sent_by=None, sent_to=[], mentions=[]))

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.EVIDENCE_MISSING_LINK in _codes(errors)
    bad = next(e for e in errors if e.code == ScenarioErrorCode.EVIDENCE_MISSING_LINK)
    assert bad.subject_id == "message_02"


def test_entity_missing_required_property() -> None:
    scenario = _base_scenario()
    incomplete_props = dict(_PERSON_PROPS)
    del incomplete_props["credit_score"]
    scenario.entities.append(
        EntitySpec(
            id="person_03",
            label=NodeLabel.PERSON,
            visible_from_round=1,
            label_display="person_03",
            properties=incomplete_props,
        )
    )
    # keep it reachable so this test isolates the missing-property error
    scenario.relationships.append(_used_device_rel("rel_003", "person_03", "device_01"))

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.MISSING_REQUIRED_PROPERTY in _codes(errors)
    bad = next(e for e in errors if e.code == ScenarioErrorCode.MISSING_REQUIRED_PROPERTY)
    assert bad.subject_id == "person_03"
    assert "credit_score" in bad.message


def test_duplicate_relationship_id() -> None:
    scenario = _base_scenario()
    scenario.entities.append(_device("device_02"))
    scenario.relationships.append(
        _used_device_rel("rel_001", "person_01", "device_02")
    )  # rel_001 already used by the baseline

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.DUPLICATE_ID in _codes(errors)


def test_orphan_node_unreachable_from_any_person() -> None:
    scenario = _base_scenario()
    scenario.entities.append(_device("device_99"))  # never referenced by anything

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.ORPHAN_NODE in _codes(errors)
    orphan = next(e for e in errors if e.code == ScenarioErrorCode.ORPHAN_NODE)
    assert orphan.subject_id == "device_99"


def test_no_person_entities() -> None:
    scenario = _base_scenario()
    scenario.entities = [e for e in scenario.entities if e.label != NodeLabel.PERSON]
    # drop everything that referenced the now-missing persons too
    scenario.relationships = []
    scenario.evidence = []

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.NO_PERSON_ENTITIES in _codes(errors)


def test_relationship_id_regex_violation() -> None:
    scenario = _base_scenario()
    scenario.entities.append(_device("device_02"))
    scenario.relationships.append(
        RelationshipSpec(
            id="rel_1",  # needs exactly 3 digits
            type=RelationshipType.USED_DEVICE,
            start_id="person_01",
            end_id="device_02",
            visible_from_round=1,
            source="s",
            confidence=0.9,
        )
    )

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.ID_REGEX_VIOLATION in _codes(errors)


def test_invalid_relationship_endpoint_labels() -> None:
    scenario = _base_scenario()
    # RELATED_TO is Person<->Person only; pointing it at a Device is bogus.
    scenario.relationships.append(
        RelationshipSpec(
            id="rel_003",
            type=RelationshipType.RELATED_TO,
            start_id="person_01",
            end_id="device_01",
            visible_from_round=1,
            source="s",
            confidence=0.9,
        )
    )

    errors = validate_scenario(scenario)

    assert ScenarioErrorCode.INVALID_RELATIONSHIP_ENDPOINT_LABELS in _codes(errors)
