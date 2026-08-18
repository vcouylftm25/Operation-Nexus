"""query_builder is the security boundary (CONTRACT.md §3, §4): every value
must be a bound parameter, never interpolated text; `visibility_clause()` must
appear in every builder's output; and the hard caps (`max_hops<=4`,
`top_k<=10`, `len(entity_ids)<=8`) must be enforced inside the builder."""

from __future__ import annotations

import pytest

from operation_nexus.infrastructure.neo4j import query_builder as qb

VISIBILITY_SNIPPET = "visible_from_round <= $current_round"


def _assert_visibility_present(cypher: str) -> None:
    assert VISIBILITY_SNIPPET in cypher, cypher


# --------------------------------------------------------------------------
# visibility_clause() itself
# --------------------------------------------------------------------------


def test_visibility_clause_requires_an_alias_or_a_path() -> None:
    with pytest.raises(ValueError):
        qb.visibility_clause([])


def test_visibility_clause_with_node_aliases() -> None:
    clause = qb.visibility_clause(["a", "b"])
    assert clause == (
        "a.visible_from_round <= $current_round AND b.visible_from_round <= $current_round"
    )


def test_visibility_clause_with_path_alias_covers_nodes_and_relationships() -> None:
    clause = qb.visibility_clause(path_alias="p")
    assert "nodes(p)" in clause
    assert "relationships(p)" in clause
    _assert_visibility_present(clause)


# --------------------------------------------------------------------------
# visibility_clause present in EVERY builder
# --------------------------------------------------------------------------


def test_inspect_entity_has_visibility_clause() -> None:
    cypher, _ = qb.build_inspect_entity("person_01", 2)
    _assert_visibility_present(cypher)


def test_find_shared_entities_has_visibility_clause() -> None:
    cypher, _ = qb.build_find_shared_entities(["person_01", "person_02"], 2)
    _assert_visibility_present(cypher)


def test_find_path_has_visibility_clause() -> None:
    cypher, _ = qb.build_find_path("person_01", "person_02", 2)
    _assert_visibility_present(cypher)


def test_expand_neighborhood_has_visibility_clause() -> None:
    cypher, _ = qb.build_expand_neighborhood("person_01", 2)
    _assert_visibility_present(cypher)


def test_timeline_has_visibility_clause() -> None:
    cypher, _ = qb.build_timeline("person_01", 2)
    _assert_visibility_present(cypher)


def test_semantic_evidence_search_fallback_has_visibility_clause() -> None:
    cypher, _ = qb.build_semantic_evidence_search("query text", 2)
    _assert_visibility_present(cypher)


def test_semantic_evidence_search_with_embedding_has_visibility_clause() -> None:
    cypher, _ = qb.build_semantic_evidence_search("query text", 2, embedding=[0.1, 0.2, 0.3])
    _assert_visibility_present(cypher)


def test_fetch_discovered_has_visibility_clause() -> None:
    cypher, params = qb.build_fetch_discovered(["person_01"], ["rel_001"], 2)
    _assert_visibility_present(cypher)
    assert "person_01" not in cypher
    assert params["node_ids"] == ["person_01"]
    assert params["relationship_ids"] == ["rel_001"]


# --------------------------------------------------------------------------
# No user value ever interpolated into the cypher text
# --------------------------------------------------------------------------


def test_inspect_entity_parameterizes_entity_id() -> None:
    cypher, params = qb.build_inspect_entity("person_should_not_leak", 3)
    assert "person_should_not_leak" not in cypher
    assert params["entity_id"] == "person_should_not_leak"
    assert params["current_round"] == 3


def test_find_shared_entities_parameterizes_ids_and_via() -> None:
    cypher, params = qb.build_find_shared_entities(
        ["person_should_not_leak_1", "person_should_not_leak_2"], 3, via=["USED_DEVICE"]
    )
    assert "person_should_not_leak_1" not in cypher
    assert "USED_DEVICE" not in cypher  # `via` is a bound parameter, not interpolated
    assert params["entity_ids"] == ["person_should_not_leak_1", "person_should_not_leak_2"]
    assert params["via_types"] == ["USED_DEVICE"]
    assert params["via_labels"] is None


def test_find_shared_entities_accepts_via_node_label() -> None:
    _, params = qb.build_find_shared_entities(["person_01", "person_02"], 2, via=["Device"])
    assert params["via_labels"] == ["Device"]
    assert params["via_types"] is None


