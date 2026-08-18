"""Scenario-as-code Pydantic specs and offline validation (CONTRACT.md §10, §14).

These models mirror the JSON/YAML file formats in CONTRACT.md §14 **exactly** —
that shape is the contract with the scenario-authoring agent, so field names
and nesting must not drift from it.

`validate_scenario()` is a pure function: it takes an already-parsed
`ScenarioSpec` and returns a list of `ScenarioError`. It never touches the
filesystem and never touches `ground_truth.yaml` (which is quarantined for
`domain/game/scoring.py` alone, per CONTRACT.md §0 rule 4 and §14). Reading
scenario files off disk is an infrastructure concern — see
`infrastructure/neo4j/seeder.py`.
"""

from __future__ import annotations

import re
from collections import deque
from collections.abc import Iterable, Mapping
from datetime import datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from operation_nexus.domain.graph.schema import (
    RELATIONSHIP_ENDPOINTS,
    REQUIRED_PROPERTIES,
    NodeLabel,
    RelationshipType,
)

MIN_ROUND: int = 1
MAX_ROUND: int = 4

#: CONTRACT.md §2 — verbatim.
ENTITY_ID_PATTERN: re.Pattern[str] = re.compile(
    r"^(person|application|device|phone|email|ip|address|account|company|broker"
    r"|document|evidence|message|transaction)_\d{2,3}$"
)
RELATIONSHIP_ID_PATTERN: re.Pattern[str] = re.compile(r"^rel_\d{3}$")


# --------------------------------------------------------------------------
# Specs — CONTRACT.md §14, exact shapes.
# --------------------------------------------------------------------------


class EntitySpec(BaseModel):
    """One entry of `entities.json`'s `entities` list."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label: NodeLabel
    visible_from_round: int
    label_display: str
    properties: dict[str, Any] = Field(default_factory=dict)


class RelationshipSpec(BaseModel):
    """One entry of `relationships.json`'s `relationships` list."""

    model_config = ConfigDict(extra="forbid")

    id: str
    type: RelationshipType
    start_id: str
    end_id: str
    visible_from_round: int
    source: str
    confidence: float = Field(ge=0.0, le=1.0)
    timestamp: datetime | None = None
    properties: dict[str, Any] = Field(default_factory=dict)


class EvidenceKind(StrEnum):
    EVIDENCE = "Evidence"
    MESSAGE = "Message"

    def to_node_label(self) -> NodeLabel:
        return NodeLabel.EVIDENCE if self is EvidenceKind.EVIDENCE else NodeLabel.MESSAGE


class EvidenceSpec(BaseModel):
    """One entry of `evidence.json`'s `evidence` list.

    Produces either an `Evidence` or a `Message` node plus its `MENTIONS` /
    `MENTIONS_ACCOUNT` / `SENT_BY` / `SENT_TO` relationships. `kind` picks
    which; `evidence_type` is meaningful only for `Evidence`, `channel` /
    `sent_by` / `sent_to` only for `Message` — both are optional here so one
    model can represent both JSON shapes from CONTRACT.md §14.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal["Evidence", "Message"]
    visible_from_round: int
    label_display: str
    content: str
    captured_at: datetime
    source: str
    evidence_type: str | None = None
    channel: str | None = None
    sent_by: str | None = None
    sent_to: list[str] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    mentions_accounts: list[str] = Field(default_factory=list)

    @property
    def node_label(self) -> NodeLabel:
        return EvidenceKind(self.kind).to_node_label()


class RoundSpec(BaseModel):
    """One entry of `rounds.yaml`'s `rounds` list."""

    model_config = ConfigDict(extra="forbid")

    number: int
    title: str
    narrative: str
    credits: int
    unlocks: list[NodeLabel] = Field(default_factory=list)
    duration_seconds: int


class ScenarioMeta(BaseModel):
    """`scenario.yaml` — top-level scenario metadata."""

    model_config = ConfigDict(extra="forbid")

    name: str
    slug: str
    description: str
    version: str


class ScenarioSpec(BaseModel):
    """The whole scenario, assembled from the five files under `scenarios/<slug>/`.

    Deliberately excludes `ground_truth.yaml` — that file is quarantined for
    `domain/game/scoring.py` and must never be loaded as part of graph seeding
    or validation (CONTRACT.md §0 rule 4).
    """

    model_config = ConfigDict(extra="forbid")

    meta: ScenarioMeta
    entities: list[EntitySpec] = Field(default_factory=list)
    relationships: list[RelationshipSpec] = Field(default_factory=list)
    evidence: list[EvidenceSpec] = Field(default_factory=list)
    rounds: list[RoundSpec] = Field(default_factory=list)


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------


