"""Regressions for the two bugs that made the investigator look broken.

Both shipped green: the code ran, returned HTTP 200, charged credits — and
told the team nothing. Neither was caught by a test asserting "no exception".
"""

from __future__ import annotations

from operation_nexus.ai.graph.investigation_graph import _render_subgraph
from operation_nexus.domain.graph.payload import GraphNode, GraphPayload, GraphRelationship


def _payload() -> GraphPayload:
    return GraphPayload(
        nodes=[
            GraphNode(
                id="person_05",
                labels=["Person"],
                properties={"name": "Roberto Alves", "credit_score": 812, "embedding": [0.1] * 8},
                label_display="Roberto Alves",
            ),
            GraphNode(
                id="device_17",
                labels=["Device"],
                properties={"fingerprint": "abc"},
                label_display="Notebook Acer",
            ),
        ],
        relationships=[
            GraphRelationship(
                id="rel_014",
                type="USED_DEVICE",
                start_id="person_05",
                end_id="device_17",
                properties={"confidence": 0.97},
            )
        ],
    )


def test_subgraph_is_rendered_for_the_synthesizer() -> None:
    """Five of seven tools return graph structure and zero Evidence nodes.

    When the synthesizer only saw `evidence_refs`, those five answered
    "no evidence found" on a query that had actually succeeded.
    """
    rendered = _render_subgraph(_payload())

    assert "Roberto Alves" in rendered
    assert "812" in rendered
    assert "USED_DEVICE" in rendered
    # Relationships must be rendered with human endpoints, not bare ids.
    assert "(Roberto Alves) -[USED_DEVICE]-> (Notebook Acer)" in rendered


def test_rendered_subgraph_never_leaks_embeddings() -> None:
    """`embedding` is stripped at the payload boundary; prove it stays out of
    the prompt too — 1536 floats would blow the context and leak nothing useful."""
    assert "embedding" not in _render_subgraph(_payload())


def test_empty_subgraph_is_explicit() -> None:
    rendered = _render_subgraph(GraphPayload.empty())
    assert "nenhum" in rendered.lower()
