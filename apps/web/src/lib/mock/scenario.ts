/**
 * Hand-written mock scenario ("Operação Bolso Vazio") — ~11 nodes across 2
 * rounds, shaped exactly like CONTRACT.md §14's scenario-as-code files
 * (entities.json / relationships.json / evidence.json / rounds.yaml /
 * ground_truth.yaml) so the mock API can stay a drop-in stand-in for the real
 * one. `ground_truth` is kept out of anything exported to UI code paths other
 * than the mock accusation-scoring function, mirroring the real backend's
 * "never before GAME_FINISHED" rule (CONTRACT.md §0.4).
 *
 * NOTE on `MENTIONS`: CONTRACT.md §3's relationship list only shows
 * `(:Evidence)-[:MENTIONS]->(:Person)`, but §14's example Message spec has a
 * `mentions` field too. We follow §14 literally and let Message produce
 * MENTIONS relationships as well — closest existing convention, not a new one.
 */
import type { GraphNode, GraphPayload, GraphRelationship, NodeLabel, RelationshipType } from "../types";

export interface ScenarioEntity {
  id: string;
  label: NodeLabel;
  visible_from_round: number;
  label_display: string;
  properties: Record<string, unknown>;
}

export interface ScenarioRelationship {
  id: string;
  type: RelationshipType;
  start_id: string;
  end_id: string;
  visible_from_round: number;
  source: string;
  confidence: number;
  timestamp?: string;
  properties?: Record<string, unknown>;
}

export interface ScenarioRound {
  number: number;
  title: string;
  narrative: string;
  credits: number;
  unlocks: NodeLabel[];
  duration_seconds: number;
}

export interface ScenarioGroundTruth {
  fraudsters: string[];
  coordinator: string;
  pattern: "IDENTITY_RING" | "MULE_ACCOUNTS" | "BROKER_COLLUSION" | "SYNTHETIC_IDENTITIES" | "OTHER";
  key_relationships: string[];
  designed_false_positives: string[];
  decoy_notes: string;
}

/** One "investigation beat" the mock AI investigator reveals per question asked. */
export interface ScenarioBeat {
  /** Simple keyword triggers — first match wins; falls through to the next unrevealed beat otherwise. */
  keywords: string[];
  nodeIds: string[];
  relationshipIds: string[];
  answer: string;
  caveats: string[];
  intent:
    | "ENTITY_LOOKUP"
    | "CONNECTION_SEARCH"
    | "PATH_SEARCH"
    | "NEIGHBORHOOD"
    | "TIMELINE"
    | "SEMANTIC_SEARCH"
    | "HYPOTHESIS_CHALLENGE";
  tool:
    | "inspect_entity"
    | "find_shared_entities"
    | "find_path"
    | "expand_neighborhood"
    | "timeline"
    | "semantic_evidence_search"
    | "challenge_hypothesis";
  cost: number;
  minRound: number;
}

export const SCENARIO_SLUG = "operation_nexus_mock";
export const SCENARIO_NAME = "Operação Bolso Vazio";

