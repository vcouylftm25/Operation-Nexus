# Operation Nexus

Jogo competitivo de investigação de fraude. Quatro ou cinco equipes entram com
um nome, avançam sozinhas por três fases e gastam créditos perguntando a um
investigador de IA que só vê o grafo Neo4j — nunca o gabarito. Na última fase
cada equipe tem **três tentativas** para acusar quem coordenou o esquema. A
pontuação é determinística: acerto, tentativas erradas, dicas compradas,
créditos que sobraram e, em empate, o tempo.

O caso em produção é **Vero Express** (`scenarios/vero_express/`): oito
solicitantes fictícios, aparelhos, WhatsApp, contas e transferências. Todos os
nomes, CPFs e mensagens existem só para o treino.

## Jogar agora

| Peça | URL |
| --- | --- |
| Frontend | https://delightful-sky-0ab490c0f.7.azurestaticapps.net |
| API | https://operation-nexus-api.victoriouscoast-2b393742.brazilsouth.azurecontainerapps.io |
| Saúde da API | https://operation-nexus-api.victoriouscoast-2b393742.brazilsouth.azurecontainerapps.io/health |
| Placar | `/screen/{game_id}` (o botão **PLACAR** no cabeçalho leva até lá) |
| Código | https://github.com/vcouylftm25/Operation-Nexus |

Cada pessoa abre o site, digita o **mesmo nome da equipe** e entra. Digitar de
novo retoma a sessão. Não existe código de convite nem host.

