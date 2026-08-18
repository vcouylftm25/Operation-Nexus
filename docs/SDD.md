# SDD v0.1 — Operation Nexus

Documento de desenho de software, destilado do SDD original do produto e do
repositório em `CONTRACT.md` + código. Onde o SDD original e o código
divergem, este arquivo segue `CONTRACT.md` e o código; os deltas estão no
final.

Autoridade de nomes, IDs, custos e rotas: [`CONTRACT.md`](../CONTRACT.md).
Autoridade do grafo: [`domain/graph/schema.py`](../apps/api/src/operation_nexus/domain/graph/schema.py).
Autoridade do mistério (facilitador): [`SPOILERS.md`](./SPOILERS.md).

---

## 1. Visão do produto

**Operation Nexus** é um **jogo competitivo de investigação**, não um “chat
sobre Neo4j”. Grafo e LLM são mecanismos do jogo.

Pitch: quatro equipes recebem um lote de propostas de crédito aparentemente
saudáveis da fintech fictícia **Vero Crédito**. Há uma operação coordenada
escondida nas relações — dispositivos, identidades, dinheiro. Cada equipe tem
orçamento limitado de créditos por rodada e um investigador (LLM ou DSL) que
só age por um catálogo fechado de ferramentas. Vence quem acusar a rede
certa, o coordenador, o padrão, e provar com relações-chave — sem acusar os
iscas.

Mensagem técnica:

> Individualmente, as entidades pareciam normais. A fraude estava nas relações.

Pipeline cognitivo que o jogo encena:

`Dados → Relações → Contexto → Raciocínio → Decisão`

O LLM **não** é o juiz. A acusação é humana. A pontuação é determinística.

---

## 2. Stack (como está construído)

| Camada | Escolha no repo |
|---|---|
| Linguagem API | Python `>=3.13`, pacote `operation_nexus`, import root `apps/api/src/operation_nexus` |
| API | FastAPI `>=0.120`, Pydantic `>=2.12`, `pydantic-settings` |
| Persistência do jogo | PostgreSQL 17, SQLAlchemy 2.x, Alembic, `psycopg` |
| Mundo investigado | Neo4j `2025-community`, driver oficial `neo4j>=6.0`, plugin APOC no Compose |
| AI (extra `ai`) | LangGraph `>=1.0`, `langchain-openai>=1.0`, `langgraph-checkpoint-postgres`, `neo4j-graphrag` (dependência; o VectorCypher do jogo é o `query_builder` escrito à mão) |
| Tooling Python | `uv`, Ruff (line-length 100), Pyright strict em `domain/` |
| Frontend | Node `>=22`, React `19.2.x`, Vite `^8`, Tailwind `^4` (`@tailwindcss/vite`), TypeScript `^5.9`, pacote `@operation-nexus/web` |
| Estado web | TanStack Query, React Router, Zustand (`session` + `graphStore`) |
| Grafo na UI | `@neo4j-nvl/react` (não React Flow) |
| Realtime | WebSocket nativo FastAPI |
| Testes | pytest (+ asyncio auto, testcontainers), Vitest, Playwright |
| Monorepo | `pnpm-workspace.yaml` + `apps/api` + `apps/web` + `infra/` + `scenarios/` |

Portas (`CONTRACT.md` §12 / `infra/compose.yaml`): web `5173`, api `8000`,
Postgres `5432`, Neo4j bolt `7687`, Neo4j http `7474`.

---

## 3. Arquitetura — modular monolith

Não há microsserviços. Um processo FastAPI, dois bancos com papéis
incomunicáveis:

```
                    ┌──────────────────────────┐
                    │ apps/web  (React + Vite) │
                    │         :5173            │
                    └────────────┬─────────────┘
                                 │ HTTP /api/v1/*
                                 │ WS   /ws/games/{id}
                                 ▼
         ┌────────────────────────────────────────────────┐
         │ apps/api  (FastAPI)   :8000                    │
         │ api/ · application/ · domain/ · ai/ · infra/   │
         └───────────────┬─────────────────┬──────────────┘
                         ▼                 ▼
               ┌──────────────────┐  ┌──────────────┐
               │ postgres   :5432 │  │ neo4j  :7687 │
               │ o JOGO           │  │ o MUNDO      │
               └──────────────────┘  └──────────────┘
```

