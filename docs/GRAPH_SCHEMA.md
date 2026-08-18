# Graph schema — Operation Nexus

Fonte de verdade das labels, tipos e props:  
[`apps/api/src/operation_nexus/domain/graph/schema.py`](../apps/api/src/operation_nexus/domain/graph/schema.py).

Nada fora desse módulo deve citar um label ou relationship type como string
solta. Query builder, seeder, validação de cenário e testes importam
`NodeLabel` e `RelationshipType`.

Este arquivo **não** copia o Cypher de `query_builder.py`. Mapeia tool →
intenção da query. Autoridade do Cypher parametrizado:  
[`infrastructure/neo4j/query_builder.py`](../apps/api/src/operation_nexus/infrastructure/neo4j/query_builder.py).

---

## IDs

Nós: `^(person|application|device|phone|email|ip|address|account|company|broker|document|evidence|message|transaction)_\d{2,3}$`  
Relações: `^rel_\d{3}$`  
Postgres (`game_id`, `team_id`, `action_id`, …): UUIDv4. Os dois alfabetos
não se misturam.

---

## Props comuns

Todo **nó**: `id`, `visible_from_round` (1..4), `label_display`.

Toda **relação**: `id`, `visible_from_round`, `source`, `confidence` (0..1).
`timestamp` é opcional.

`Evidence` e `Message` também carregam `embedding: list[float]` (3072 dims,
`text-embedding-3-large`). A propriedade **nunca** atravessa a API:
`GraphPayload.from_neo4j_records()` stripa `embedding` incondicionalmente.

---

## Node labels + props extras obrigatórias

| Label | Props extras |
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

`Employer` está no schema (e no mini-scenario de teste). O caso
`operation_nexus` **não** instancia `Employer` nem arestas `WORKS_AT` /
`EMPLOYED_BY`.

---

## Relationship types

Triplas canônicas (`RELATIONSHIP_ENDPOINTS` em `schema.py`):

```
(:Person)-[:SUBMITTED]->(:Application)
(:Person)-[:USED_DEVICE]->(:Device)
(:Person)-[:USED_PHONE]->(:Phone)
(:Person)-[:USED_EMAIL]->(:Email)
(:Person)-[:RESIDES_AT]->(:Address)
(:Person)-[:OWNS_ACCOUNT]->(:BankAccount)
(:Person)-[:WORKS_AT]->(:Company)
(:Person)-[:EMPLOYED_BY]->(:Employer)
(:Person)-[:RELATED_TO]->(:Person)     // properties.kind = spouse|sibling|parent|colleague
(:Person)-[:SAME_AS]->(:Person)        // entity resolution, visível round 3+
(:Application)-[:ORIGINATED_BY]->(:Broker)
(:Application)-[:SUPPORTED_BY]->(:Document)
(:Device)-[:CONNECTED_FROM]->(:IPAddress)
(:BankAccount)-[:TRANSFERRED_TO]->(:BankAccount)
(:Transaction)-[:FROM_ACCOUNT]->(:BankAccount)
(:Transaction)-[:TO_ACCOUNT]->(:BankAccount)
(:Company)-[:CONTROLLED_BY]->(:Person)
(:Evidence)-[:MENTIONS]->(:Person)
(:Evidence)-[:MENTIONS_ACCOUNT]->(:BankAccount)
(:Message)-[:MENTIONS]->(:Person)
(:Message)-[:MENTIONS_ACCOUNT]->(:BankAccount)
(:Message)-[:SENT_BY]->(:Person)
(:Message)-[:SENT_TO]->(:Person)
```

O seed recusa relação cujo `visible_from_round` é **menor** que o de
qualquer endpoint, id que não casa o regex, referência órfã, e evidência sem
`MENTIONS`.

Labels de pivô de identidade (`SHARED_ENTITY_LABELS`), usados por
`find_shared_entities` e `challenge_hypothesis`:

`Device`, `Phone`, `Email`, `IPAddress`, `Address`, `BankAccount`.

---

## Constraints e indexes

Criados pelo seeder, idempotentes (`schema.constraint_statements` /
`index_statements` / `vector_index_statements`):

- `CREATE CONSTRAINT {label.lower()}_id IF NOT EXISTS FOR (n:{Label}) REQUIRE n.id IS UNIQUE` — um por label.
- `CREATE INDEX {label.lower()}_visibility IF NOT EXISTS FOR (n:{Label}) ON (n.visible_from_round)` — um por label (não um index global `node_visibility` como no snippet ilustrativo do CONTRACT).
- Vector indexes cosine, 3072 dims:
  - `evidence_embedding` em `Evidence.embedding`
  - `message_embedding` em `Message.embedding`

