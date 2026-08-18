"""Graph schema registry — the single source of truth for labels and relationship types.

CONTRACT.md §3 is authoritative. Nothing outside this module may reference a Neo4j
label or relationship type as a bare string. Every other module (query builders,
the repository, the seeder, scenario validation) imports :class:`NodeLabel` and
:class:`RelationshipType` from here.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Final


class NodeLabel(StrEnum):
    """Every node label that may exist in the investigated-world graph."""

    PERSON = "Person"
    APPLICATION = "Application"
    DEVICE = "Device"
    PHONE = "Phone"
    EMAIL = "Email"
    IP_ADDRESS = "IPAddress"
    ADDRESS = "Address"
    BANK_ACCOUNT = "BankAccount"
    COMPANY = "Company"
    EMPLOYER = "Employer"
    BROKER = "Broker"
    DOCUMENT = "Document"
    EVIDENCE = "Evidence"
    MESSAGE = "Message"
    TRANSACTION = "Transaction"


class RelationshipType(StrEnum):
    """Every relationship type that may exist in the investigated-world graph."""

    SUBMITTED = "SUBMITTED"
    USED_DEVICE = "USED_DEVICE"
    USED_PHONE = "USED_PHONE"
    USED_EMAIL = "USED_EMAIL"
    RESIDES_AT = "RESIDES_AT"
    OWNS_ACCOUNT = "OWNS_ACCOUNT"
    WORKS_AT = "WORKS_AT"
    EMPLOYED_BY = "EMPLOYED_BY"
    RELATED_TO = "RELATED_TO"
    SAME_AS = "SAME_AS"
    ORIGINATED_BY = "ORIGINATED_BY"
    SUPPORTED_BY = "SUPPORTED_BY"
    CONNECTED_FROM = "CONNECTED_FROM"
    TRANSFERRED_TO = "TRANSFERRED_TO"
    FROM_ACCOUNT = "FROM_ACCOUNT"
    TO_ACCOUNT = "TO_ACCOUNT"
    CONTROLLED_BY = "CONTROLLED_BY"
    MENTIONS = "MENTIONS"
    MENTIONS_ACCOUNT = "MENTIONS_ACCOUNT"
    SENT_BY = "SENT_BY"
    SENT_TO = "SENT_TO"


#: Common properties present on every node, regardless of label.
COMMON_NODE_PROPERTIES: Final[frozenset[str]] = frozenset(
    {"id", "visible_from_round", "label_display"}
)

#: Common properties present on every relationship, regardless of type.
COMMON_RELATIONSHIP_PROPERTIES: Final[frozenset[str]] = frozenset(
    {"id", "visible_from_round", "source", "confidence"}
)

#: Label -> required *extra* property names (on top of COMMON_NODE_PROPERTIES),
#: taken verbatim from CONTRACT.md §3.
REQUIRED_PROPERTIES: Final[dict[NodeLabel, frozenset[str]]] = {
    NodeLabel.PERSON: frozenset(
        {"name", "cpf_masked", "age", "occupation", "income_declared", "credit_score"}
    ),
    NodeLabel.APPLICATION: frozenset({"amount", "submitted_at", "status", "product"}),
    NodeLabel.DEVICE: frozenset({"fingerprint", "os", "first_seen"}),
    NodeLabel.PHONE: frozenset({"number_masked", "carrier"}),
    NodeLabel.EMAIL: frozenset({"address"}),
    NodeLabel.IP_ADDRESS: frozenset({"address", "asn", "geo_city"}),
    NodeLabel.ADDRESS: frozenset({"street", "city", "state", "zip"}),
    NodeLabel.BANK_ACCOUNT: frozenset({"bank", "branch", "number_masked", "opened_at"}),
    NodeLabel.COMPANY: frozenset({"name", "cnpj_masked", "founded_at", "sector"}),
    NodeLabel.EMPLOYER: frozenset({"name", "sector"}),
    NodeLabel.BROKER: frozenset({"name", "license_id", "active_since"}),
    NodeLabel.DOCUMENT: frozenset({"doc_type", "issued_at", "issuer"}),
    NodeLabel.EVIDENCE: frozenset({"evidence_type", "content", "captured_at", "source"}),
    NodeLabel.MESSAGE: frozenset({"content", "sent_at", "channel"}),
    NodeLabel.TRANSACTION: frozenset({"amount", "occurred_at", "currency"}),
}

#: Labels whose nodes additionally carry a vector `embedding` property.
EMBEDDED_LABELS: Final[frozenset[NodeLabel]] = frozenset({NodeLabel.EVIDENCE, NodeLabel.MESSAGE})

#: Name of the embedding property. Never leaves the infrastructure layer.
EMBEDDING_PROPERTY: Final[str] = "embedding"

#: Embedding model contract (CONTRACT.md §3).
EMBEDDING_DIMENSIONS: Final[int] = 3072
EMBEDDING_MODEL: Final[str] = "text-embedding-3-large"

#: The "identity-linking" labels `find_shared_entities` and `challenge_hypothesis`
#: search across (CONTRACT.md §4).
SHARED_ENTITY_LABELS: Final[frozenset[NodeLabel]] = frozenset(
    {
        NodeLabel.DEVICE,
        NodeLabel.PHONE,
        NodeLabel.EMAIL,
        NodeLabel.IP_ADDRESS,
        NodeLabel.ADDRESS,
        NodeLabel.BANK_ACCOUNT,
    }
)

#: (start_label, rel_type, end_label) triples, taken verbatim from CONTRACT.md §3.
#: Used by scenario validation to flag relationships between labels that the
#: schema never intends to connect. Not exhaustive of every legal pattern in a
#: property graph, but a very useful "did you typo a type" guard.
RELATIONSHIP_ENDPOINTS: Final[tuple[tuple[NodeLabel, RelationshipType, NodeLabel], ...]] = (
    (NodeLabel.PERSON, RelationshipType.SUBMITTED, NodeLabel.APPLICATION),
    (NodeLabel.PERSON, RelationshipType.USED_DEVICE, NodeLabel.DEVICE),
    (NodeLabel.PERSON, RelationshipType.USED_PHONE, NodeLabel.PHONE),
    (NodeLabel.PERSON, RelationshipType.USED_EMAIL, NodeLabel.EMAIL),
    (NodeLabel.PERSON, RelationshipType.RESIDES_AT, NodeLabel.ADDRESS),
    (NodeLabel.PERSON, RelationshipType.OWNS_ACCOUNT, NodeLabel.BANK_ACCOUNT),
    (NodeLabel.PERSON, RelationshipType.WORKS_AT, NodeLabel.COMPANY),
    (NodeLabel.PERSON, RelationshipType.EMPLOYED_BY, NodeLabel.EMPLOYER),
    (NodeLabel.PERSON, RelationshipType.RELATED_TO, NodeLabel.PERSON),
    (NodeLabel.PERSON, RelationshipType.SAME_AS, NodeLabel.PERSON),
    (NodeLabel.APPLICATION, RelationshipType.ORIGINATED_BY, NodeLabel.BROKER),
    (NodeLabel.APPLICATION, RelationshipType.SUPPORTED_BY, NodeLabel.DOCUMENT),
    (NodeLabel.DEVICE, RelationshipType.CONNECTED_FROM, NodeLabel.IP_ADDRESS),
    (NodeLabel.BANK_ACCOUNT, RelationshipType.TRANSFERRED_TO, NodeLabel.BANK_ACCOUNT),
    (NodeLabel.TRANSACTION, RelationshipType.FROM_ACCOUNT, NodeLabel.BANK_ACCOUNT),
    (NodeLabel.TRANSACTION, RelationshipType.TO_ACCOUNT, NodeLabel.BANK_ACCOUNT),
    (NodeLabel.COMPANY, RelationshipType.CONTROLLED_BY, NodeLabel.PERSON),
    (NodeLabel.EVIDENCE, RelationshipType.MENTIONS, NodeLabel.PERSON),
    (NodeLabel.EVIDENCE, RelationshipType.MENTIONS_ACCOUNT, NodeLabel.BANK_ACCOUNT),
    (NodeLabel.MESSAGE, RelationshipType.MENTIONS, NodeLabel.PERSON),
    (NodeLabel.MESSAGE, RelationshipType.MENTIONS_ACCOUNT, NodeLabel.BANK_ACCOUNT),
    (NodeLabel.MESSAGE, RelationshipType.SENT_BY, NodeLabel.PERSON),
    (NodeLabel.MESSAGE, RelationshipType.SENT_TO, NodeLabel.PERSON),
)


def constraint_statements() -> list[str]:
    """One `IS UNIQUE` constraint on `id` per label (CONTRACT.md §3)."""
    statements = []
    for label in NodeLabel:
        constraint_name = f"{label.value.lower()}_id"
        statements.append(
            f"CREATE CONSTRAINT {constraint_name} IF NOT EXISTS "
            f"FOR (n:{label.value}) REQUIRE n.id IS UNIQUE"
        )
    return statements


def index_statements() -> list[str]:
    """One `visible_from_round` range index per label (CONTRACT.md §3)."""
    statements = []
    for label in NodeLabel:
        index_name = f"{label.value.lower()}_visibility"
        statements.append(
            f"CREATE INDEX {index_name} IF NOT EXISTS "
            f"FOR (n:{label.value}) ON (n.visible_from_round)"
        )
    return statements


def vector_index_statements() -> list[str]:
    """Vector indexes for `Evidence.embedding` and `Message.embedding` (CONTRACT.md §3)."""
    statements = []
    for label in (NodeLabel.EVIDENCE, NodeLabel.MESSAGE):
        index_name = f"{label.value.lower()}_embedding"
        statements.append(
            f"CREATE VECTOR INDEX {index_name} IF NOT EXISTS "
            f"FOR (n:{label.value}) ON (n.{EMBEDDING_PROPERTY}) "
            "OPTIONS {indexConfig: {`vector.dimensions`: "
            f"{EMBEDDING_DIMENSIONS}"
            ", `vector.similarity_function`: 'cosine'}}"
        )
    return statements


def vector_index_name(label: NodeLabel) -> str:
    """Name of the vector index backing `label` (must be one of EMBEDDED_LABELS)."""
    if label not in EMBEDDED_LABELS:
        raise ValueError(f"{label!r} has no vector index; expected one of {EMBEDDED_LABELS!r}")
    return f"{label.value.lower()}_embedding"