**Neo4j modela o mundo investigado** (pessoas, propostas, devices, evidências,
embeddings). **Postgres modela o jogo** (`games`, `rounds`, `teams`,
`team_sessions`, `investigation_actions`, `discoveries`, `score_events`,
`accusations`, `ai_runs`). Nada de estrutura de grafo no Postgres; nada de
placar no Neo4j.

O browser **nunca** fala com Neo4j. Toda consulta passa pela API. O frontend
só consome `GraphPayload` (`nodes` + `relationships`); embeddings são
stripped em `GraphPayload.from_neo4j_records()` antes de qualquer serialização.

Camadas Python (sem “Repository/Service/Factory” decorativos):

| Pacote | Papel |
|---|---|
| `domain/` | Contratos, schema, scoring, créditos, rounds. Sem FastAPI, sem SQLAlchemy, sem driver Neo4j. |
| `application/` | Use cases (`CreateGame`, `RecordInvestigation`, `FinishGame`, …) contra Protocols. |
| `infrastructure/` | Postgres, Neo4j, Azure OpenAI, `settings.py`. |
| `ai/` | Registry de tools, LangGraph, planner/synthesizer, DSL determinístico. |
| `api/` | Rotas, deps, WebSocket, mapeamento de erros HTTP. |

---

## 4. O LLM nunca escreve Cypher e nunca vê `ground_truth`

Caminho **errado** (proibido):

```
usuário → LLM → "gere qualquer Cypher" → Neo4j
```

Caminho **certo** (é o que o código faz):

```
usuário
  → InvestigationPlan (Pydantic, max 2 tool_calls)
  → TOOL_REGISTRY (enum fechado ToolName)
  → query_builder (único módulo que monta Cypher parametrizado)
  → GraphRepository
  → Neo4j
```

Regras de ouro (`CONTRACT.md` §0), implementadas de fato:

1. Neo4j = mundo; Postgres = jogo.
2. Browser nunca fala com Neo4j.
3. LLM nunca escreve Cypher. Emite `InvestigationPlan`; `infrastructure/neo4j/query_builder.py` é a única fronteira que interpola texto Cypher, e só depois de validar labels/tipos contra `domain.graph.schema` e clamp de caps (`max_hops≤4`, `top_k≤10`, `entity_ids≤8`). Valores do jogador vão **sempre** como parâmetros bound.
4. LLM nunca vê gabarito. `ground_truth.yaml` é carregado **somente** por `domain/game/scoring.py` (`load_ground_truth` / `score_accusation`). O seeder **não** lê esse arquivo. Prompts em `ai/prompts/*.v1.md` declaram a ausência. `FinishGame` é o único use case de `application/` que toca o gabarito, e só no `POST /host/games/{id}/finish`.
5. Scoring 100% determinístico — nenhum LLM no caminho.
6. `visible_from_round` é aplicado em **toda** query gerada, via o único helper `visibility_clause()`.

Ferramentas que **não existem** como objetos Python: `get_fraudsters`,
`get_answer`, `get_ground_truth`, `run_cypher`, `rank_criminals`. Um nome
fora de `ToolName` falha no Pydantic antes de qualquer I/O.

Jailbreak / `MATCH` / pedido de gabarito → `intent = OUT_OF_SCOPE`,
`tool_calls = []`, caveat `NO_GROUND_TRUTH_ACCESS`. O sintetizador **nem é
chamado** nesse caso (`investigation_graph.synthesize_answer`).

---

## 5. `visible_from_round`

Todo nó e toda relação carregam `visible_from_round: int` (1..4). O grafo
inteiro pode estar no Neo4j; o time só vê o que `<= current_round`.

`unlocks` em `scenarios/operation_nexus/rounds.yaml` é **metadado narrativo**
para host/UI (quais *labels* a rodada “abre”). A enforcement server-side é
sempre a propriedade no elemento, não a lista `unlocks`.

Toda Cypher gerada filtra nós **e** relações do caminho. `find_path` /
`expand_neighborhood` usam `visibility_clause(path_alias=...)` para exigir que
**nada** no path esteja gated. Não há segundo helper; nada bypassa.

No cenário `operation_nexus` a visibilidade efetiva é:

