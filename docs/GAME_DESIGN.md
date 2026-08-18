# Game Design — Operação Nexus

Design do jogo ao vivo. Narrativa jogável em **PT-BR**. Identificadores
técnicos em inglês. **Este arquivo não revela quem é fraudador.** O gabarito
está em [`SPOILERS.md`](./SPOILERS.md) (só facilitador).

Cenário: `scenarios/operation_nexus/` (`slug: operation_nexus`, v1.0.0).
Título público: **Operação Nexus — Fraude na Vero Crédito**.

---

## Premissa (pitch para as mesas)

Em quatro meses a fintech fictícia **Vero Crédito** aprovou mais de
R$ 250 mil em empréstimos e antecipações para um grupo de clientes que, um a
um, pareciam carteira saudável. Compliance achou o primeiro fio: infraestrutura
compartilhada entre gente que deveria ser estranha. Quatro equipes de
analistas assumem a **Operação Nexus**.

Mensagem que o jogo ensina, round a round:

1. Feature individual engana.
2. Relação sem contexto também engana.
3. Identidade e linguagem precisam de evidência, não de feeling.
4. O dinheiro (e as datas) fecham o caso — a acusação é humana.

Formato alvo: ~4 equipes, um host, um projetor. Duração total ~80 min
(900 + 1200 + 1200 + 1500 s de relógio de round, mais briefing/debrief).

---

## Economia de créditos

Cada time começa a round com um grant que **soma** ao saldo (rollover; nunca
zera):

| Round | Grant | Duração (`duration_seconds`) |
|---|---|---|
| 1 | 100 | 900 |
| 2 | 120 | 1200 |
| 3 | 140 | 1200 |
| 4 | 160 | 1500 |

Total possível ao longo do jogo: **520** créditos, se nada for gasto.
Eficiência no score final: `round(10 * remaining / total_awarded)` (0..10).

Toda investigação cobra **antes** de revelar grafo. Plano mais caro que o
saldo → HTTP 402 `INSUFFICIENT_CREDITS` (não cobra, não descobre). Máximo
**2 tools por interação**.

| Tool | Custo | Quando usar (UX) |
|---|---|---|
| `inspect_entity` | 5 | Ficha de um nó + grau 1-hop visível |
| `find_shared_entities` | 10 | “O que essas pessoas têm em comum?” |
| `timeline` | 10 | Ordenar eventos da entidade |
| `find_path` | 15 | Caminho curto entre dois ids (cap 4 hops, até 5 paths) |
| `expand_neighborhood` | 15 (1 hop) / 20 (2 hops) | Subgrafo ao redor |
| `semantic_evidence_search` | 20 | Round 3+: mensagens/evidências por significado (ou `CONTAINS` se AI off) |
| `challenge_hypothesis` | 25 | **Contra-evidência** — nunca confirmação |

As ações investigativas da UI são semânticas e escondem a DSL do jogador. A
DSL permanece como fallback técnico para testes e para o mock:

```
/inspect person_01
/shared person_01,person_03
/path person_01 person_04
/expand person_01 2
/timeline person_01
/search existe mensagem sobre usar o nome de outra pessoa
/challenge hipótese em português | person_01,person_02
```

Hint na UI: *“Selecione um nó e escolha uma ação, ou formule uma pergunta em
português.”*

---

## As 4 rounds

Metadado canônico: `scenarios/operation_nexus/rounds.yaml`.
O conteúdo é separado em `player_briefings.yaml` (jogador),
`host_script.yaml` (facilitador) e `clues.yaml` (gatilhos de pista). O
`unlocks` é o que o host/UI anunciam; o servidor filtra por
`visible_from_round` em cada nó/relação.

### Round 1 — “Individualmente, tudo parece normal”

**Unlocks nominais:** `Person`, `Application`.
**O que o time vê:** 22 clientes, 31 propostas. Renda, ocupação, score, valor,
status, produto. Nenhuma ficha, isolada, grita fraude.

**Pergunta da mesa:** *quem vocês investigariam, e por quê?*

**Pegadinha:** o pior `credit_score` do lote é de uma pessoa **inteiramente
legítima**. Perfis da rede problemática são quase “bonitinhos demais”.
Conclusão baseada num único número é a derrota pedagógica da round.

**Ferramentas úteis:** `inspect_entity` barato, `expand_neighborhood` 1 hop
nas propostas. Ainda **não** há device/IP/conta.

### Round 2 — “Conectando os pontos”

**Unlocks nominais:** `Device`, `Phone`, `Email`, `IPAddress`, `Address`,
`BankAccount`.
**O grafo liga.** Três “pessoas diferentes” submetem proposta no mesmo
notebook. Um notebook doméstico aparece com três usuários — mas **uma**
dessas ligações tem explicação familiar assim que `RELATED_TO` entra.