O grafo vive no **Neo4j AuraDB** (instância `fc733c9a`). O plano gratuito
pausa depois de ~3 dias ocioso: abra o [console da Aura](https://console.neo4j.io/)
antes da sessão se o investigador ou o grafo parecerem vazios.

## Arquitetura

```
  navegador  ──HTTP /api/v1/*──►  Container App (FastAPI)
             ──WSS  /ws/*   ──►         │
                                        ├── Postgres Flexible Server  (partida, créditos, palpites, dicas)
                                        ├── Neo4j AuraDB              (caso: pessoas, aparelhos, mensagens, evidências)
                                        └── Azure OpenAI              (gpt-5.4-mini planeja; text-embedding-3-small busca)
```

Regras que atravessam o sistema inteiro:

1. Neo4j modela o **mundo investigado**. Postgres modela o **jogo**.
2. O navegador **nunca** fala com o Neo4j — só com a API.
3. O LLM **nunca** escreve Cypher e **nunca** lê `ground_truth.yaml`.
4. A pontuação é 100% determinística, em `domain/game/ranking.py` e
   `domain/game/scoring.py`. O gabarito fica quarentenado: só o motor de
   palpite o importa.

O contrato completo (IDs, schema, custos, API) está em [`CONTRACT.md`](./CONTRACT.md).

## Como o GraphRAG funciona

O investigador **não** é um chatbot solto sobre o caso. É um grafo LangGraph
com duas voltas de modelo e um catálogo fechado de ferramentas. O Cypher que
roda no Neo4j é sempre o de
[`query_builder.py`](apps/api/src/operation_nexus/infrastructure/neo4j/query_builder.py) —
parametrizado, filtrado pela fase atual. O modelo escolhe **qual** ferramenta
chamar, nunca a query.

```
pergunta da equipe
        │
        ▼
  planejador (gpt-5.4-mini)
  devolve um InvestigationPlan:
    intent + no máximo 2 tool_calls
        │
        ▼
  portão de créditos  →  402 se não cabe no saldo
        │
        ▼
  ferramentas contra o Neo4j
  (inspect, shared, path, expand,
   timeline, semantic_search, challenge)
        │
        ▼
  sintetizador (gpt-5.4-mini)
  responde só com o que as ferramentas
  devolveram — em português
```

### Ferramentas e custo

| Ferramenta | O que faz | Créditos |
| --- | --- | ---: |
| `inspect_entity` | Propriedades do nó + vizinhança de 1 salto | 5 |
| `find_shared_entities` | Aparelho, linha, e-mail, IP, endereço ou conta em comum | 10 |
| `find_path` | Até 5 caminhos visíveis entre dois nós | 15 |
| `expand_neighborhood` | Subgrafo a 1 salto (15) ou 2 saltos (20) | 15 / 20 |
| `timeline` | Eventos da entidade em ordem | 10 |
| `semantic_evidence_search` | Busca em `Evidence` / `Message` | 20 |
| `challenge_hypothesis` | Só contra-evidência, nunca confirmação | 25 |

Toda query respeita `visible_from_round <= fase atual`. Na fase 1 o
investigador não vê aparelhos nem mensagens, mesmo que o time pergunte.

### A parte “RAG”

1. No seed, `--embeddings` manda o texto de cada `Evidence` e `Message` para
   `text-embedding-3-small` e grava o vetor na propriedade `embedding` do nó.
2. O Neo4j ganha dois índices vetoriais, `evidence_embedding` e
   `message_embedding`, com a **mesma** largura do modelo (em produção, 1536).
3. Quando o planejador escolhe `semantic_evidence_search`, a API:
   - embeda a pergunta com o mesmo modelo;
   - chama `db.index.vector.queryNodes` nos dois índices (cosine);
   - filtra pela fase;
   - expande 1 salto no grafo (quem mandou, quem foi mencionado, a conta citada).
4. Sem embedding (seed sem `--embeddings`, ou `AI_ENABLED=false`) a mesma
   ferramenta cai num `CONTAINS` no campo `content`. Continua útil; só não é
   semântica.

O vetor **nunca** sai da API: `GraphPayload.from_neo4j_records()` apaga
`embedding` de qualquer nó antes de serializar.

O planejador recusa só o que é gabarito (“quem é o fraudador?”), Cypher
cru ou tentativas de jailbreak. Perguntas factuais — “quem transferiu”,
“quem usa o mesmo aparelho” — são investigação normal e disparam ferramenta.

## O cenário e o seed do Neo4j

Tudo o que o time vê no grafo vem de `scenarios/vero_express/`:

| Arquivo | Função |
| --- | --- |
| `scenario.yaml` | Título, slug, premissa |
| `entities.json` | Nós (pessoas, aparelhos, contas, empresas…) |
| `relationships.json` | Arestas explícitas (`USED_DEVICE`, `TRANSFERRED_TO`…) |
| `evidence.json` | Mensagens e evidências; o seeder deriva `SENT_BY` / `MENTIONS` |
| `rounds.yaml` | As 3 fases: título, narrativa, créditos, o que destrava |
| `hints.yaml` | Dicas compráveis (nunca citam o nome de um suspeito) |
| `ground_truth.yaml` | Gabarito. **Não entra no seed.** Só `scoring.py` lê. |

Ordem do seed (`make seed` / `operation-nexus seed vero_express`):

```
validar arquivos  →  constraints UNIQUE(id)  →  índices de visibilidade
                  →  MERGE dos nós  →  MERGE das arestas
                  →  evidências (+ embeddings, se pedido)
                  →  índices vetoriais
```

Tudo é `MERGE` em `id`, então reseedar o mesmo cenário é idempotente. Para
apagar o grafo e começar do zero:

```bash
# aponta para o Aura (ou o Neo4j local) via .env na raiz
make validate                         # offline, não toca no banco
make seed                             # MERGE no grafo atual
make seed ARGS="--drop --embeddings"  # apaga tudo, reseeda, gera vetores
cd apps/api && uv run --env-file ../../.env operation-nexus stats
```

`--drop` é destrutivo e atinge **a instância configurada no `.env`**. Em
produção isso é o Aura compartilhado: só rode com `--drop` quando quiser
substituir o caso inteiro.

`AZURE_EMBEDDING_DIMENSIONS` tem que bater com o deployment e com o índice.
Em produção: `text-embedding-3-small` / **1536**. O contrato original cita
`text-embedding-3-large` / 3072; se os números divergirem o Neo4j recusa o
write.

## Jogo (o que o time faz)

1. Digita o nome da equipe → `POST /api/v1/play/start` cria ou retoma.
2. Fase 1 (100 cr) — fichas isoladas. Sem arestas. Objetivo: ler, não acusar.
3. Fase 2 (120 cr) — aparelhos, linhas, IPs, endereços, contas. O grafo acende.
4. Fase 3 (140 cr) — WhatsApp, evidências, transações, empresas. A acusação
   destrava. Três tentativas, uma pessoa por vez.
5. Placar: `1000 − 150×erros − 25×dicas + créditos restantes`. Quem não
   acertou fica com 0 e abaixo de qualquer time que acertou.

A equipe avança quando quiser (`POST /api/v1/teams/{id}/advance`). Não há
relógio global nem host.

## Desenvolvimento local

```bash
make bootstrap    # uv sync + pnpm install + .env a partir do example
make up-core      # Postgres + Neo4j locais (Docker)
make seed         # carrega vero_express no Neo4j do .env
make migrate      # Alembic no Postgres do .env
make api          # http://localhost:8000  (lê o .env da raiz)
make web          # http://localhost:5173
```

`apps/web/.env` pode levar `VITE_MOCK=true`: a UI inteira roda contra um
backend falso, sem API. Para apontar no backend de verdade, use
`apps/web/.env.local` (git-ignored) com `VITE_MOCK=false`.

Com `AI_ENABLED=false` o investigador só aceita a paleta de comandos:

```
/inspect person_01
/shared person_01,person_03
/path person_01 person_04
/expand person_01 2
/timeline person_01
/search existe mensagem sobre usar o nome
/challenge Roberto é o líder | person_01,person_02
```

| Serviço | Porta |
| --- | ---: |
| web (Vite) | 5173 |
| api | 8000 |
| postgres | 5432 |
| neo4j bolt | 7687 |
| neo4j http | 7474 |

## Produção na Azure

Tudo, menos o Aura e o Azure OpenAI, vive no resource group de homologação
`LFTM-HMG-RG-BR01` (assinatura `74fedf0e-6580-4173-83f5-8d8f5a2487db`),
o mesmo da Iara. O ambiente de Container Apps reusado é `lftm-hmg`
(Brazil South).

| Recurso | Nome | Onde |
| --- | --- | --- |
| Container Registry | `opnexusacr` | `opnexusacr.azurecr.io` |
| Container App (API) | `operation-nexus-api` | Brazil South, env `lftm-hmg` |
| Static Web App (front) | `operation-nexus-web` | East US 2 |
| Postgres Flexible Server | `opnexus-pg` | `opnexus-pg.postgres.database.azure.com`, banco `nexus` |
| Neo4j | AuraDB `fc733c9a` | fora da Azure |
| OpenAI | resource já existente da LFTM | `gpt-5.4-mini` + `text-embedding-3-small` |

### Deploy automático

Cada push em `main` dispara [`.github/workflows/cd.yml`](.github/workflows/cd.yml):

1. Detecta se mudou API ou frontend.
2. **API:** build da imagem (`infra/docker/api.Dockerfile`, target `runtime`)
   no runner com BuildKit → push no ACR → Alembic no Postgres (o runner
   libera o próprio IP no firewall e revoga no fim) → `az containerapp update`
   → `GET /health`.
3. **Front:** `pnpm build` com `VITE_API_URL` / `VITE_WS_URL` apontando para
   o Container App → upload no Static Web Apps.

CI (lint, typecheck, testes) roda em paralelo em [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

Secrets do repositório (`Settings → Secrets and variables → Actions`):

| Secret | Para quê |
| --- | --- |
| `AZURE_CREDENTIALS` | JSON `--sdk-auth` da identidade `github-actions-lftm-ia` (Contributor em `LFTM-HMG-RG-BR01` e `LFTM-PRD-RG-BR01`) |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | token de deploy do Static Web App |
| `POSTGRES_DSN` | DSN do Flexible Server, no formato `postgresql+psycopg://…` |

### Variáveis do Container App

Valores em claro:

```
APP_ENV=production
SCENARIO_SLUG=vero_express
AI_ENABLED=true
LANGSMITH_TRACING=false
NEO4J_URI=neo4j+s://fc733c9a.databases.neo4j.io
NEO4J_USER=neo4j
AZURE_OPENAI_BASE_URL=https://<recurso>.openai.azure.com/openai/v1/
AZURE_CHAT_DEPLOYMENT=gpt-5.4-mini
AZURE_REASONING_DEPLOYMENT=gpt-5.4
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-3-small
AZURE_EMBEDDING_DIMENSIONS=1536
CORS_ORIGINS=https://delightful-sky-0ab490c0f.7.azurestaticapps.net
```

Secrets do Container App (nunca em claro, nunca no git):

```
SESSION_SECRET
POSTGRES_DSN
NEO4J_PASSWORD
AZURE_OPENAI_API_KEY
```

O Postgres Flexible Server **não** aceita o mundo inteiro: só IPs no
firewall. O Container App sai por IPs do ambiente `lftm-hmg` (já
liberados); o CD libera o IP do runner só durante a migração.

### Recriar o que está no ar

Não precisa, está publicado. Se um dia o resource group for limpo:

```bash
# Registry
az acr create -g LFTM-HMG-RG-BR01 -n opnexusacr --sku Basic --location brazilsouth

# Postgres (o banco `nexus` é um passo à parte; --public-access quer IPv4)
az postgres flexible-server create \
  -g LFTM-HMG-RG-BR01 -n opnexus-pg \
  --location brazilsouth --tier Burstable --sku-name Standard_B1ms \
  --admin-user nexusadmin --admin-password '<senha>' \
  --public-access <seu-ipv4>
az postgres flexible-server db create \
  -g LFTM-HMG-RG-BR01 --server-name opnexus-pg --database-name nexus

# API no ambiente já existente da homologação
az containerapp create \
  -g LFTM-HMG-RG-BR01 -n operation-nexus-api \
  --environment lftm-hmg \
  --image opnexusacr.azurecr.io/operation-nexus-api:latest \
  --ingress external --target-port 8000 \
  --registry-server opnexusacr.azurecr.io

# Front
az staticwebapp create \
  -g LFTM-HMG-RG-BR01 -n operation-nexus-web \
  --location eastus2
```

Depois: colar as env vars e secrets no Container App, gravar os três secrets
no GitHub, apontar o `.env` local para o Aura, e:

```bash
make migrate
make seed ARGS="--embeddings"
```

Um merge em `main` (ou `workflow_dispatch` no CD) publica API e front.

## Mapa do repositório

- [`CONTRACT.md`](./CONTRACT.md) — versões, IDs, schema, custos, API/WS, env vars.
- [`docs/GRAPH_SCHEMA.md`](./docs/GRAPH_SCHEMA.md) — labels e tipos do grafo.
- [`docs/GAME_DESIGN.md`](./docs/GAME_DESIGN.md) — design (não revela o fraudador).
- [`docs/SPOILERS.md`](./docs/SPOILERS.md) — gabarito, só para quem facilita.
- `apps/api/` — FastAPI (`operation_nexus`: domain / application / infrastructure / ai).
- `apps/web/` — React 19 + Vite 8 + Tailwind 4.
- `infra/docker/api.Dockerfile` — imagem da API (targets `dev` e `runtime`).
- `scenarios/vero_express/` — o caso que o deploy serve.
- `.github/workflows/ci.yml` e `cd.yml` — testes e publicação.

`make help` lista todos os alvos de desenvolvimento.
