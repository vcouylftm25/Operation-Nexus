# Operation Nexus — Shared Contract (v0.1)

> **This file is the single source of truth.** Every agent working on this repo MUST
> conform to the names, IDs, costs, events and signatures below. If something is
> missing, follow the closest existing convention — do NOT invent a parallel one.

## 0. Golden rules

1. **Neo4j models the investigated world. Postgres models the game.** Never mix.
2. **The browser never talks to Neo4j.** Every query goes through the API.
3. **The LLM never writes Cypher.** It emits a validated `InvestigationPlan`; a
   deterministic Query Builder turns tool calls into parameterized Cypher.
4. **The LLM never sees ground truth.** `ground_truth.yaml` is loaded ONLY by the
   scoring module. It must never enter a prompt, a tool result, or an API response
   before `GAME_FINISHED`.
5. **Scoring is 100% deterministic.** No LLM in the scoring path.
6. **Round visibility is enforced server-side** on every node, relationship and evidence.

## 1. Versions (pinned)

| Thing | Version |
|---|---|
| Python | `>=3.13` |
| FastAPI | `>=0.120` |
| Pydantic | `>=2.12` |
| SQLAlchemy | `>=2.0` |
| neo4j driver | `>=6.0` |
| langgraph | `>=1.0` |
| langchain-openai | `>=1.0` |
| Node | `>=22` |
| React | `19.2.x` |
| Vite | `^8` |
| Tailwind | `^4` (via `@tailwindcss/vite`) |
| TypeScript | `^5.9` |

Python package name: `operation_nexus`. Import root: `apps/api/src/operation_nexus`.
Frontend package name: `@operation-nexus/web`. Root: `apps/web`.

## 2. ID conventions (used across Neo4j, Postgres, JSON, API and UI)

Every graph entity has a stable string `id`, lowercase, snake_case, zero-padded:

```
person_01  application_01  device_01  phone_01   email_01
ip_01      address_01      account_01 company_01 broker_01
document_01 evidence_01    message_01 transaction_01
rel_001    (relationships)
```

Regex: `^(person|application|device|phone|email|ip|address|account|company|broker|document|evidence|message|transaction)_\d{2,3}$`
Relationship regex: `^rel_\d{3}$`

Postgres uses UUIDv4 for `game_id`, `team_id`, `action_id`, etc. Never mix the two.

## 3. Neo4j graph schema

### Node labels + required props

Every node carries: `id: string`, `visible_from_round: int` (1..4), `label_display: string`.

| Label | Extra required props |
|---|---|
| `Person` | `name`, `cpf_masked`, `age`, `occupation`, `income_declared`, `credit_score` |
| `Application` | `amount`, `submitted_at`, `status`, `product` |
| `Device` | `fingerprint`, `os`, `first_seen` |
| `Phone` | `number_masked`, `carrier` |
| `Email` | `address` |
| `IPAddress` | `address`, `asn`, `geo_city` |
| `Address` | `street`, `city`, `state`, `zip` |
| `BankAccount` | `bank`, `branch`, `number_masked`, `opened_at` |
| `Company` | `name`, `cnpj_masked`, `founded_at`, `sector` |
| `Employer` | `name`, `sector` |
| `Broker` | `name`, `license_id`, `active_since` |
| `Document` | `doc_type`, `issued_at`, `issuer` |
| `Evidence` | `evidence_type`, `content`, `captured_at`, `source` |
| `Message` | `content`, `sent_at`, `channel` |
| `Transaction` | `amount`, `occurred_at`, `currency` |

`Evidence` and `Message` additionally carry `embedding: list[float]` (3072 dims,
`text-embedding-3-large`) and are indexed by the vector indexes below.

### Relationship types

```
(:Person)-[:SUBMITTED]->(:Application)
(:Person)-[:USED_DEVICE]->(:Device)
(:Person)-[:USED_PHONE]->(:Phone)
(:Person)-[:USED_EMAIL]->(:Email)
(:Person)-[:RESIDES_AT]->(:Address)
(:Person)-[:OWNS_ACCOUNT]->(:BankAccount)
(:Person)-[:WORKS_AT]->(:Company)
(:Person)-[:EMPLOYED_BY]->(:Employer)
(:Person)-[:RELATED_TO]->(:Person)        // prop: kind = spouse|sibling|parent|colleague
(:Person)-[:SAME_AS]->(:Person)           // entity resolution, round 3+
(:Application)-[:ORIGINATED_BY]->(:Broker)
(:Application)-[:SUPPORTED_BY]->(:Document)
(:Device)-[:CONNECTED_FROM]->(:IPAddress)
(:BankAccount)-[:TRANSFERRED_TO]->(:BankAccount)   // via :Transaction props
(:Transaction)-[:FROM_ACCOUNT]->(:BankAccount)
(:Transaction)-[:TO_ACCOUNT]->(:BankAccount)
(:Company)-[:CONTROLLED_BY]->(:Person)
(:Evidence)-[:MENTIONS]->(:Person)
(:Evidence)-[:MENTIONS_ACCOUNT]->(:BankAccount)
(:Message)-[:SENT_BY]->(:Person)
(:Message)-[:SENT_TO]->(:Person)
```

