# Operation Nexus

Four teams. One credit-line fraud ring hiding in plain sight across dozens of
ordinary-looking loan applications. Operation Nexus is a live, competitive
investigation game: each team gets a shrinking credit budget per round to
interrogate an AI investigator that reasons over a Neo4j graph of the case —
shared devices, phones, addresses, shell companies, seized messages — and
must spend those credits wisely before naming a coordinator, a fraud
pattern, and the ring behind it. A deterministic scoring engine judges every
accusation against a hidden answer key that no model, and no player, ever
sees before the game ends.

## Architecture

```
                    ┌──────────────────────────┐
                    │ apps/web  (React + Vite) │
                    │         :5173            │
                    └──────────────────────────┘
                                  │
                                  │  HTTP  /api/v1/*
                                  │  WS    /ws/games/{id}
                                  ▼
         ┌────────────────────────────────────────────────┐
         │ apps/api  (FastAPI)   :8000                    │
         │ domain/ · application/ · infrastructure/ · ai/ │
         └────────────────────────────────────────────────┘
                     │                        │
                     ▼                        ▼
           ┌──────────────────┐       ┌───────────────┐
           │ postgres   :5432 │       │ neo4j   :7687 │
           │ game state       │       │ case graph    │
           └──────────────────┘       └───────────────┘
```

`apps/api`'s `ai/` package also talks to Azure OpenAI (chat + embeddings) to
produce a validated `InvestigationPlan` — never raw Cypher, never
`ground_truth.yaml` — but only when `AI_ENABLED=true`. Phases 2 and 3 of the
roadmap below run the entire game with `AI_ENABLED=false` and no LLM at all.

Golden rules that shape every layer of this: Neo4j models the investigated
world, Postgres models the game, the browser never talks to Neo4j directly,
the LLM never writes Cypher and never sees ground truth, and scoring is
100% deterministic. See [`CONTRACT.md`](./CONTRACT.md) for the full contract.

## Quickstart

```bash
make bootstrap    # uv sync (apps/api) + pnpm install (apps/web) + create .env
make up-core      # start postgres + neo4j in docker (healthchecked)
make seed         # load scenarios/operation_nexus into Neo4j
make migrate      # apply Postgres migrations
make api          # API with hot reload (http://localhost:8000)
```

In another terminal:

```bash
make web          # Vite (http://localhost:5173)
```

`apps/web/.env` ships with `VITE_MOCK=true`, so the UI also runs against an
in-memory fake API with **zero backend**. That's the fastest way to click
through `/play`, `/host` and `/screen`.

With `AI_ENABLED=false` (the default), investigations use a command DSL —
the same tools the LLM would call, without Azure on the critical path:

```
/inspect person_01
/shared person_01,person_03
/path person_01 person_04
/expand person_01 2
/timeline person_01
/search existe mensagem sobre usar o nome
/challenge Roberto é o líder | person_01,person_02
```

Flip `AI_ENABLED=true` (and set Azure env vars) to let `gpt-5.4-mini` plan
those tool calls from free-text Portuguese.

Prefer everything containerized? `make up` builds postgres, neo4j, api and
web via Docker Compose profiles.

## Ports

| Service      | Port |
| ------------ | ---- |
| web (Vite)   | 5173 |
| api          | 8000 |
| postgres     | 5432 |
| neo4j bolt   | 7687 |
| neo4j http   | 7474 |

## Deploy (evento / cloud)

Local Docker **funciona** para ensaiar na sua máquina. Para jogadores em
outros laptops (ou um projetor + 4 times na rede), o grafo precisa estar
acessível na internet — não no `localhost` de cada um.

Não coloque FastAPI + Neo4j na Vercel. Vercel serve o **front**. O resto
fica em serviços gerenciados:

| Peça | Onde |
| ---- | ---- |
| `apps/web` | Vercel / Netlify / Cloudflare Pages |
| `apps/api` | Render / Fly.io / Railway / Azure Container Apps |
| Postgres | Neon, RDS, Azure Database, o Postgres do mesmo host da API |
| Neo4j | **[AuraDB](https://neo4j.com/product/auradb/)** — o cloud oficial. Free/professional, URI `neo4j+s://….databases.neo4j.io` |

No `.env` de produção:

```bash
NEO4J_URI=neo4j+s://xxxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
AI_ENABLED=true
AZURE_CHAT_DEPLOYMENT=gpt-5.4-mini
```

Depois do Aura subir: `make seed` (ou `uv run operation-nexus seed operation_nexus`)
apontando para essa URI. O browser **nunca** fala com o Neo4j — só com a API.

O investigador de runtime é o **mini** (`gpt-5.4-mini`). O modelo grande fica
fora do caminho crítico (dataset / debrief).

## Roadmap

1. **Foundation** — repo scaffolding, docker stack, CI, shared contract.
2. **Graph** — Neo4j schema, constraints/indexes, scenario-as-code seeder.
3. **Game Engine** — Postgres game state, REST API, credits, scoring, WebSocket events.
4. **AI** — the investigation tool registry, validated `InvestigationPlan`, deterministic Query Builder.
5. **GraphRAG** — vector-indexed Evidence/Message search over the case graph.
6. **UX** — the team and host/screen web experience (React + Vite + NVL graph view).
7. **Mystery** — the finished `operation_nexus` scenario: entities, evidence, ground truth, narrative.

## Repo map

- [`CONTRACT.md`](./CONTRACT.md) — the single source of truth for versions, IDs, schemas, tool costs, API/WS shapes, env vars and file ownership. Read this first.
- `apps/api/` — the FastAPI backend (`operation_nexus` package).
- `apps/web/` — the React + Vite frontend (`@operation-nexus/web`).
- `infra/` — the Docker Compose dev stack and Dockerfiles (this directory's `compose.yaml` is the dev environment's front door).
- `scenarios/operation_nexus/` — the scenario-as-code case file (entities, relationships, evidence, rounds, ground truth).
- `docs/` — design docs and deeper phase-by-phase notes.
