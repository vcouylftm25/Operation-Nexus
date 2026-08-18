const LABEL_COLORS: Record<string, string> = {
  Person: "#f5b942",
  Application: "#7aa2ff",
  Device: "#c084fc",
  Phone: "#67e8f9",
  Email: "#67e8f9",
  IPAddress: "#94a3b8",
  Address: "#a3e635",
  BankAccount: "#3ee0a0",
  Company: "#fb923c",
  Employer: "#fb923c",
  Broker: "#f472b6",
  Document: "#e2e8f0",
  Evidence: "#fb7185",
  Message: "#f97316",
  Transaction: "#2dd4bf",
};

const LABEL_NAMES: Record<string, string> = {
  Person: "Pessoa",
  Application: "Solicitação",
  Device: "Dispositivo",
  Phone: "Telefone",
  Email: "E-mail",
  IPAddress: "Endereço IP",
  Address: "Endereço",
  BankAccount: "Conta bancária",
  Company: "Empresa",
  Employer: "Empregador",
  Broker: "Correspondente",
  Document: "Documento",
  Evidence: "Evidência",
  Message: "Mensagem",
  Transaction: "Transação",
};

const RELATIONSHIP_NAMES: Record<string, string> = {
  SUBMITTED: "enviou",
  USED_DEVICE: "usou dispositivo",
  USED_PHONE: "usou telefone",
  USED_EMAIL: "usou e-mail",
  RESIDES_AT: "mora em",
  OWNS_ACCOUNT: "é titular de",
  WORKS_AT: "trabalha em",
  EMPLOYED_BY: "empregado por",
  RELATED_TO: "relacionado a",
  SAME_AS: "mesma identidade",
  ORIGINATED_BY: "originada por",
  SUPPORTED_BY: "apoiada por",
  CONNECTED_FROM: "conectado de",
  TRANSFERRED_TO: "transferiu para",
  FROM_ACCOUNT: "saiu de",
  TO_ACCOUNT: "chegou em",
  CONTROLLED_BY: "controlada por",
  MENTIONS: "menciona",
  MENTIONS_ACCOUNT: "menciona conta",
  SENT_BY: "enviada por",
  SENT_TO: "enviada para",
};

export function colorForLabels(labels: string[]): string {
  for (const label of labels) {
    const color = LABEL_COLORS[label];
    if (color) return color;
  }
  return "#64748b";
}

export function primaryLabel(labels: string[]): string {
  return labels[0] ?? "Node";
}

export function labelDisplay(labels: string[]): string {
  return LABEL_NAMES[primaryLabel(labels)] ?? primaryLabel(labels);
}

export function relationshipDisplay(type: string): string {
  return RELATIONSHIP_NAMES[type] ?? type.replaceAll("_", " ").toLowerCase();
}

const PROPERTY_NAMES: Record<string, string> = {
  content: "Conteúdo",
  sent_at: "Enviada em",
  captured_at: "Capturada em",
  source: "Fonte",
  channel: "Canal",
  credit_score: "Score de crédito",
  income_declared: "Renda declarada",
  occupation: "Ocupação",
  opened_at: "Conta aberta em",
  occurred_at: "Ocorreu em",
  amount: "Valor",
  bank: "Banco",
  address: "Endereço",
  geo_city: "Cidade",
  relationship: "Relação",
  name: "Nome",
  age: "Idade",
  cpf_masked: "CPF",
  number_masked: "Número",
  branch: "Agência",
  status: "Situação",
  product: "Produto",
  submitted_at: "Enviada em",
  fingerprint: "Impressão do aparelho",
  os: "Sistema",
  model: "Modelo",
  carrier: "Operadora",
  activated_at: "Ativada em",
  first_seen: "Visto pela primeira vez",
  evidence_type: "Tipo de evidência",
  timestamp: "Data do registro",
  confidence: "Confiança",
  observacoes: "Observações",
  visible_from_round: "Aparece na fase",
};

export function propertyDisplay(key: string): string {
  return PROPERTY_NAMES[key] ?? key.replaceAll("_", " ");
}