Every relationship carries: `id: string (rel_NNN)`, `visible_from_round: int`,
`source: string`, `confidence: float (0..1)`, optional `timestamp: datetime`.

### Constraints & indexes (created by the seeder, idempotent)

```cypher
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (n:Person) REQUIRE n.id IS UNIQUE;
-- ...one per label...
CREATE INDEX node_visibility IF NOT EXISTS FOR (n:Person) ON (n.visible_from_round);
CREATE VECTOR INDEX evidence_embedding IF NOT EXISTS
  FOR (n:Evidence) ON (n.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 3072, `vector.similarity_function`: 'cosine'}};
CREATE VECTOR INDEX message_embedding IF NOT EXISTS
  FOR (n:Message) ON (n.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 3072, `vector.similarity_function`: 'cosine'}};
```

### Visibility rule (NON-NEGOTIABLE)

Every generated Cypher MUST filter:

```cypher
WHERE n.visible_from_round <= $current_round
AND   ALL(r IN relationships(path) WHERE r.visible_from_round <= $current_round)
```

There is exactly one helper that builds this — `visibility_clause(round)` in
`infrastructure/neo4j/query_builder.py`. Nothing bypasses it.

## 4. Investigation tools (the registry)

Tool name -> credit cost. Costs live in `domain/investigation/costs.py` as a single dict.

| Tool | Cost | Params | Returns |
|---|---|---|---|
| `inspect_entity` | 5 | `entity_id: str` | node props + visible 1-hop degree summary |
| `find_shared_entities` | 10 | `entity_ids: list[str]`, `via: list[str] \| None` | shared Device/Phone/Email/IP/Address/Account nodes |
| `find_path` | 15 | `from_id: str`, `to_id: str`, `max_hops: int = 4` | up to 5 shortest visible paths |
| `expand_neighborhood` | 15 (1 hop) / 20 (2 hops) | `entity_id: str`, `hops: 1\|2` | subgraph |
| `timeline` | 10 | `entity_id: str`, `from_ts?`, `to_ts?` | chronologically ordered events |
| `semantic_evidence_search` | 20 | `query: str`, `top_k: int = 5` | Evidence/Message + graph expansion (VectorCypher) |
| `challenge_hypothesis` | 25 | `hypothesis: str`, `entity_ids: list[str]` | counter-evidence only |

`max_hops` hard cap = 4. `top_k` hard cap = 10. `entity_ids` hard cap = 8.
Max **2 tool calls per interaction**. No agent loop.

Tools that DO NOT and MUST NOT exist: `get_fraudsters`, `get_answer`,
`get_ground_truth`, `run_cypher`, `rank_criminals`.

## 5. Pydantic contracts (canonical names)

Location: `domain/investigation/contracts.py` (LLM-facing) and
`domain/game/contracts.py` (game-facing). Re-exported from `operation_nexus.contracts`.

```python
class InvestigationIntent(StrEnum):
    ENTITY_LOOKUP; CONNECTION_SEARCH; PATH_SEARCH; NEIGHBORHOOD; TIMELINE;
    SEMANTIC_SEARCH; HYPOTHESIS_CHALLENGE; OUT_OF_SCOPE

class InvestigationToolCall(BaseModel):
    tool: ToolName                  # StrEnum matching section 4
    arguments: dict[str, Any]
    justification: str

class InvestigationPlan(BaseModel):
    intent: InvestigationIntent
    tool_calls: list[InvestigationToolCall]   # max_length=2
    reasoning_summary: str

class EvidenceRef(BaseModel):
    id: str; evidence_type: str; excerpt: str; source: str; captured_at: datetime | None

class InvestigationAnswer(BaseModel):
    answer: str
    evidence_ids: list[str]
    discovered_node_ids: list[str]
    discovered_relationship_ids: list[str]
    caveats: list[str]

class InvestigationResult(BaseModel):     # what POST /investigate returns
    action_id: UUID
    question: str
    plan: InvestigationPlan
    answer: InvestigationAnswer
    subgraph: GraphPayload
    credits_charged: int
    credits_remaining: int

class GraphNode(BaseModel):
    id: str; labels: list[str]; properties: dict[str, Any]; label_display: str
class GraphRelationship(BaseModel):
    id: str; type: str; start_id: str; end_id: str; properties: dict[str, Any]
class GraphPayload(BaseModel):
    nodes: list[GraphNode]; relationships: list[GraphRelationship]
```