| Round | O que passa a ficar queryable |
|---|---|
| 1 | `Person` + `Application` (+ `SUBMITTED`) |
| 2 | `Device`, `Phone`, `Email`, `IPAddress`, `Address`, `BankAccount` e relações de infra / família |
| 3 | `Message`/`Evidence` (arquivo `evidence.json`) + `SAME_AS` |
| 4 | `Transaction`, `Company`, `Broker`, `Document` e o money trail |

Uma `Discovery` Postgres é gravada na **primeira** vez que o time vê um
`(team, node_id)` ou `(team, relationship_id)`. Times rivais não compartilham
descobertas.

---

## 6. Pipeline LangGraph (máx. 2 tools, sem agent loop)

Implementado em `ai/graph/investigation_graph.py` como state machine, não
como `AgentExecutor`:

```
START
  → normalize_question
  → plan_investigation          # ChatOpenAI.with_structured_output(InvestigationPlan)
  → validate_plan               # clamp de 2 tools; OUT_OF_SCOPE zera tool_calls
  → calculate_cost              # domain.investigation.costs.estimate_cost
  → budget_gate
       ├─ reject → END          # não cobra; caveat INSUFFICIENT_CREDITS
       └─ execute_graph_tools   # ≤2 calls, asyncio.gather, uma vez
            → collect_evidence
            → synthesize_answer # só se houve tool_calls; senão recusa sem LLM
            → persist_discoveries
            → END
```

Não existe `while agent_wants_to_continue`. Previsibilidade de custo,
latência e comportamento.

Chat, embedder e repositório são **injetados**. O grafo em si nunca
constrói `ChatOpenAI`. Testes usam `infrastructure.azure_openai.fake`.

`thread_id` previsto: `f"{game_id}:{team_id}"` (`build_thread_id`). O
checkpointer LangGraph é parâmetro opcional; **ainda não está ligado** no
lifespan da API.

Tradução `GraphRepository` (`GraphPayload`, `current_round`) → protocolo das
tools (`ToolResult`, `round`): `ai/adapters.py::GraphRepositoryToolAdapter`.

---

## 7. `AI_ENABLED=false` — jogável via command DSL

Default de `infrastructure/settings.py`: `ai_enabled: bool = False`.

O caminho jogável sem Azure é `ai/deterministic.py`:

- `parse_investigation_command(question) -> InvestigationPlan`
- `DeterministicInvestigationRunner` executa até 2 tools no mesmo
  `GraphRepositoryProtocol`, sintetiza a resposta a partir do subgrafo
  (sem LLM), e no `/search` passa `query_embedding=None` → fallback
  `CONTAINS` em `query_builder.build_semantic_evidence_search`.

Sintaxe canônica (a paleta de `/play` deve emitir exatamente isto):

```
/inspect person_01
/shared person_01,person_03
/path person_01 person_04
/expand person_01 2
/timeline person_01
/search existe mensagem sobre usar o nome de outra pessoa
/challenge Roberto é o líder | person_01,person_02
```

O prefixo `/` é opcional. Texto livre, jailbreak, `MATCH`/`RETURN`,
`get_fraudsters` → `OUT_OF_SCOPE` + caveat `NO_GROUND_TRUTH_ACCESS`.

O `lifespan` em `main.py` liga o runner no `app.state`:

- `AI_ENABLED=false` → `DeterministicInvestigationRunner` (DSL)
- `AI_ENABLED=true` → `LangGraphInvestigationRunner` sobre
  `build_investigation_graph` (`AZURE_CHAT_DEPLOYMENT`)
- Neo4j indisponível no boot → `NullInvestigationRunner` (HTTP 503)

`api/deps.py::get_investigation_runner()` lê esse singleton; o null object
é só fallback. `RecordInvestigation` passa `credits_available` e espera
`InvestigationResult`. `POST /teams/{id}/investigate` é o caminho jogável.

---

## 8. Modelos Azure

Não se usa o maior modelo em tudo.

