# ⚠ SPOILERS — Operação Nexus

```
██████  ███████ ███████ ██ ███████     ██████  ███████     ██      ██ ███    ██ ██   ██  █████
██   ██ ██      ██      ██ ██          ██   ██ ██          ██      ██ ████   ██ ██   ██ ██   ██
██████  █████   ███████ ██ █████       ██   ██ █████       ██      ██ ██ ██  ██ ███████ ███████
██   ██ ██           ██ ██ ██          ██   ██ ██          ██      ██ ██  ██ ██ ██   ██ ██   ██
██████  ███████ ███████ ██ ███████     ██████  ███████     ███████ ██ ██   ████ ██   ██ ██   ██
```

**PARE.** Este arquivo é o gabarito completo do mistério. Só o facilitador,
o autor do cenário e os testes de scoring podem lê-lo.

Se você é jogador: feche agora. Nada daqui entra em prompt, tool result,
resposta de API ou tela de time **antes** de `GAME_FINISHED`.

Fonte: `scenarios/operation_nexus/ground_truth.yaml` (quarentenado —
`domain/game/scoring.py` é o único módulo de produção autorizado a carregá-lo)
e os comentários nesse yaml + o grafo em `entities.json` / `relationships.json`
/ `evidence.json`.

---

## Veredito

| Papel | id | Nome |
|---|---|---|
| Coordenador | `person_04` | Eduardo Vasconcelos |
| Mule | `person_01` | Anderson Melo |
| Cash-out / layering | `person_03` | Patrícia Melo (irmã de Anderson) |
| Alias 1/3 | `person_05` | “Roberto Alves” |
| Alias 2/3 | `person_06` | “R. Alves” |
| Alias 3/3 | `person_07` | “Rob. Alves” |

`pattern`: **`IDENTITY_RING`**.

O trio Alves **é a mesma pessoa operacional** (três fichas fabricadas),
resolvido por `SAME_AS` na round 3. Eduardo **escreveu o script** (mensagens
+ empresa de fachada + conta final). Anderson **emprestou o nome/contas reais**
— é o nó de fraude mais visível a partir da round 2, e **não** o coordenador.
Patrícia gira o dinheiro (`account_02` / `account_03`).

---

## Iscas (`designed_false_positives`)

| id | Nome | Por que parece culpada | Como se limpa |
|---|---|---|---|
| `person_02` | Camila Melo | Esposa de Anderson; `USED_DEVICE` no notebook da casa (`device_01`) na round 2; recebe TED recorrente na round 4 | Round 2: `RELATED_TO {kind: spouse}` + `challenge_hypothesis`. Round 4: `evidence_03` — mesada doméstica ~R$ 450/mês, 14 meses, não layering |
| `person_08` | Marlene Ferreira | **Pior `credit_score` do cenário (312)** | Zero aresta com a rede em qualquer round. Lição da round 1 |
| `person_09` | Juliana Prado | Compartilha o IP da LAN house (`ip_01`) com Patrícia na round 2; na round 4 `transaction_08` aponta `account_05` | Round 3: `evidence_02` (Wi-Fi público, ~40 clientes/dia). Round 4: `evidence_05` — `account_05.opened_at = 2026-03-01`, transação em **2026-02-10** (link impossível) |

---

## Relações-chave (as que pontuam +20 se **citadas** na acusação)

| id | Tipo | De → Para | Por que é chave |
|---|---|---|---|
| `rel_058` | `USED_DEVICE` | `person_05` → `device_01` | O alias “Roberto” reusa, desleixado, o notebook da casa Melo |
| `rel_059` | `USED_DEVICE` | `person_05` → `device_02` | Laptop operativo compartilhado pelo trio de alias |
| `rel_110` | `SAME_AS` | `person_05` → `person_06` | Entity resolution do trio (as outras cinco `SAME_AS` simétricas existem; só esta está no gabarito) |
| `rel_116` | `OWNS_ACCOUNT` | `person_01` → `account_01` | Porta de entrada do money trail no mule |
| `rel_052` | `TRANSFERRED_TO` | `account_02` → `account_04` | Hop direto da conta de layering para a conta do coordenador/shell |
| `rel_142` | `CONTROLLED_BY` | `company_01` → `person_04` | Eduardo controla Aurora Multiserviços (sócio-administrador) |

Times que descobrem a aresta mas **esquecem de citá-la** no form não levam os
+20 (`scoring.py` olha `accusation.key_relationship_ids`, não a tabela
`discoveries`).

---

## Elenco de apoio (não acusar)

Clientes-filler legítimos: `person_10` Beatriz Nogueira (a da festa),
`person_11`–`person_22`. Corretor **cúmplice**: `broker_01` Marcelo Petri
(originou as propostas do cluster). Corretor limpo: `broker_02` Renata Souza.
Empresa-fachada: `company_01` Aurora Multiserviços Administrativos LTDA
(constituída 15/11/2025, 13 dias antes da primeira proposta do esquema).

