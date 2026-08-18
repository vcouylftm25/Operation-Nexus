"""The security boundary: turns validated tool arguments into parameterized Cypher.

CONTRACT.md §0 rule 3: the LLM never writes Cypher — it emits a validated
`InvestigationPlan`, and this module is the *only* place that turns a tool
call into a query string. Rules enforced here, unconditionally:

* Every value (ids, numbers, strings, lists) is passed as a bound parameter.
  Nothing user-supplied is ever f-string'd into the query text.
* The only things ever interpolated into the query text are Cypher syntax
  Neo4j does not accept as parameters: label names, relationship type names,
  and variable-length path bounds. Labels/types are interpolated *only* after
  being validated against the enums in `domain/graph/schema.py`; path bounds
  are interpolated only after being clamped to an int inside this module.
* `visibility_clause()` is the single helper that builds the round-visibility
  predicate (CONTRACT.md §3) and every builder function below uses it — there
  is no other way to filter by round in this codebase.
* Hard caps (`max_hops<=4`, `top_k<=10`, `len(entity_ids)<=8`) are enforced
  *here*, inside the builder, not left to the caller.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from typing import Any

from operation_nexus.domain.graph.schema import (
    SHARED_ENTITY_LABELS,
    NodeLabel,
    RelationshipType,
    vector_index_name,
)

#: CONTRACT.md §4 hard caps.
MAX_HOPS_CAP: int = 4
TOP_K_CAP: int = 10
ENTITY_IDS_CAP: int = 8
#: `expand_neighborhood` only ever accepts 1 or 2 hops (CONTRACT.md §4).
NEIGHBORHOOD_HOPS: tuple[int, ...] = (1, 2)

CypherQuery = tuple[str, dict[str, Any]]


# --------------------------------------------------------------------------
# The one visibility helper. Nothing bypasses it.
# --------------------------------------------------------------------------


def visibility_clause(
    aliases: Sequence[str] = (),
    path_alias: str | None = None,
    *,
    round_param: str = "current_round",
) -> str:
    """Build the round-visibility WHERE-fragment from CONTRACT.md §3.

    `aliases` are Cypher variables bound to a node *or* relationship (both
    carry `visible_from_round`, so the same fragment works for either) that
    must individually satisfy `alias.visible_from_round <= $current_round`.

    `path_alias`, if given, additionally requires every node and every
    relationship along that path to be visible — this is what makes
    `find_path` / `expand_neighborhood` safe: a path is only ever returned if
    *nothing* along it — not just its endpoints — is round-gated shut.

    Always references `$<round_param>` (default `$current_round`) as a bound
    parameter; the round number itself is never interpolated into the query
    text.
    """
    if not aliases and path_alias is None:
        raise ValueError("visibility_clause requires at least one alias or a path_alias")

    clauses = [f"{alias}.visible_from_round <= ${round_param}" for alias in aliases]
    if path_alias is not None:
        clauses.append(
            f"all(_vn IN nodes({path_alias}) WHERE _vn.visible_from_round <= ${round_param})"
        )
        clauses.append(
            f"all(_vr IN relationships({path_alias}) "
            f"WHERE _vr.visible_from_round <= ${round_param})"
        )
    return " AND ".join(clauses)


# --------------------------------------------------------------------------
# Defensive validation / clamping helpers.
# --------------------------------------------------------------------------


def _clamp_max_hops(max_hops: int) -> int:
    return max(1, min(int(max_hops), MAX_HOPS_CAP))


def _clamp_neighborhood_hops(hops: int) -> int:
    return 2 if int(hops) >= 2 else 1


def _clamp_top_k(top_k: int) -> int:
    return max(1, min(int(top_k), TOP_K_CAP))


def _clamp_entity_ids(entity_ids: Sequence[str]) -> list[str]:
    return list(entity_ids[:ENTITY_IDS_CAP])


def _split_via(values: Sequence[str]) -> tuple[list[str] | None, list[str] | None]:
    """`via` may be node labels (Device, Phone, ...) OR relationship types
    (USED_DEVICE, ...). CONTRACT.md §4 describes labels; the first query
    builder tests used relationship types. Accept both, fail closed on
    anything else, and never interpolate the values into Cypher text."""
    labels: list[str] = []
    types: list[str] = []
    for value in values:
        try:
            labels.append(NodeLabel(value).value)
            continue
        except ValueError:
            pass
        try:
            types.append(RelationshipType(value).value)
            continue
        except ValueError as exc:
            raise ValueError(f"{value!r} is neither a NodeLabel nor a RelationshipType") from exc
    return (labels or None, types or None)


_SHARED_LABEL_VALUES: list[str] = sorted(label.value for label in SHARED_ENTITY_LABELS)


# --------------------------------------------------------------------------
# One builder per tool (CONTRACT.md §4).
# --------------------------------------------------------------------------


def build_inspect_entity(entity_id: str, current_round: int) -> CypherQuery:
    """`inspect_entity` — node props + visible 1-hop degree summary."""
    cypher = (
        "MATCH (n {id: $entity_id}) "
        f"WHERE {visibility_clause(['n'])} "
        "OPTIONAL MATCH (n)-[r]-(m) "
        f"WHERE {visibility_clause(['r', 'm'])} "
        "RETURN n, r, m"
    )
    params = {"entity_id": entity_id, "current_round": current_round}
    return cypher, params


def build_find_shared_entities(
    entity_ids: Sequence[str],
    current_round: int,
    via: Sequence[str] | None = None,
) -> CypherQuery:
    """`find_shared_entities` — Device/Phone/Email/IP/Address/Account nodes
    connected to 2+ of the given entities, optionally restricted to
    relationship types in `via`."""
    clamped_ids = _clamp_entity_ids(entity_ids)
    if not clamped_ids:
        raise ValueError("find_shared_entities requires at least 1 entity_id")
    via_labels, via_types = _split_via(via) if via else (None, None)

    if len(clamped_ids) == 1:
        # "Who shares a device with Roberto Alves?" — the single most natural
        # round-2 question names ONE person, not two. Anchor on that person and
        # return the shared nodes that reach at least one OTHER person, plus
        # those people. Requiring two anchors here made the question return
        # nothing while still charging the team.
        cypher = (
            "MATCH (anchor {id: $entity_ids[0]})-[r]-(shared) "
            f"WHERE {visibility_clause(['anchor', 'r', 'shared'])} "
            "AND any(lbl IN labels(shared) WHERE lbl IN $shared_labels) "
            "AND ($via_labels IS NULL OR any(lbl IN labels(shared) WHERE lbl IN $via_labels)) "
            "AND ($via_types IS NULL OR type(r) IN $via_types) "
            "MATCH (shared)-[r2]-(other:Person) "
            f"WHERE {visibility_clause(['r2', 'other'])} "
            "AND other.id <> anchor.id "
            "WITH shared, collect(DISTINCT other) AS others, "
            "collect(DISTINCT r) + collect(DISTINCT r2) AS rels, anchor "
            "RETURN shared, others + [anchor] AS anchors, rels"
        )
    else:
        cypher = (
            "UNWIND $entity_ids AS anchor_id "
            "MATCH (anchor {id: anchor_id})-[r]-(shared) "
            f"WHERE {visibility_clause(['anchor', 'r', 'shared'])} "
            "AND any(lbl IN labels(shared) WHERE lbl IN $shared_labels) "
            "AND ($via_labels IS NULL OR any(lbl IN labels(shared) WHERE lbl IN $via_labels)) "
            "AND ($via_types IS NULL OR type(r) IN $via_types) "
            "WITH shared, collect(DISTINCT anchor) AS anchors, collect(DISTINCT r) AS rels "
            "WHERE size(anchors) >= 2 "
            "RETURN shared, anchors, rels"
        )
    params = {
        "entity_ids": clamped_ids,
        "current_round": current_round,
        "shared_labels": _SHARED_LABEL_VALUES,
        "via_labels": via_labels,
        "via_types": via_types,
    }
    return cypher, params


def build_find_path(
    from_id: str,
    to_id: str,
    current_round: int,
    max_hops: int = MAX_HOPS_CAP,
) -> CypherQuery:
    """`find_path` — up to 5 shortest visible paths between two entities.

    `max_hops` is clamped to `[1, 4]` and then interpolated into the
    variable-length pattern bound (`*1..N`) — Neo4j does not accept a
    parameter there. This is safe only because it is our own clamped `int`,
    never a user-supplied string.
    """
    hops = _clamp_max_hops(max_hops)
    cypher = (
        f"MATCH p = (a {{id: $from_id}})-[*1..{hops}]-(b {{id: $to_id}}) "
        f"WHERE {visibility_clause(path_alias='p')} "
        "RETURN p "
        "ORDER BY length(p) ASC "
        "LIMIT 5"
    )
    params = {"from_id": from_id, "to_id": to_id, "current_round": current_round}
    return cypher, params


def build_expand_neighborhood(
    entity_id: str,
    current_round: int,
    hops: int = 1,
) -> CypherQuery:
    """`expand_neighborhood` — subgraph within 1 or 2 visible hops."""
    clamped_hops = _clamp_neighborhood_hops(hops)
    cypher = (
        f"MATCH p = (n {{id: $entity_id}})-[*1..{clamped_hops}]-(m) "
        f"WHERE {visibility_clause(path_alias='p')} "
        "RETURN p"
    )
    params = {"entity_id": entity_id, "current_round": current_round}
    return cypher, params


def build_timeline(
    entity_id: str,
    current_round: int,
    from_ts: datetime | None = None,
    to_ts: datetime | None = None,
) -> CypherQuery:
    """`timeline` — chronologically ordered events touching `entity_id`.

    Different labels store "when did this happen" under different property
    names (`Application.submitted_at`, `Transaction.occurred_at`,
    `Evidence.captured_at`, `Message.sent_at`, `Device.first_seen`,
    `BankAccount.opened_at`, `Document.issued_at`, `Company.founded_at`), so
    the neighbor's event time is picked up via `coalesce` across all of them;
    a relationship's own `timestamp` is used as a fallback.
    """
    cypher = (
        "MATCH (n {id: $entity_id}) "
        f"WHERE {visibility_clause(['n'])} "
        "OPTIONAL MATCH (n)-[r]-(m) "
        f"WHERE {visibility_clause(['r', 'm'])} "
        "WITH n, r, m, coalesce(m.occurred_at, m.captured_at, m.sent_at, m.submitted_at, "
        "m.first_seen, m.opened_at, m.issued_at, m.founded_at, r.timestamp) AS event_time "
        "WHERE event_time IS NOT NULL "
        "AND ($from_ts IS NULL OR event_time >= $from_ts) "
        "AND ($to_ts IS NULL OR event_time <= $to_ts) "
        "RETURN n, r, m, event_time "
        "ORDER BY event_time ASC"
    )
    params = {
        "entity_id": entity_id,
        "current_round": current_round,
        "from_ts": from_ts,
        "to_ts": to_ts,
    }
    return cypher, params


def build_semantic_evidence_search(
    query_text: str,
    current_round: int,
    top_k: int = 5,
    embedding: Sequence[float] | None = None,
) -> CypherQuery:
    """`semantic_evidence_search` — Evidence/Message + graph expansion.

    Runs a VectorCypher pattern across both the `evidence_embedding` and
    `message_embedding` vector indexes when `embedding` is given. When it is
    `None` (AI_ENABLED=false, or the AI agent hasn't computed one), falls back
    to a case-insensitive `CONTAINS` search over `.content` so the tool stays
    usable without any LLM/embedding call — this module never calls Azure.
    """
    clamped_top_k = _clamp_top_k(top_k)

    if embedding is not None:
        evidence_index = vector_index_name(NodeLabel.EVIDENCE)
        message_index = vector_index_name(NodeLabel.MESSAGE)
        cypher = (
            "CALL { "
            f"CALL db.index.vector.queryNodes('{evidence_index}', $top_k, $embedding) "
            "YIELD node, score "
            "WHERE node.visible_from_round <= $current_round "
            "RETURN node, score "
            "UNION ALL "
            f"CALL db.index.vector.queryNodes('{message_index}', $top_k, $embedding) "
            "YIELD node, score "
            "WHERE node.visible_from_round <= $current_round "
            "RETURN node, score "
            "} "
            "WITH node, score "
            "ORDER BY score DESC "
            "LIMIT $top_k "
            "OPTIONAL MATCH (node)-[r]-(m) "
            f"WHERE {visibility_clause(['r', 'm'])} "
            "RETURN node, score, r, m "
            "ORDER BY score DESC"
        )
        params: dict[str, Any] = {
            "embedding": list(embedding),
            "top_k": clamped_top_k,
            "current_round": current_round,
        }
        return cypher, params

    evidence_label = NodeLabel.EVIDENCE.value
    message_label = NodeLabel.MESSAGE.value
    cypher = (
        "MATCH (node) "
        f"WHERE (node:{evidence_label} OR node:{message_label}) "
        f"AND {visibility_clause(['node'])} "
        "AND toLower(node.content) CONTAINS toLower($query_text) "
        "WITH node, 1.0 AS score "
        "ORDER BY node.captured_at DESC "
        "LIMIT $top_k "
        "OPTIONAL MATCH (node)-[r]-(m) "
        f"WHERE {visibility_clause(['r', 'm'])} "
        "RETURN node, score, r, m "
        "ORDER BY score DESC"
    )
    params = {
        "query_text": query_text,
        "top_k": clamped_top_k,
        "current_round": current_round,
    }
    return cypher, params


def build_challenge_hypothesis(
    entity_ids: Sequence[str],
    current_round: int,
    hypothesis: str | None = None,
) -> CypherQuery:
    """`challenge_hypothesis` — relationships/evidence that WEAKEN a hypothesis
    about `entity_ids`.

    `hypothesis` is free text the LLM produced; a deterministic Cypher builder
    cannot interpret its semantics (CONTRACT.md §0 rule 3 forbids the LLM from
    writing Cypher, and this module cannot invent NLU). It is accepted for
    interface parity with the tool signature and for callers that want to log
    it, but does not affect the query: the deterministic counter-evidence
    pattern this implements is always the same shape — family/colleague ties
    between the accused (`RELATED_TO`) that innocently explain any identity
    -linking entity (Device/Phone/Email/IP/Address/BankAccount) they also
    happen to share. That is exactly the example in CONTRACT.md §4: a
    `RELATED_TO {kind: spouse}` edge explaining a shared device.
    """
    del hypothesis  # intentionally unused — see docstring.
    clamped_ids = _clamp_entity_ids(entity_ids)
    if len(clamped_ids) < 2:
        raise ValueError("challenge_hypothesis requires at least 2 entity_ids")

    related_to = RelationshipType.RELATED_TO.value
    cypher = (
        f"MATCH (a)-[fam:{related_to}]-(b) "
        "WHERE a.id IN $entity_ids AND b.id IN $entity_ids AND a.id <> b.id "
        f"AND {visibility_clause(['a', 'b', 'fam'])} "
        "WITH collect(DISTINCT a) AS a_nodes, collect(DISTINCT b) AS b_nodes, "
        "collect(DISTINCT fam) AS fam_rels "
        "OPTIONAL MATCH (a2)-[shared_r1]-(shared)-[shared_r2]-(b2) "
        "WHERE a2.id IN $entity_ids AND b2.id IN $entity_ids AND a2.id <> b2.id "
        "AND any(lbl IN labels(shared) WHERE lbl IN $shared_labels) "
        f"AND {visibility_clause(['a2', 'b2', 'shared', 'shared_r1', 'shared_r2'])} "
        f"AND EXISTS {{ MATCH (a2)-[f:{related_to}]-(b2) "
        "WHERE f.visible_from_round <= $current_round } "
        "RETURN a_nodes, b_nodes, fam_rels, "
        "collect(DISTINCT shared) AS shared_nodes, "
        "collect(DISTINCT shared_r1) AS shared_rels1, "
        "collect(DISTINCT shared_r2) AS shared_rels2, "
        "collect(DISTINCT a2) AS shared_a, "
        "collect(DISTINCT b2) AS shared_b"
    )
    params = {
        "entity_ids": clamped_ids,
        "current_round": current_round,
        "shared_labels": _SHARED_LABEL_VALUES,
    }
    return cypher, params


def build_fetch_discovered(
    node_ids: Sequence[str],
    relationship_ids: Sequence[str],
    current_round: int,
) -> CypherQuery:
    """Hydrate already-discovered ids into a visibility-filtered subgraph."""
    cypher = (
        "OPTIONAL MATCH (n) "
        "WHERE n.id IN $node_ids "
        f"AND {visibility_clause(['n'])} "
        "WITH [x IN collect(DISTINCT n) WHERE x IS NOT NULL] AS nodes "
        "OPTIONAL MATCH (a)-[r]->(b) "
        "WHERE r.id IN $relationship_ids "
        f"AND {visibility_clause(['a', 'b', 'r'])} "
        "RETURN nodes, "
        "[x IN collect(DISTINCT a) WHERE x IS NOT NULL] AS start_nodes, "
        "[x IN collect(DISTINCT b) WHERE x IS NOT NULL] AS end_nodes, "
        "[x IN collect(DISTINCT r) WHERE x IS NOT NULL] AS rels"
    )
    params = {
        "node_ids": list(node_ids),
        "relationship_ids": list(relationship_ids),
        "current_round": current_round,
    }
    return cypher, params


def build_list_case_files(current_round: int) -> CypherQuery:
    """Round-1 docket: visible Person + Application nodes, no relationships.

    These files sit on the table for free — inspecting one still costs credits.
    """
    cypher = (
        "MATCH (n) "
        "WHERE (n:Person OR n:Application) "
        f"AND {visibility_clause(['n'])} "
        "RETURN n "
        "ORDER BY n.id"
    )
    return cypher, {"current_round": current_round}