| Papel | Deployment (settings) | Uso |
|---|---|---|
| Runtime do investigador | `AZURE_CHAT_DEPLOYMENT=gpt-5.4-mini` | Planner + synthesizer no caminho crítico. Structured output, tool calling, barato o suficiente para cada interação. |
| Embeddings | `AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-large` | 3072 dims, cosine, só `Evidence`/`Message`. Seed com `uv run operation-nexus seed operation_nexus --embeddings`. Query-time no nó `semantic_evidence_search` do LangGraph. |
| Offline | `AZURE_REASONING_DEPLOYMENT=gpt-5.6-sol` | **Não** está no caminho do jogo. Reservado a geração/validação/red-team/debrief do cenário. O campo existe em `Settings`; nenhum módulo de runtime o instancia hoje. |

Integração: Azure OpenAI-compatible `.../openai/v1/` + `langchain_openai.ChatOpenAI`
(`infrastructure/azure_openai/client.py`). Sem `AzureChatOpenAI`, sem
`api_version`. `AZURE_OPENAI_BASE_URL` **deve** terminar em `/openai/v1/`.

A chave **nunca** vai para o React. Só `VITE_API_URL` / `VITE_WS_URL` no
frontend.

Não há vector DB separado. Os vetores moram no Neo4j (`evidence_embedding`,
`message_embedding`).

---

## 9. Scoring determinístico

Computado **uma vez**, em `FinishGame`, a partir de `ground_truth.yaml`.
`POST /teams/{id}/accusation` só persiste e devolve **202** — não julga.
Times sem acusação terminam com breakdown vazio (total 0).

Regras em `domain/game/scoring.py` (valores de `CONTRACT.md` §6):

| Regra | Delta |
|---|---|
| `CORRECT_FRAUDSTER` | +12 por id em `accused_person_ids` ∩ `fraudsters` |
| `LEGITIMATE_ACCUSED` | −8 por id acusado fora de `fraudsters` |
| `CORRECT_COORDINATOR` | +10 se `coordinator_person_id` bate |
| `KEY_RELATIONSHIP` | +20 por id de `ground_truth.key_relationships` **citado** em `accusation.key_relationship_ids` |
| `FALSE_POSITIVE_AVOIDED` | +15 por isca em `designed_false_positives` **não** acusada |
| `CORRECT_PATTERN` | +10 se `FraudPattern` bate |
| `CREDIT_EFFICIENCY` | `round(10 * credits_remaining / credits_total)`, clamp 0..10 |

Cada linha vira um `ScoreEvent(team_id, round, rule, delta, detail)` — é o
que o projetor mostra.

**Delta vs texto do CONTRACT:** §6 diz “per key relationship *discovered*”.
O código pontua a **citação na acusação**, não o conjunto `Discovery` do
time. Seguir o código.

---

## 10. Motor de jogo, API e realtime

Quatro rounds. Créditos por time **por round**: `[100, 120, 140, 160]`.
Não-gastos **rolam**. `InsufficientCredits` → HTTP 402
`{"error":"INSUFFICIENT_CREDITS","required":N,"available":M}`.