export const ENTITIES: ScenarioEntity[] = [
  {
    id: "person_01",
    label: "Person",
    visible_from_round: 1,
    label_display: "Marcos Duarte",
    properties: {
      name: "Marcos Duarte",
      cpf_masked: "***.112.334-**",
      age: 47,
      occupation: "Consultor financeiro",
      income_declared: 22000.0,
      credit_score: 701,
    },
  },
  {
    id: "person_02",
    label: "Person",
    visible_from_round: 1,
    label_display: "Fernanda Lima",
    properties: {
      name: "Fernanda Lima",
      cpf_masked: "***.778.221-**",
      age: 33,
      occupation: "Autônoma",
      income_declared: 6400.0,
      credit_score: 655,
    },
  },
  {
    id: "person_03",
    label: "Person",
    visible_from_round: 1,
    label_display: "Roberto Alves",
    properties: {
      name: "Roberto Alves",
      cpf_masked: "***.456.789-**",
      age: 41,
      occupation: "Autônomo",
      income_declared: 8200.0,
      credit_score: 812,
    },
  },
  {
    id: "person_04",
    label: "Person",
    visible_from_round: 1,
    label_display: "Beatriz Nogueira",
    properties: {
      name: "Beatriz Nogueira",
      cpf_masked: "***.903.442-**",
      age: 52,
      occupation: "Professora",
      income_declared: 4100.0,
      credit_score: 512,
    },
  },
  {
    id: "application_01",
    label: "Application",
    visible_from_round: 1,
    label_display: "Financiamento — Proposta 7742",
    properties: {
      amount: 85000.0,
      submitted_at: "2026-02-02T09:15:00Z",
      status: "under_review",
      product: "financiamento_veicular",
    },
  },
  {
    id: "account_01",
    label: "BankAccount",
    visible_from_round: 1,
    label_display: "Conta 8831-x",
    properties: {
      bank: "Banco Aurora",
      branch: "0452",
      number_masked: "8831-*",
      opened_at: "2025-11-04T00:00:00Z",
    },
  },
  {
    id: "account_02",
    label: "BankAccount",
    visible_from_round: 1,
    label_display: "Conta 1206-x",
    properties: {
      bank: "Banco Aurora",
      branch: "0452",
      number_masked: "1206-*",
      opened_at: "2024-06-19T00:00:00Z",
    },
  },
  {
    id: "device_01",
    label: "Device",
    visible_from_round: 2,
    label_display: "Dispositivo fp_9a31",
    properties: {
      fingerprint: "fp_9a31c0",
      os: "Android 14",
      first_seen: "2026-01-28T22:04:00Z",
    },
  },
  {
    id: "phone_01",
    label: "Phone",
    visible_from_round: 2,
    label_display: "Linha ***-4471",
    properties: {
      number_masked: "(11) 9****-4471",
      carrier: "Vivo",
    },
  },
  {
    id: "evidence_01",
    label: "Evidence",
    visible_from_round: 2,
    label_display: "Extrato bancário — Conta 8831",
    properties: {
      evidence_type: "financial_record",
      content:
        "Três transferências de R$ 9.700 em 36h da conta 8831 para a conta 1206, todas abaixo do limite de reporte.",
      captured_at: "2026-02-10T00:00:00Z",
      source: "bank_statement",
    },
  },
  {
    id: "message_01",
    label: "Message",
    visible_from_round: 2,
    label_display: "WhatsApp — 09/02 20:41",
    properties: {
      content: "ele só precisa assinar, o carro fica no nome dele e eu cuido do resto",
      sent_at: "2026-02-09T20:41:00Z",
      channel: "whatsapp",
    },
  },
];

export const RELATIONSHIPS: ScenarioRelationship[] = [
  {
    id: "rel_001",
    type: "SUBMITTED",
    start_id: "person_02",
    end_id: "application_01",
    visible_from_round: 1,
    source: "core_banking",
    confidence: 1,
    timestamp: "2026-02-02T09:15:00Z",
  },
  {
    id: "rel_002",
    type: "OWNS_ACCOUNT",
    start_id: "person_03",
    end_id: "account_01",
    visible_from_round: 1,
    source: "core_banking",
    confidence: 1,
  },
  {
    id: "rel_003",
    type: "OWNS_ACCOUNT",
    start_id: "person_01",
    end_id: "account_02",
    visible_from_round: 1,
    source: "core_banking",
    confidence: 1,
  },
  {
    id: "rel_004",
    type: "USED_DEVICE",
    start_id: "person_01",
    end_id: "device_01",
    visible_from_round: 2,
    source: "device_fingerprinting",
    confidence: 0.95,
  },
  {
    id: "rel_005",
    type: "USED_DEVICE",
    start_id: "person_02",
    end_id: "device_01",
    visible_from_round: 2,
    source: "device_fingerprinting",
    confidence: 0.97,
  },
  {
    id: "rel_006",
    type: "USED_DEVICE",
    start_id: "person_03",
    end_id: "device_01",
    visible_from_round: 2,
    source: "device_fingerprinting",
    confidence: 0.91,
  },
  {
    id: "rel_007",
    type: "USED_PHONE",
    start_id: "person_01",
    end_id: "phone_01",
    visible_from_round: 2,
    source: "telco_records",
    confidence: 0.88,
  },
  {
    id: "rel_008",
    type: "USED_PHONE",
    start_id: "person_03",
    end_id: "phone_01",
    visible_from_round: 2,
    source: "telco_records",
    confidence: 0.9,
  },
  {
    id: "rel_009",
    type: "TRANSFERRED_TO",
    start_id: "account_01",
    end_id: "account_02",
    visible_from_round: 2,
    source: "bank_statement",
    confidence: 0.99,
    timestamp: "2026-02-10T00:00:00Z",
  },
  {
    id: "rel_010",
    type: "MENTIONS_ACCOUNT",
    start_id: "evidence_01",
    end_id: "account_01",
    visible_from_round: 2,
    source: "bank_statement",
    confidence: 1,
  },
  {
    id: "rel_011",
    type: "MENTIONS",
    start_id: "evidence_01",
    end_id: "person_03",
    visible_from_round: 2,
    source: "bank_statement",
    confidence: 0.8,
  },
  {
    id: "rel_012",
    type: "SENT_BY",
    start_id: "message_01",
    end_id: "person_01",
    visible_from_round: 2,
    source: "seized_device",
    confidence: 1,
  },
  {
    id: "rel_013",
    type: "SENT_TO",
    start_id: "message_01",
    end_id: "person_02",
    visible_from_round: 2,
    source: "seized_device",
    confidence: 1,
  },
  {
    id: "rel_014",
    type: "MENTIONS",
    start_id: "message_01",
    end_id: "person_03",
    visible_from_round: 2,
    source: "seized_device",
    confidence: 0.7,
  },
];