---

## Regra de visibilidade

Único helper: `visibility_clause(aliases=..., path_alias=..., round_param="current_round")`.

- Cada alias de nó **ou** relação: `alias.visible_from_round <= $current_round`.
- Com `path_alias`: `all(_vn IN nodes(p) WHERE ...)` **e**
  `all(_vr IN relationships(p) WHERE ...)`.

O round é **sempre** parâmetro bound, nunca interpolado. Caps interpolados
no texto Cypher (`*1..N` de hops) só depois de clamp para `int` no próprio
builder.

`rounds.yaml.unlocks` não entra na query.

---

## Tool → Cypher (alto nível)

Caps re-enforced no builder: `max_hops∈[1,4]`, neighborhood hops ∈ `{1,2}`,
`top_k∈[1,10]`, `entity_ids` truncado a 8.

| Tool | Builder | O que a query faz |
|---|---|---|
| `inspect_entity` | `build_inspect_entity` | `MATCH` o nó por `id`; `OPTIONAL MATCH` vizinhos 1-hop; filtra nó, relação e vizinho. Devolve props + grau visível. |
| `find_shared_entities` | `build_find_shared_entities` | Exige ≥2 ids. `UNWIND` âncoras, pivo em nós cujo label ∈ `SHARED_ENTITY_LABELS`, conectados a **pelo menos duas** âncoras. `via` opcional restringe `type(r)` (validado contra `RelationshipType`). |
| `find_path` | `build_find_path` | Até 5 shortest paths visíveis `[*1..hops]` entre `from_id` e `to_id`. Visibilidade no **path inteiro**. |
| `expand_neighborhood` | `build_expand_neighborhood` | Paths `[*1..1]` ou `[*1..2]` a partir do id, path visível. |
| `timeline` | `build_timeline` | Vizinhos visíveis com `coalesce` de timestamps de label (`occurred_at`, `captured_at`, `sent_at`, `submitted_at`, `first_seen`, `opened_at`, `issued_at`, `founded_at`, fallback `r.timestamp`). Ordena ASC; janela `from_ts`/`to_ts` opcional. |
| `semantic_evidence_search` | `build_semantic_evidence_search` | **Com** embedding: `db.index.vector.queryNodes` nos dois indexes, `UNION ALL`, `ORDER BY score`, 1-hop visível. **Sem** embedding (`AI_ENABLED=false` / DSL): `toLower(node.content) CONTAINS toLower($query_text)` em `Evidence\|Message` visíveis. O builder **nunca** chama Azure. |
| `challenge_hypothesis` | `build_challenge_hypothesis` | Exige ≥2 ids. O texto `hypothesis` é aceito na assinatura e **descartado** (`del hypothesis`) — o builder não faz NLU. Padrão fixo: `RELATED_TO` visível entre os ids **e** nós de infra compartilhados (`SHARED_ENTITY_LABELS`) que essas pessoas também dividem. É assim que o share doméstico do cônjuge aparece como contra-evidência, não como prova. |

O repositório (`GraphRepository`) só executa o par `(cypher, params)` e
converte records em `GraphPayload`. O adaptador AI (`GraphRepositoryToolAdapter`)
ainda extrai `EvidenceRef` de nós `Evidence`/`Message` para o sintetizador.

Tools proibidas não têm builder. Não há `run_cypher`.

---

## Scenario-as-code → grafo

`scenarios/<slug>/`:

| Arquivo | Vira |
|---|---|
| `entities.json` | nós (exceto Evidence/Message) |
| `relationships.json` | arestas |
| `evidence.json` | nós `Evidence` **ou** `Message` + `MENTIONS` / `MENTIONS_ACCOUNT` / `SENT_BY` / `SENT_TO` |
| `rounds.yaml` | metadado de round (não é nó) |
| `scenario.yaml` | nome/slug/versão |
| `ground_truth.yaml` | **não entra no Neo4j**. Só `domain.game.scoring` |

Seed: `validate → constraints → indexes → nodes → relationships → evidence → vector indexes`.
`MERGE` em `id`. CLI: `uv run operation-nexus seed <slug> [--embeddings] [--drop]`.

Validação offline: `uv run operation-nexus validate <slug>` (zero I/O de banco).