class ScenarioErrorCode(StrEnum):
    ID_REGEX_VIOLATION = "id_regex_violation"
    DUPLICATE_ID = "duplicate_id"
    UNKNOWN_ENTITY_REFERENCE = "unknown_entity_reference"
    RELATIONSHIP_VISIBILITY_TOO_LOW = "relationship_visibility_too_low"
    EVIDENCE_MISSING_LINK = "evidence_missing_link"
    MISSING_REQUIRED_PROPERTY = "missing_required_property"
    ORPHAN_NODE = "orphan_node"
    NO_PERSON_ENTITIES = "no_person_entities"
    INVALID_ROUND_NUMBER = "invalid_round_number"
    INVALID_RELATIONSHIP_ENDPOINT_LABELS = "invalid_relationship_endpoint_labels"


class ScenarioError(BaseModel):
    """One human-readable, actionable validation failure.

    This is what a scenario author stares at 20 minutes before the talk —
    `message` must say exactly what is wrong and, ideally, how to fix it.
    """

    model_config = ConfigDict(frozen=True)

    code: ScenarioErrorCode
    message: str
    subject_id: str | None = None
    source_file: str | None = None

    def __str__(self) -> str:
        location = f"[{self.source_file}] " if self.source_file else ""
        subject = f" (id={self.subject_id})" if self.subject_id else ""
        return f"{location}{self.code.value}{subject}: {self.message}"


def validate_scenario(scenario: ScenarioSpec) -> list[ScenarioError]:
    """Validate a fully-parsed scenario and return every problem found.

    Never raises on data problems (that's the point — a scenario author wants
    the full list, not a stack trace on the first bad id) and never touches
    `ground_truth.yaml`. Collects, at minimum: id regex violations, duplicate
    ids, relationships referencing unknown entities, relationships visible
    before either endpoint, evidence with neither `mentions` nor `sent_by`,
    entities missing a required property for their label, and orphan nodes
    unreachable from any `Person`.
    """
    errors: list[ScenarioError] = []

    entities_by_id = {entity.id: entity for entity in scenario.entities}
    evidence_by_id = {ev.id: ev for ev in scenario.evidence}

    _check_ids(scenario, entities_by_id, evidence_by_id, errors)

    node_round = _node_visibility_rounds(entities_by_id, evidence_by_id)
    known_ids = set(entities_by_id) | set(evidence_by_id)

    _check_relationships(scenario, known_ids, node_round, entities_by_id, evidence_by_id, errors)
    _check_evidence(scenario, known_ids, errors)
    _check_required_properties(scenario, errors)
    _check_round_bounds(scenario, errors)
    _check_reachability(scenario, entities_by_id, evidence_by_id, known_ids, errors)

    return errors


def _check_ids(
    scenario: ScenarioSpec,
    entities_by_id: Mapping[str, EntitySpec],
    evidence_by_id: Mapping[str, EvidenceSpec],
    errors: list[ScenarioError],
) -> None:
    seen_node_ids: dict[str, str] = {}
    for entity in scenario.entities:
        _check_id_regex(entity.id, ENTITY_ID_PATTERN, "entities", errors)
        _check_duplicate(entity.id, "entities", seen_node_ids, errors)
    for ev in scenario.evidence:
        _check_id_regex(ev.id, ENTITY_ID_PATTERN, "evidence", errors)
        _check_duplicate(ev.id, "evidence", seen_node_ids, errors)

    seen_rel_ids: dict[str, str] = {}
    for rel in scenario.relationships:
        _check_id_regex(rel.id, RELATIONSHIP_ID_PATTERN, "relationships", errors)
        _check_duplicate(rel.id, "relationships", seen_rel_ids, errors)


def _check_id_regex(
    id_: str, pattern: re.Pattern[str], source_file: str, errors: list[ScenarioError]
) -> None:
    if not pattern.match(id_):
        errors.append(
            ScenarioError(
                code=ScenarioErrorCode.ID_REGEX_VIOLATION,
                subject_id=id_,
                source_file=source_file,
                message=(
                    f"id '{id_}' does not match the required pattern "
                    f"{pattern.pattern!r} (CONTRACT.md §2)."
                ),
            )
        )