`GraphPayload` is the ONLY graph shape crossing the API boundary. The frontend
maps it to NVL. Embeddings are stripped before serialization — always.

### Accusation

```python
class FraudPattern(StrEnum):
    IDENTITY_RING; MULE_ACCOUNTS; BROKER_COLLUSION; SYNTHETIC_IDENTITIES; OTHER

class Accusation(BaseModel):
    accused_person_ids: list[str]
    coordinator_person_id: str
    pattern: FraudPattern
    evidence_ids: list[str]
    key_relationship_ids: list[str]
    confidence: int          # 0..100
    rationale: str
```

## 6. Scoring (deterministic, `domain/game/scoring.py`)

```
+12  per correct fraudster accused
 -8  per legitimate person accused
+10  correct coordinator
+20  per key relationship discovered (from ground_truth.key_relationships)
+15  per designed false-positive correctly NOT accused
+10  correct fraud pattern
+ 0..10  credit efficiency: round(10 * credits_remaining / credits_total)
```

Score is computed once, at accusation time, from `ground_truth.yaml`. Every award
emits a `ScoreEvent(team_id, round, rule, delta, detail)` row — the breakdown is
what gets shown on the projector.

## 7. Game engine

- 4 rounds. Credits per team **per round**: `[100, 120, 140, 160]`.
- Unspent credits roll over. Budget gate rejects a plan whose cost exceeds balance
  with HTTP 402 + `{"error": "INSUFFICIENT_CREDITS", "required": N, "available": M}`.
- Team session = join code (6 chars, uppercase alphanumeric, no `0O1I`).
- A `Discovery` row is written per (team, node_id | relationship_id) — first time only.

## 8. REST API (prefix `/api/v1`)

```
POST   /games                              -> create game from scenario
GET    /games/{game_id}
POST   /games/{game_id}/teams               -> {name} -> {team_id, join_code}
POST   /teams/join                          -> {join_code} -> team session token
GET    /teams/{team_id}/state               -> credits, discoveries, round
POST   /teams/{team_id}/investigate         -> {question} -> InvestigationResult
POST   /teams/{team_id}/accusation          -> Accusation -> 202
GET    /teams/{team_id}/graph               -> GraphPayload (everything discovered)
POST   /host/games/{game_id}/rounds/next
POST   /host/games/{game_id}/rounds/{n}/start
POST   /host/games/{game_id}/reveal         -> unlock a scripted clue
POST   /host/games/{game_id}/finish         -> computes scores, emits GAME_FINISHED
GET    /host/games/{game_id}/scoreboard
GET    /health  /health/deep
```

Host routes require header `X-Host-Token`. Team routes require `Authorization: Bearer <session token>`.

## 9. WebSocket

`/ws/games/{game_id}?role=team|host|screen&token=...`

Envelope — always:

```json
{"type": "ROUND_STARTED", "game_id": "...", "seq": 42, "ts": "...", "payload": {}}
```

Event types:
`ROUND_STARTED  ROUND_ENDED  TEAM_SCORE_UPDATED  EVIDENCE_UNLOCKED
 GRAPH_DISCOVERY  ACCUSATION_SUBMITTED  GAME_FINISHED  HOST_ANNOUNCEMENT  TICK`

`GRAPH_DISCOVERY` payload is broadcast to `screen` and to the owning team only —
never to rival teams.

## 10. Scenario-as-code

`scenarios/<slug>/` contains:

```
entities.json        # list[EntitySpec]      -> nodes
relationships.json   # list[RelationshipSpec]
evidence.json        # list[EvidenceSpec]    (Evidence + Message nodes)
rounds.yaml          # round -> {title, unlocks, narrative, credits}
ground_truth.yaml    # NEVER loaded outside scoring
scenario.yaml        # name, slug, description, version
```

Validated by Pydantic (`domain/graph/scenario.py`) BEFORE any write. The seeder
fails loudly on: unknown id reference, id regex violation, relationship whose
`visible_from_round` is lower than either endpoint's, evidence with no `MENTIONS`,
ground truth referencing a non-existent id.

CLI: `uv run operation-nexus seed operation_nexus [--embeddings] [--drop]`

## 11. Environment variables