export const ROUNDS: ScenarioRound[] = [
  {
    number: 1,
    title: "Individualmente, tudo parece normal",
    narrative:
      "Uma proposta de financiamento chegou para análise. Nada nela é abertamente suspeito — ainda.",
    credits: 100,
    unlocks: ["Person", "Application", "BankAccount"],
    duration_seconds: 240,
  },
  {
    number: 2,
    title: "As conexões aparecem",
    narrative:
      "Novas fontes de dados foram liberadas: dispositivos, telefonia e o material apreendido. Comece a cruzar.",
    credits: 120,
    unlocks: ["Device", "Phone", "Evidence", "Message"],
    duration_seconds: 240,
  },
];

/** Quarantined — only the mock accusation scorer may read this (mirrors §0.4 / §14). */
export const GROUND_TRUTH: ScenarioGroundTruth = {
  fraudsters: ["person_01", "person_02", "person_03"],
  coordinator: "person_01",
  pattern: "MULE_ACCOUNTS",
  key_relationships: ["rel_005", "rel_009"],
  designed_false_positives: ["person_04"],
  decoy_notes: "person_04 has the worst credit score in the graph and is fully legitimate.",
};

export const BEATS: ScenarioBeat[] = [
  {
    keywords: ["roberto", "person_03", "conta", "account"],
    nodeIds: ["person_03", "account_01"],
    relationshipIds: ["rel_002"],
    answer:
      "Roberto Alves (person_03) é titular da conta 8831-x no Banco Aurora, aberta em novembro de 2025.",
    caveats: [],
    intent: "ENTITY_LOOKUP",
    tool: "inspect_entity",
    cost: 5,
    minRound: 1,
  },
  {
    keywords: ["fernanda", "person_02", "proposta", "application", "financiamento"],
    nodeIds: ["person_02", "application_01"],
    relationshipIds: ["rel_001"],
    answer: "Fernanda Lima (person_02) submeteu a proposta 7742, no valor de R$ 85.000,00, em 02/02.",
    caveats: [],
    intent: "ENTITY_LOOKUP",
    tool: "inspect_entity",
    cost: 5,
    minRound: 1,
  },
  {
    keywords: ["marcos", "person_01", "coordenador"],
    nodeIds: ["person_01", "account_02"],
    relationshipIds: ["rel_003"],
    answer: "Marcos Duarte (person_01) é titular da conta 1206-x, mesma agência da conta de Roberto.",
    caveats: ["Mesma agência pode ser coincidência isolada — sem mais provas ainda."],
    intent: "ENTITY_LOOKUP",
    tool: "inspect_entity",
    cost: 5,
    minRound: 1,
  },
  {
    keywords: ["dispositivo", "device", "compartilh", "aparelho"],
    nodeIds: ["device_01", "person_01", "person_02", "person_03"],
    relationshipIds: ["rel_004", "rel_005", "rel_006"],
    answer:
      "O mesmo dispositivo (fp_9a31c0) foi usado por Marcos, Fernanda e Roberto — três pessoas que, na teoria, não se conhecem.",
    caveats: [],
    intent: "CONNECTION_SEARCH",
    tool: "find_shared_entities",
    cost: 10,
    minRound: 2,
  },
  {
    keywords: ["telefone", "phone", "linha", "celular"],
    nodeIds: ["phone_01", "person_01", "person_03"],
    relationshipIds: ["rel_007", "rel_008"],
    answer: "A linha ***-4471 também é compartilhada entre Marcos e Roberto.",
    caveats: [],
    intent: "CONNECTION_SEARCH",
    tool: "find_shared_entities",
    cost: 10,
    minRound: 2,
  },
  {
    keywords: ["transfer", "dinheiro", "caminho", "path", "conecta"],
    nodeIds: ["account_01", "account_02"],
    relationshipIds: ["rel_009"],
    answer:
      "Existe um caminho direto de transferência: conta de Roberto (8831) para a conta de Marcos (1206), três depósitos fracionados abaixo do limite de reporte.",
    caveats: [],
    intent: "PATH_SEARCH",
    tool: "find_path",
    cost: 15,
    minRound: 2,
  },
  {
    keywords: ["prova", "evidência", "evidence", "extrato", "mensagem", "whatsapp"],
    nodeIds: ["evidence_01", "message_01", "person_03"],
    relationshipIds: ["rel_010", "rel_011", "rel_012", "rel_013", "rel_014"],
    answer:
      "O extrato bancário e uma mensagem apreendida do celular de Marcos mencionam Roberto e a conta 8831 — o material fala em 'colocar no nome dele'.",
    caveats: ["A mensagem por si só não prova intenção — cruze com a movimentação financeira."],
    intent: "SEMANTIC_SEARCH",
    tool: "semantic_evidence_search",
    cost: 20,
    minRound: 2,
  },
  {
    keywords: ["beatriz", "person_04", "duvido", "suspeita", "hipótese", "challenge"],
    nodeIds: ["person_04"],
    relationshipIds: [],
    answer:
      "Beatriz Nogueira tem o pior score de crédito do grupo, mas não há nenhuma conexão dela com dispositivos, contas ou evidências dos demais — nada aponta para envolvimento.",
    caveats: ["Score de crédito baixo não é, isoladamente, evidência de fraude."],
    intent: "HYPOTHESIS_CHALLENGE",
    tool: "challenge_hypothesis",
    cost: 25,
    minRound: 1,
  },
];