def test_find_shared_entities_rejects_unknown_relationship_type() -> None:
    with pytest.raises(ValueError):
        qb.build_find_shared_entities(["a_01", "b_01"], 1, via=["NOT_A_REAL_TYPE"])


def test_find_shared_entities_requires_at_least_two_entities() -> None:
    with pytest.raises(ValueError):
        qb.build_find_shared_entities(["only_one_01"], 1)


def test_find_path_parameterizes_ids() -> None:
    cypher, params = qb.build_find_path("person_should_not_leak_1", "person_should_not_leak_2", 2)
    assert "person_should_not_leak_1" not in cypher
    assert params["from_id"] == "person_should_not_leak_1"


def test_timeline_parameterizes_entity_id_and_range() -> None:
    cypher, params = qb.build_timeline("person_should_not_leak", 2)
    assert "person_should_not_leak" not in cypher
    assert params["from_ts"] is None
    assert params["to_ts"] is None


def test_semantic_evidence_search_parameterizes_query_text() -> None:
    cypher, params = qb.build_semantic_evidence_search("secret query text", 2)
    assert "secret query text" not in cypher
    assert params["query_text"] == "secret query text"
    assert "CONTAINS" in cypher


def test_semantic_evidence_search_parameterizes_embedding_vector() -> None:
    embedding = [0.123456, 0.654321, 0.999999]
    cypher, params = qb.build_semantic_evidence_search("q", 2, embedding=embedding)
    assert "0.123456" not in cypher
    assert params["embedding"] == embedding
    assert "vector.queryNodes" in cypher


def test_challenge_hypothesis_parameterizes_ids_and_drops_hypothesis_text() -> None:
    cypher, params = qb.build_challenge_hypothesis(
        ["person_should_not_leak_1", "person_should_not_leak_2"],
        2,
        hypothesis="secret hypothesis text",
    )
    assert "person_should_not_leak_1" not in cypher
    assert "secret hypothesis text" not in cypher
    assert "hypothesis" not in params


def test_challenge_hypothesis_requires_at_least_two_entities() -> None:
    with pytest.raises(ValueError):
        qb.build_challenge_hypothesis(["only_one_01"], 1)


# --------------------------------------------------------------------------
# Hard caps enforced inside the builder (CONTRACT.md §4)
# --------------------------------------------------------------------------


def test_entity_ids_hard_cap_clamps_to_eight() -> None:
    too_many = [f"person_{i:02d}" for i in range(20)]
    _, params = qb.build_find_shared_entities(too_many, 1)
    assert len(params["entity_ids"]) == qb.ENTITY_IDS_CAP == 8


def test_challenge_hypothesis_entity_ids_hard_cap_clamps_to_eight() -> None:
    too_many = [f"person_{i:02d}" for i in range(20)]
    _, params = qb.build_challenge_hypothesis(too_many, 1)
    assert len(params["entity_ids"]) == qb.ENTITY_IDS_CAP == 8


def test_top_k_hard_cap_clamps() -> None:
    _, params = qb.build_semantic_evidence_search("q", 1, top_k=1000)
    assert params["top_k"] == qb.TOP_K_CAP == 10


def test_top_k_clamps_up_from_zero() -> None:
    _, params = qb.build_semantic_evidence_search("q", 1, top_k=0)
    assert params["top_k"] == 1


def test_max_hops_hard_cap_clamps() -> None:
    cypher, _ = qb.build_find_path("a_01", "b_01", 1, max_hops=1000)
    assert f"*1..{qb.MAX_HOPS_CAP}" in cypher
    assert "1000" not in cypher


def test_max_hops_clamps_up_from_zero() -> None:
    cypher, _ = qb.build_find_path("a_01", "b_01", 1, max_hops=0)
    assert "*1..1" in cypher


def test_expand_neighborhood_hops_clamped_to_one_or_two() -> None:
    cypher_one, _ = qb.build_expand_neighborhood("a_01", 1, hops=1)
    assert "*1..1" in cypher_one

    cypher_two, _ = qb.build_expand_neighborhood("a_01", 1, hops=2)
    assert "*1..2" in cypher_two

    cypher_over, _ = qb.build_expand_neighborhood("a_01", 1, hops=999)
    assert "*1..2" in cypher_over
    assert "999" not in cypher_over


def test_list_case_files_is_visibility_filtered_and_parameterized() -> None:
    cypher, params = qb.build_list_case_files(2)
    _assert_visibility_present(cypher)
    assert "n:Person" in cypher
    assert "n:Application" in cypher
    assert "2" not in cypher
    assert params["current_round"] == 2