def _check_duplicate(
    id_: str, source_file: str, seen: dict[str, str], errors: list[ScenarioError]
) -> None:
    if id_ in seen:
        errors.append(
            ScenarioError(
                code=ScenarioErrorCode.DUPLICATE_ID,
                subject_id=id_,
                source_file=source_file,
                message=(
                    f"id '{id_}' is defined more than once (first seen in "
                    f"{seen[id_]}.json, again in {source_file}.json). Ids must be "
                    "globally unique."
                ),
            )
        )
    else:
        seen[id_] = source_file


def _node_visibility_rounds(
    entities_by_id: Mapping[str, EntitySpec], evidence_by_id: Mapping[str, EvidenceSpec]
) -> dict[str, int]:
    rounds = {eid: e.visible_from_round for eid, e in entities_by_id.items()}
    rounds.update({eid: e.visible_from_round for eid, e in evidence_by_id.items()})
    return rounds


def _label_of(
    node_id: str,
    entities_by_id: Mapping[str, EntitySpec],
    evidence_by_id: Mapping[str, EvidenceSpec],
) -> NodeLabel | None:
    if node_id in entities_by_id:
        return entities_by_id[node_id].label
    if node_id in evidence_by_id:
        return evidence_by_id[node_id].node_label
    return None


def _check_relationships(
    scenario: ScenarioSpec,
    known_ids: set[str],
    node_round: Mapping[str, int],
    entities_by_id: Mapping[str, EntitySpec],
    evidence_by_id: Mapping[str, EvidenceSpec],
    errors: list[ScenarioError],
) -> None:
    for rel in scenario.relationships:
        unknown_endpoints = False
        for endpoint_field, endpoint_id in (("start_id", rel.start_id), ("end_id", rel.end_id)):
            if endpoint_id not in known_ids:
                unknown_endpoints = True
                errors.append(
                    ScenarioError(
                        code=ScenarioErrorCode.UNKNOWN_ENTITY_REFERENCE,
                        subject_id=rel.id,
                        source_file="relationships",
                        message=(
                            f"relationship '{rel.id}' has {endpoint_field}='{endpoint_id}', "
                            "which is not defined in entities.json or evidence.json."
                        ),
                    )
                )

        for endpoint_id in (rel.start_id, rel.end_id):
            endpoint_round = node_round.get(endpoint_id)
            if endpoint_round is not None and rel.visible_from_round < endpoint_round:
                errors.append(
                    ScenarioError(
                        code=ScenarioErrorCode.RELATIONSHIP_VISIBILITY_TOO_LOW,
                        subject_id=rel.id,
                        source_file="relationships",
                        message=(
                            f"relationship '{rel.id}' has visible_from_round="
                            f"{rel.visible_from_round}, but its endpoint '{endpoint_id}' only "
                            f"becomes visible at round {endpoint_round}. A relationship can "
                            "never be visible before either of the nodes it connects — raise "
                            "the relationship's round or lower the node's."
                        ),
                    )
                )

        if unknown_endpoints:
            continue

        start_label = _label_of(rel.start_id, entities_by_id, evidence_by_id)
        end_label = _label_of(rel.end_id, entities_by_id, evidence_by_id)
        if start_label is not None and end_label is not None:
            allowed = (start_label, rel.type, end_label)
            if allowed not in RELATIONSHIP_ENDPOINTS:
                errors.append(
                    ScenarioError(
                        code=ScenarioErrorCode.INVALID_RELATIONSHIP_ENDPOINT_LABELS,
                        subject_id=rel.id,
                        source_file="relationships",
                        message=(
                            f"relationship '{rel.id}' connects (:{start_label.value})-"
                            f"[:{rel.type.value}]->(:{end_label.value}), which is not one of "
                            "the patterns in CONTRACT.md §3. Check for a typo'd id or type."
                        ),
                    )
                )


def _check_evidence(
    scenario: ScenarioSpec,
    known_ids: set[str],
    errors: list[ScenarioError],
) -> None:
    for ev in scenario.evidence:
        if not ev.mentions and not ev.sent_by:
            errors.append(
                ScenarioError(
                    code=ScenarioErrorCode.EVIDENCE_MISSING_LINK,
                    subject_id=ev.id,
                    source_file="evidence",
                    message=(
                        f"'{ev.id}' has neither 'mentions' nor 'sent_by' — it would be seeded "
                        "as a disconnected, contextless node that no team could ever discover "
                        "in play. Link it to at least one Person."
                    ),
                )
            )

        referenced: list[tuple[str, list[str]]] = [
            ("sent_by", [ev.sent_by] if ev.sent_by else []),
            ("sent_to", ev.sent_to),
            ("mentions", ev.mentions),
            ("mentions_accounts", ev.mentions_accounts),
        ]
        for field_name, ids in referenced:
            for ref_id in ids:
                if ref_id not in known_ids:
                    errors.append(
                        ScenarioError(
                            code=ScenarioErrorCode.UNKNOWN_ENTITY_REFERENCE,
                            subject_id=ev.id,
                            source_file="evidence",
                            message=(
                                f"'{ev.id}' references '{ref_id}' in '{field_name}', which is "
                                "not defined in entities.json."
                            ),
                        )
                    )