Join code: 6 chars, `ALPHABET = ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (sem `0O1I`).

Auth: times `Authorization: Bearer <session token>`; host `X-Host-Token`;
screen WS sem token.

Rotas implementadas (`/api/v1` salvo health e WS):

```
POST /games
GET  /games/{game_id}
POST /games/{game_id}/teams
POST /teams/join
GET  /teams/{team_id}/state
POST /teams/{team_id}/investigate
POST /teams/{team_id}/accusation          → 202
GET  /teams/{team_id}/graph
POST /host/games/{game_id}/rounds/next    → ENCERRA a round ativa
POST /host/games/{game_id}/rounds/{n}/start
POST /host/games/{game_id}/reveal         → {evidence_id} → EVIDENCE_UNLOCKED
POST /host/games/{game_id}/finish         → scores + GAME_FINISHED
GET  /host/games/{game_id}/scoreboard
GET  /health  /health/deep
WS   /ws/games/{game_id}?role=team|host|screen&token=...
```

Envelope WS: `{type, game_id, seq, ts, payload}`.
`GRAPH_DISCOVERY` vai ao time dono + `host`/`screen`, **nunca** a rivais
(`ConnectionManager.broadcast_to_team`). Payload atual do engine:
`{node_ids, relationship_ids}` (não o `GraphPayload` completo).

Rounds: `PENDING → ACTIVE → ENDED`. `rounds/next` só encerra;
`rounds/{n}/start` começa a seguinte em sequência (`current_round + 1`).

`CreateGame` grava 4 rounds com a allowance de créditos; **ainda não** lê
`title`/`narrative`/`duration_seconds` de `rounds.yaml`.

---

## 11. Mapa do repositório

```
operation_nexus/
├── CONTRACT.md
├── README.md
├── Makefile
├── pnpm-workspace.yaml
├── apps/
│   ├── api/                         # uv, pacote operation_nexus
│   │   ├── src/operation_nexus/
│   │   │   ├── main.py              # FastAPI app
│   │   │   ├── cli.py               # operation-nexus seed|validate|stats
│   │   │   ├── api/                 # routes, deps, connection_manager
│   │   │   ├── application/         # use cases + ports
│   │   │   ├── domain/
│   │   │   │   ├── game/            # credits, rounds, scoring, contracts
│   │   │   │   ├── graph/           # schema, scenario, payload
│   │   │   │   └── investigation/   # contracts, costs
│   │   │   ├── ai/                  # graph, tools, prompts, DSL, runner
│   │   │   └── infrastructure/      # postgres, neo4j, azure_openai, settings
│   │   ├── migrations/
│   │   └── tests/{unit,integration,golden,fixtures}
│   └── web/                         # @operation-nexus/web
│       └── src/{lib,features}       # rotas /play /host /screen: ver UX
├── infra/                           # compose.yaml, docker/
├── scenarios/operation_nexus/       # scenario-as-code (incl. ground_truth)
└── docs/                            # este diretório
```

CLI: `uv run operation-nexus seed operation_nexus [--embeddings] [--drop]`.
O seed valida com Pydantic **antes** de escrever, falha alto em id órfão,
regex, `visible_from_round` de relação menor que o dos endpoints, evidence
sem `MENTIONS`, etc. **Não** carrega `ground_truth.yaml`.

---

## 12. Deltas SDD original → CONTRACT + código

O SDD original é a visão. Isto é o que o repo realmente faz:

| Original | Código / CONTRACT |
|---|---|
| “shadcn/ui” genérico | Radix (`dialog`, `scroll-area`, `tabs`) + tokens próprios; NVL oficial |
| `POST /entity-resolution` | Não existe. Resolução é o tipo `SAME_AS` visível a partir da round 3, consultável pelas tools |
| Host com `[PAUSAR]` / status `paused` | `GameStatus` = `PENDING \| ACTIVE \| FINISHED` |
| Scoring “relações críticas *encontradas*” | Pontua relações **citadas** na `Accusation` |
| Gabarito-exemplo `person_03/08/14`, coordenador `person_08` | Cenário real: ver `SPOILERS.md` (coordenador `person_04`) |
| `MARRIED_TO` | `RELATED_TO {kind: spouse\|sibling\|parent\|colleague}` |
| VectorCypher via pacote `neo4j-graphrag` | Cypher escrito em `query_builder`; o extra instala o pacote mas o jogo não o chama |
| `gpt-5.6-sol` no runtime | Só setting; uso offline |
| Checkpointer LangGraph em Postgres | Dependência presente, não wired |
| `CreateGame` com narrativa das rounds | `create_game.py` copia título/narrativa/duração de `rounds.yaml` |
| UI `/play` `/host` `/screen` | Rotas React + mock (`VITE_MOCK=true`) existem |
| `AI_ENABLED=false` no FastAPI | `lifespan` instala `DeterministicInvestigationRunner`; `NullInvestigationRunner` só se o Neo4j falhar no boot |
| Index único `node_visibility` no exemplo do CONTRACT | Um index `{label}_visibility` **por label**, gerado por `schema.index_statements()` |
| `MENTIONS` só de `Evidence` no §3 | Schema também permite `(:Message)-[:MENTIONS]->(:Person)` (e o cenário usa) |
| Label `Employer` / `WORKS_AT` / `EMPLOYED_BY` | No schema; **ausentes** de `scenarios/operation_nexus` |
| 20–25 pessoas / 3 fraudadores | Cenário real: 22 `Person`, 31 `Application`, 6 fraudsters (mule + layering + coordenador + trio de alias) |

Nenhum desses deltas muda as regras de ouro.