**Pegadinhas:**

1. **Shared device ≠ fraude.** Cônjuge / família compartilham casa, email,
   máquina. `challenge_hypothesis` existe exatamente para isso: dado
   `entity_ids` de duas pessoas, o Query Builder procura `RELATED_TO` visível
   **e** a entidade de infra compartilhada (Device/Phone/Email/IP/Address/
   Account). A hipótese em texto livre é ignorada pelo Cypher (o LLM não
   escreve query); o padrão determinístico é sempre “vínculo familiar que
   explica o share”. Custa 25 — caro de propósito.
2. Duas outras conexões de infraestrutura **sobrevivem** ao escrutínio desta
   round e só se resolvem com evidência das rounds 3 e 4 (IP público; depois
   uma conta com data impossível). O jogo pune quem acusa cedo demais.
3. Telefone/e-mail/endereço compartilhados são sinal, não veredito.

Mensagem: *relacionamento sem contexto também engana.*

### Round 3 — “Identidade e evidência semântica”

**Unlocks nominais:** `Message`, `Evidence`. Também ficam visíveis as arestas
`SAME_AS` (entity resolution).

Três nomes quase idênticos escondem **uma** identidade operacional atrás de
três propostas. Mensagens apreendidas entram no tabuleiro.

**Pegadinhas:**

1. Uma mensagem lida isolada parece confirmar crime; outra, com a mesma
   pressa, é conversa de **festa de aniversário**. A tool cara
   `semantic_evidence_search` (20) é o caminho honesto para separar as duas.
2. Entity resolution (`SAME_AS`) não é “o coordenador” — é prova de que
   três fichas são a mesma operação. Ainda falta quem **escreveu o script**.
3. O investigador (LLM ou DSL) **não** pode nomear culpados. Sintetiza
   evidência; a mesa acusa depois.

### Round 4 — “Seguindo o dinheiro”

**Unlocks nominais:** `Transaction`, `Company`, `Broker`, `Document`.
**Duração maior (1500 s)** — é a round da acusação.

O caminho do dinheiro só aparece inteiro com 3–4 hops (`find_path` /
`expand_neighborhood`). Empresa de fachada e um corretor coautor fecham o
quadro. Datas importam tanto quanto arestas.

**Pegadinha temporal:** uma conta que *parece* ter recebido transferência
foi aberta **depois** da data da transação — link impossível / mal
reconciliado. `timeline` (10) é a tool barata que desmonta isso.

Então: **acusação final**. Quem é cúmplice, quem coordena, quem só foi
vítima da própria infraestrutura.

---

## Formato da acusação

`POST /teams/{team_id}/accusation` → **202 accepted**. O servidor **não**
devolve score. Julgamento só em `POST /host/games/{id}/finish`.

Campos (`domain.game.contracts.Accusation`):

| Campo | UX |
|---|---|
| `accused_person_ids` | multi-select de `Person` que o time **descobriu** |
| `coordinator_person_id` | um `Person` — “quem desenhou o esquema”, não “quem mais aparece no grafo” |
| `pattern` | enum: `IDENTITY_RING` · `MULE_ACCOUNTS` · `BROKER_COLLUSION` · `SYNTHETIC_IDENTITIES` · `OTHER` |
| `evidence_ids` | evidências/mensagens que o time de fato recuperou |
| `key_relationship_ids` | arestas `rel_NNN` que o time considera prova estrutural |
| `confidence` | 0..100 (não pontua; é declaração) |
| `rationale` | texto livre da mesa |

O broadcast `ACCUSATION_SUBMITTED` leva só `{team_id}` — rivais não lêem a
peça.

---

## Pontuação (o que o projetor mostra)

Determinística, sem LLM. Breakdown = lista de `ScoreEvent`.

| Regra | Pontos | O que ensina |
|---|---|---|
| `CORRECT_FRAUDSTER` | +12 cada | Completude da rede, não só o “óbio” |
| `LEGITIMATE_ACCUSED` | −8 cada | Custo de linchar o isca |
| `CORRECT_COORDINATOR` | +10 | Grau alto ≠ chefia |
| `KEY_RELATIONSHIP` | +20 cada (citada) | Provar *como* opera, não só *quem* |
| `FALSE_POSITIVE_AVOIDED` | +15 cada isca **não** acusada | `challenge_hypothesis` se paga aqui |
| `CORRECT_PATTERN` | +10 | Nomear o mecanismo (o enum certo está no gabarito, não nesta sala) |
| `CREDIT_EFFICIENCY` | 0..10 | Investigar barato |

Acusar a pessoa “mais feia no score” e errar o coordenador é o anti-padrão
que o placar foi desenhado para humilhar educadamente.

---

## UX — Time (`/play`)