def _check_required_properties(scenario: ScenarioSpec, errors: list[ScenarioError]) -> None:
    for entity in scenario.entities:
        required = REQUIRED_PROPERTIES.get(entity.label, frozenset())
        missing = sorted(required - entity.properties.keys())
        if missing:
            plural = "y" if len(missing) == 1 else "ies"
            errors.append(
                ScenarioError(
                    code=ScenarioErrorCode.MISSING_REQUIRED_PROPERTY,
                    subject_id=entity.id,
                    source_file="entities",
                    message=(
                        f"entity '{entity.id}' (label={entity.label.value}) is missing required "
                        f"propert{plural}: {', '.join(missing)}."
                    ),
                )
            )


def _check_round_bounds(scenario: ScenarioSpec, errors: list[ScenarioError]) -> None:
    def _check(subject_id: str, round_number: int, source_file: str) -> None:
        if not (MIN_ROUND <= round_number <= MAX_ROUND):
            errors.append(
                ScenarioError(
                    code=ScenarioErrorCode.INVALID_ROUND_NUMBER,
                    subject_id=subject_id,
                    source_file=source_file,
                    message=(
                        f"'{subject_id}' has round {round_number}, outside the valid range "
                        f"[{MIN_ROUND}, {MAX_ROUND}]."
                    ),
                )
            )

    for entity in scenario.entities:
        _check(entity.id, entity.visible_from_round, "entities")
    for ev in scenario.evidence:
        _check(ev.id, ev.visible_from_round, "evidence")
    for rel in scenario.relationships:
        _check(rel.id, rel.visible_from_round, "relationships")
    for round_ in scenario.rounds:
        _check(f"round_{round_.number}", round_.number, "rounds")


def _check_reachability(
    scenario: ScenarioSpec,
    entities_by_id: Mapping[str, EntitySpec],
    evidence_by_id: Mapping[str, EvidenceSpec],
    known_ids: set[str],
    errors: list[ScenarioError],
) -> None:
    persons = [eid for eid, e in entities_by_id.items() if e.label == NodeLabel.PERSON]
    if not persons:
        errors.append(
            ScenarioError(
                code=ScenarioErrorCode.NO_PERSON_ENTITIES,
                source_file="entities",
                message=(
                    "scenario defines no Person entities. Nothing is reachable and the game "
                    "has no one to accuse."
                ),
            )
        )
        return

    adjacency = _build_adjacency(scenario, known_ids)
    reachable = _bfs_reachable(persons, adjacency)
    for node_id in sorted(known_ids - reachable):
        label = _label_of(node_id, entities_by_id, evidence_by_id)
        label_str = label.value if label is not None else "?"
        source_file = "entities" if node_id in entities_by_id else "evidence"
        errors.append(
            ScenarioError(
                code=ScenarioErrorCode.ORPHAN_NODE,
                subject_id=node_id,
                source_file=source_file,
                message=(
                    f"node '{node_id}' (label={label_str}) is not reachable from any Person "
                    "through relationships.json or evidence.json links. It will be seeded but "
                    "no team can ever discover it in play — connect it or remove it."
                ),
            )
        )


def _build_adjacency(scenario: ScenarioSpec, known_ids: set[str]) -> dict[str, set[str]]:
    adjacency: dict[str, set[str]] = {}

    def _link(a: str, b: str) -> None:
        if a in known_ids and b in known_ids:
            adjacency.setdefault(a, set()).add(b)
            adjacency.setdefault(b, set()).add(a)

    for rel in scenario.relationships:
        _link(rel.start_id, rel.end_id)

    for ev in scenario.evidence:
        linked_ids: set[str] = set(ev.sent_to) | set(ev.mentions) | set(ev.mentions_accounts)
        if ev.sent_by:
            linked_ids.add(ev.sent_by)
        for other_id in linked_ids:
            _link(ev.id, other_id)

    return adjacency


def _bfs_reachable(starts: Iterable[str], adjacency: Mapping[str, set[str]]) -> set[str]:
    visited: set[str] = set(starts)
    queue: deque[str] = deque(starts)
    while queue:
        current = queue.popleft()
        for neighbor in adjacency.get(current, ()):
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    return visited