```
APP_ENV=local
API_HOST=0.0.0.0
API_PORT=8000
HOST_TOKEN=<secret>
SESSION_SECRET=<secret>
POSTGRES_DSN=postgresql+psycopg://nexus:nexus@localhost:5432/nexus
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=nexus_dev_password
AZURE_OPENAI_BASE_URL=https://<resource>.openai.azure.com/openai/v1/
AZURE_OPENAI_API_KEY=<secret>
AZURE_CHAT_DEPLOYMENT=gpt-5.4-mini
AZURE_REASONING_DEPLOYMENT=gpt-5.6-sol
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-large
AI_ENABLED=false          # phase 2/3 run without any LLM
LANGSMITH_TRACING=false
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000
```

Loaded via `pydantic-settings` in `infrastructure/settings.py`. **No secret ever
reaches the frontend.**

## 12. Ports

| Service | Port |
|---|---|
| web (vite) | 5173 |
| api | 8000 |
| postgres | 5432 |
| neo4j bolt | 7687 |
| neo4j http | 7474 |

## 13. Code style

- Python: Ruff (line-length 100), Pyright strict on `domain/`, `from __future__ import annotations`.
- No `Any` in domain signatures. No framework imports inside `domain/`.
- TS: no `any`, no default exports for components, `type` imports explicit.
- Tests colocated under `apps/api/tests/{unit,integration,golden}`.

## 14. Scenario file formats (exact)

`entities.json` — `{"entities": [EntitySpec, ...]}`

```json
{"id": "person_03", "label": "Person", "visible_from_round": 1,
 "label_display": "Roberto Alves",
 "properties": {"name": "Roberto Alves", "cpf_masked": "***.456.789-**",
                "age": 41, "occupation": "Autônomo",
                "income_declared": 8200.0, "credit_score": 812}}
```

`relationships.json` — `{"relationships": [RelationshipSpec, ...]}`

```json
{"id": "rel_014", "type": "USED_DEVICE", "start_id": "person_03",
 "end_id": "device_17", "visible_from_round": 2,
 "source": "device_fingerprinting", "confidence": 0.97,
 "timestamp": "2026-03-11T14:22:00Z", "properties": {}}
```

`evidence.json` — `{"evidence": [EvidenceSpec, ...]}` — produces `Evidence` **or**
`Message` nodes plus their `MENTIONS` / `SENT_BY` / `SENT_TO` relationships.

```json
{"id": "message_31", "kind": "Message", "visible_from_round": 3,
 "label_display": "WhatsApp — 12/03 21:14",
 "content": "ele só precisa colocar no nome dele, o resto a gente resolve",
 "captured_at": "2026-03-12T21:14:00Z", "source": "seized_device",
 "channel": "whatsapp", "sent_by": "person_08", "sent_to": ["person_03"],
 "mentions": ["person_11"], "mentions_accounts": []}
```

```json
{"id": "evidence_07", "kind": "Evidence", "visible_from_round": 4,
 "label_display": "Extrato bancário — Conta 82",
 "content": "Três depósitos de R$ 9.800 em 48h, todos abaixo do limite de reporte.",
 "captured_at": "2026-03-18T00:00:00Z", "source": "bank_statement",
 "evidence_type": "financial_record",
 "mentions": ["person_08"], "mentions_accounts": ["account_82"]}
```

`rounds.yaml`

```yaml
rounds:
  - number: 1
    title: "Individualmente, tudo parece normal"
    narrative: "..."
    credits: 100
    unlocks: ["Person", "Application"]
    duration_seconds: 600
```

`ground_truth.yaml` — **quarantined**. Only `domain/game/scoring.py` may read it.

```yaml
fraudsters: [person_03, person_08, person_14]
coordinator: person_08
pattern: IDENTITY_RING
key_relationships: [rel_008, rel_011, rel_029]
designed_false_positives: [person_05, person_12]
decoy_notes: "person_05 has the worst credit score and is fully legitimate"
```

## 15. File ownership (parallel build)

| Path | Owner |
|---|---|
| `/CONTRACT.md`, `apps/api/pyproject.toml` | orchestrator — do not edit |
| root dotfiles, `Makefile`, `infra/`, `.github/` | infra agent |
| `domain/game`, `application`, `infrastructure/postgres`, `infrastructure/settings.py`, `api/` | engine agent |
| `domain/graph`, `infrastructure/neo4j`, `cli.py` | graph agent |
| `domain/investigation`, `ai/`, `infrastructure/azure_openai` | ai agent |
| `apps/web/` | web agent |
| `scenarios/operation_nexus/`, `docs/` | scenario agent |

Never create a file outside your own rows. If you need something from another
owner, import it by the name this contract gives and assume it exists.