Marcelo é cúmplice operacional; **não** está em `fraudsters`. Acusá-lo como
`Person` é impossível (é `Broker`). O padrão `BROKER_COLLUSION` é isca de
enum — o gabarito é `IDENTITY_RING`.

---

## Infraestrutura que importa

| id | O que é |
|---|---|
| `device_01` | Notebook Dell da residência Melo. Usuários: Anderson, Camila (cônjuge), e o alias Roberto (`rel_058`) |
| `device_02` | Notebook Acer do trio Alves (`person_05/06/07`) |
| `device_03` | iPhone da Patrícia → `ip_01` (LAN house) |
| `device_04` | Notebook do Eduardo → `ip_03` (casa dele, grau baixo de propósito) |
| `device_05` | Notebook da Juliana → **também** `ip_01` |
| `phone_01` | Linha compartilhada do trio |
| `phone_02` | Pré-paga Patrícia **e** Eduardo (fio discreto entre layering e coordenador, já na round 2) |
| `email_04` | `familia.melo.casa@mailbr.com` — Anderson + Camila |
| `ip_01` | `191.32.44.201` LAN House Boa Vista |
| `ip_02` | Residência Melo — `device_01` **e** `device_02` caem aqui (o laptop do trio usa a casa do mule) |
| `address_01` | Casa Melo (Anderson + Camila) |
| `account_01` | Anderson (entrada) |
| `account_02` / `account_03` | Patrícia (giro / consolidação) |
| `account_04` | Eduardo (destino; também da shell) |
| `account_05` | Juliana — aberta em 01/03/2026 |
| `account_07/08/09` | Contas nas quais o trio “recebe” as antecipações e manda para `account_02` |
| `account_10` | Camila (mesada) |

Money trail (round 4):

```
account_07 (Roberto)  ─┐
account_08 (R. Alves) ─┼─ TED → account_02 (Patrícia)
account_09 (Rob.)     ─┘         │
account_01 (Anderson) ─ TED ─────┤
                                 ├─ TED 55k → account_03 (Patrícia, consolidação)
                                 └─ TED 34k → account_04 (Eduardo)     ← rel_052
                                              account_03 ─ TED 52k → account_04
                                              account_03 ─ PIX  4.2k → account_05 (armadilha)
```

---

## Como `challenge_hypothesis` limpa a armadilha do cônjuge

O texto da hipótese **não entra** no Cypher. O builder
(`build_challenge_hypothesis`) sempre procura, entre os `entity_ids`:

1. uma aresta `RELATED_TO` visível (aqui: `rel_106` / `rel_107`,
   `kind: spouse`, visível round 2);
2. **e** um nó de infra compartilhado nas labels de
   `SHARED_ENTITY_LABELS` — no casal Melo: `device_01`, também `email_04`
   e `address_01`.

Comando da paleta, round 2+:

```
/challenge Anderson e Camila compartilham o notebook porque são cúmplices | person_01,person_02
```

Retorno típico: o casal + `RELATED_TO {kind: spouse}` + o device/email/endereço
domésticos. Isso **enfraquece** a hipótese de conluio; não confirma fraude.
Custa 25 créditos. Na round 4, `evidence_03` enterra o residual da conta 10.

`person_01`–`person_03` (`kind: sibling`) também cai nesse padrão se o time
challengar o par mule/irmã — aí a contra-evidência familiar **não** inocenta
Patrícia (ela é fraudster). O time ainda precisa do money trail e das
mensagens para não confundir “família explica o device” com “família explica
o TED de R$ 16.500”.

---

## Walkthrough round a round (descobertas pretendidas)

### Round 1 — fichas

Visível: 22 `Person`, 31 `Application`.

- Marlene (`person_08`, score 312, proposta `application_11` reprovada de
  R$ 2.500) é o ímã de acusação barata. Isolada, sem rede.
- O trio Alves tem scores 799–834 e três antecipações gordas
  (`application_08/09/10`, ~R$ 24–27k, aprovadas).
- Anderson (`person_01`) tem **quatro** propostas (`application_01..04`),
  ocupação “motorista de aplicativo”, score mediano 641 — barulhento, mas
  ainda “um cliente”.
- Eduardo (`person_04`) tem **uma** proposta chata: consignado-veículo
  `application_07`, R$ 15k, status `quitado`. Grau baixo de propósito. Times
  que só ranqueiam por volume/score nunca olham para ele.

Nenhuma evidência de device. Objetivo: **não fechar o caso**.

### Round 2 — infra

- `find_shared_entities` no trio → `device_02`, `phone_01`; `person_06` e
  `person_07` ainda residem no mesmo `address_05`.