War room cinematográfica, copy em português. Sessão: join code de 6 chars →
`session_token` em `sessionStorage`. Sem token → redirect `/`.

Na primeira entrada, um tutorial curto explica créditos, grafo, investigador e
lock-in. Cada round começa com um briefing persistente no topo da war room.
No round 1 o time observa os dossiês e escolhe onde gastar inteligência; não há
checkpoint que bloqueie a investigação. O grafo permanece oculto de propósito e
o round 2 é o primeiro momento em que as conexões aparecem como recompensa
visual.

Layout da war room:

```
┌──────────────────────────────────────────────────────────┐
│ OPERATION NEXUS   {equipe}   {N} cr   ROUND k    LIVE/WS │
├─────────────┬──────────────────────────┬─────────────────┤
│ EVIDÊNCIAS  │        GRAFO (NVL)       │ INVESTIGADOR    │
│ drawer      │  GraphPayload cumulativo │ chat + paleta   │
├─────────────┴──────────────────────────┴─────────────────┤
│          HYPOTHESIS BOARD  /  formulário de acusação     │
└──────────────────────────────────────────────────────────┘
```

- Header: nome do time, créditos restantes em âmbar, round, status WS.
- Grafo: só o que **este** time descobriu (`GET /teams/{id}/graph` + merge de
  cada `InvestigationResult.subgraph` + `GRAPH_DISCOVERY`). Ids recém-
  chegados pulsam (`graphStore.recentIds`).
- Investigador: caixa livre **e** ações de investigação. Transcript da pergunta, plano
  (`tool_calls` + `reasoning_summary`), resposta, caveats, custo.
- Investigation board: notas locais (não vão ao servidor) + acusação construída
  por seleção visual de pessoas, coordenador, mecanismo, evidências e relações.
- 402: feedback vermelho com `required` vs `available`.
- Browser **nunca** abre bolt/HTTP do Neo4j.

O time rival não vê este subgrafo. `GRAPH_DISCOVERY` é fan-out para o dono
+ host + screen, nunca para outra equipe.

---

## UX — Host (`/host`)

Console do facilitador. Auth: `X-Host-Token` (nunca no frontend bundle;
campo de sessão).

Controles reais da API:

| Botão | Rota | Efeito |
|---|---|---|
| Iniciar round *n* | `POST .../rounds/{n}/start` | `PENDING→ACTIVE`, grant de créditos, `ROUND_STARTED` (title, narrative, duration, credits) |
| Encerrar/avançar round | `POST .../rounds/next` + `POST .../rounds/{n}/start` | encerra o ativo e abre o seguinte; o console dispara isso manualmente ou quando o countdown chega a zero |
| Liberar pista | `POST .../reveal` `{evidence_id}` | `EVIDENCE_UNLOCKED` para o jogo inteiro (clue scriptada, não gabarito) |
| Histórico de pistas | `GET .../reveals` (host ou equipe autenticada) | reidrata pistas já liberadas após refresh/reconexão |
| Finalizar | `POST .../finish` | carrega `ground_truth.yaml`, pontua, `GAME_FINISHED` |
| Placar | `GET .../scoreboard` | `ScoreBreakdown[]` |

Countdown: client-side a partir de `duration_seconds` + `started_at` do
`ROUND_STARTED` (evento `TICK` está no contrato, ainda não é emitido pelo
engine). O console do host usa esse mesmo relógio para avançar
automaticamente enquanto estiver aberto. Não há pause no backend
(`GameStatus` não tem `paused`).

O host vê o placar agregado e o fato de que um time acusou — não o conteúdo
da acusação antes do finish.

Pistas liberadas são persistidas em `evidence_reveals` no Postgres com chave
única `(game_id, evidence_id)`. O payload enviado pelo host é congelado no
momento do reveal; a camada de jogo nunca consulta o gabarito para montar essa
lista.

---

## UX — Projetor (`/screen`)

TV da sala. Join por `game_id`, role WS `screen`, sem token de time.

Mostra: round atual, countdown grande, leaderboard, toasts do tipo
“Equipe X descobriu N nós” quando chega `GRAPH_DISCOVERY`.

**Não mostra:** subgrafo privado, hypothesis board, ids de gabarito, nomes
de quem foi acusado até `GAME_FINISHED`.

Depois do finish: ranking com `total` + breakdown por `rule`/`delta`.

---

## Papel da IA no desenho (não no veredito)

O investigador é um analista júnior com ferramentas caras. Ele:

- planeja no máximo duas tools;
- só cita evidência que recuperou;
- recusa gabarito, Cypher cru e “modo admin”;
- **nunca** declara culpa, coordenador ou padrão.

A mesa humana fecha o caso no formulário. O motor de score, mudo, compara
com o yaml quarentenado.