// ---------------------------------------------------------------------------
// Projection helpers — ScenarioEntity/Relationship -> GraphNode/GraphRelationship
// (the only shape allowed to cross the API boundary, CONTRACT.md §5)
// ---------------------------------------------------------------------------

export function toGraphNode(entity: ScenarioEntity): GraphNode {
  return {
    id: entity.id,
    labels: [entity.label],
    properties: entity.properties,
    label_display: entity.label_display,
  };
}

export function toGraphRelationship(rel: ScenarioRelationship): GraphRelationship {
  return {
    id: rel.id,
    type: rel.type,
    start_id: rel.start_id,
    end_id: rel.end_id,
    properties: {
      ...rel.properties,
      source: rel.source,
      confidence: rel.confidence,
      ...(rel.timestamp ? { timestamp: rel.timestamp } : {}),
    },
  };
}

/** Everything visible at or before `round`, projected to the wire shape. */
export function graphAtRound(round: number): GraphPayload {
  const nodeIds = new Set(
    ENTITIES.filter((e) => e.visible_from_round <= round).map((e) => e.id),
  );
  return {
    nodes: ENTITIES.filter((e) => nodeIds.has(e.id)).map(toGraphNode),
    relationships: RELATIONSHIPS.filter(
      (r) =>
        r.visible_from_round <= round && nodeIds.has(r.start_id) && nodeIds.has(r.end_id),
    ).map(toGraphRelationship),
  };
}

export function entityById(id: string): ScenarioEntity | undefined {
  return ENTITIES.find((e) => e.id === id);
}

export function relationshipById(id: string): ScenarioRelationship | undefined {
  return RELATIONSHIPS.find((r) => r.id === id);
}