- `device_01` tem três usuários: Anderson, Camila, Roberto. O “PEGAMOS”
  prematuro. `challenge_hypothesis` no casal devolve spouse. Roberto no
  notebook da casa do mule **não** tem `RELATED_TO` — esse share resiste.
- `ip_01` (LAN house) liga `device_03` (Patrícia) e `device_05` (Juliana).
  Sem `evidence_02` ainda, a isca Juliana sobrevive a round inteira.
- `phone_02` já liga Patrícia e Eduardo. Quase ninguém segue, porque Eduardo
  continua com grau baixo e uma proposta única.
- `ip_02` (casa Melo) vê `device_01` e `device_02` — o laptop do trio opera
  na casa do mule. Fio estrutural, ainda sem gabarito de identidade.

### Round 3 — identidade + semântica

- Seis `SAME_AS` fecham `person_05 ≡ person_06 ≡ person_07`. `rel_110` é a
  que o gabarito cobra.
- `evidence_01`: padrão de digitação idêntico nas três antecipações.
- `message_04` (Eduardo → “Roberto”): *“Nas três propostas muda um pouco o
  nome e o telefone quando der”* — ele dirige o identity ring.
- `message_01` (Eduardo → Patrícia): *“já conversei com o Anderson e ele
  topou. Ele só precisa colocar no nome dele”* — mule consciente, coordenador
  falando.
- `message_09` (Eduardo → Rob.): *“O Marcelo já validou as três propostas”*
  — corretor por dentro (`broker_01`), ainda sem o nó Broker (round 4).
- `message_05` / `message_06`: Beatriz ↔ Camila sobre **buffet da festa da
  Bia**. Semantic search apressada por “resolver / mandar / cuidar” pega
  isto. É a pegadinha de NLP.
- `evidence_02`: limpa Juliana no eixo do IP.

Eduardo agora é encontrável **combinando** mensagens (ele dá ordem) +
`SAME_AS` (ele scriptou o trio) — o money path ainda está fechado.

### Round 4 — dinheiro e acusação

- Antecipações do trio (`account_07/08/09`) → `account_02` (Patrícia) em
  23–25/01.
- Anderson (`account_01`) → `account_02` em 29/01 (`evidence_04`: >80% do
  crédito sai em <72h).
- Patrícia consolida `account_02` → `account_03` (R$ 55k) e reparte:
  R$ 52k para `account_04` (Eduardo) e o atalho `rel_052` R$ 34k
  `account_02` → `account_04`.
- `company_01` `CONTROLLED_BY` Eduardo (`rel_142`); `evidence_08` (Junta:
  empresa sem empregados, conta 04).
- `broker_01` originou `application_08/09/10/01/05` (trio + mule + Patrícia).
  `evidence_07` + `evidence_06` (mesmo escritório “Contabilidade Rápida ME”
  nos comprovantes do trio **e** de Anderson).
- Armadilha `transaction_08` / `account_05` / `evidence_05`: Juliana fora
  do money trail.
- `evidence_03`: Camila fora.

Acusação perfeita: os seis `fraudsters`, coordenador `person_04`, padrão
`IDENTITY_RING`, as seis `key_relationships`, **sem** `person_02/08/09`.
Times que acusam só Anderson perdem coordenador (+10), o trio (+36) e
parte das relações-chave.

---

## Teto teórico de pontos (facilitador)

Assumindo acusação perfeita e créditos intactos:

| Bloco | Máx. |
|---|---|
| 6 × `CORRECT_FRAUDSTER` | 72 |
| `CORRECT_COORDINATOR` | 10 |
| 6 × `KEY_RELATIONSHIP` | 120 |
| 3 × `FALSE_POSITIVE_AVOIDED` | 45 |
| `CORRECT_PATTERN` | 10 |
| `CREDIT_EFFICIENCY` | 10 |
| **Total** | **267** |

Acusar Marlene: −8 e perde +15 da isca (swing de 23). Acusar Camila ou
Juliana: o mesmo swing, mais a lição da round correspondente.

---

## Checklist do facilitador (sem ler na frente da sala)

1. Round 1: se alguém cravar “é a aposentada do score 312”, sorrir e não
   confirmar.
2. Round 2: quando gritarem no notebook da casa Melo, perguntar se já
   rodaram `/challenge` no casal. Não nomear Eduardo.
3. Round 3: se a mesa citar a mensagem do bolo como prova, apontar a tool
   de busca de novo — não o gabarito.
4. Round 4: se alguém “provar” Juliana pelo PIX, pedir a `timeline` da
   conta 05.
5. Finish só depois de todas as acusações 202. O projetor então pode mostrar
   o breakdown. Aí, e só aí, este arquivo deixa de ser contrabando.
