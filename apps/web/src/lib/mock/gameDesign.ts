import type { CaseFile, FraudPattern } from "@/lib/types";

export type MissionGateKind = "TARGETS" | "CLUSTER" | "IDENTITY" | "FINAL";

export interface PlayerRoundBrief {
  number: number;
  eyebrow: string;
  title: string;
  briefing: string;
  objective: string;
  decision: string;
  decisionHint: string;
  gateKind: MissionGateKind;
  graphUnlocked: boolean;
  recommendedPattern?: FraudPattern;
}

export interface HostClue {
  id: string;
  title: string;
  subtitle: string;
  evidenceId: string;
  accent: "amber" | "signal" | "danger";
}

export interface HostRoundScript {
  round: number;
  teachingGoal: string;
  likelyMove: string;
  rescueQuestion: string;
  revealLine: string;
}

export const PLAYER_BRIEFS: PlayerRoundBrief[] = [
  {
    number: 1,
    eyebrow: "BRIEFING · TRIAGEM",
    title: "Quem merece investigação?",
    briefing:
      "A Vero Crédito detectou irregularidades em um lote recente de solicitações. Vocês têm recursos para aprofundar apenas três perfis.",
    objective: "Escolham os alvos usando somente as informações individuais disponíveis.",
    decision: "Selecione 3 perfis para investigação aprofundada",
    decisionHint: "A escolha será bloqueada quando confirmada. O resto da sala verá o compromisso de vocês.",
    gateKind: "TARGETS",
    graphUnlocked: false,
  },
  {
    number: 2,
    eyebrow: "NOVO INTEL · CONNECT THE DOTS",
    title: "Qual cluster merece escalonamento?",
    briefing:
      "Até agora vocês analisaram indivíduos. Novas fontes revelam dispositivos, telefones e contas compartilhadas.",
    objective: "Encontrem uma conexão relevante e decidam se ela é suspeita ou explicável.",
    decision: "Escolha o cluster que deve subir para a próxima camada",
    decisionHint: "Uma relação pode parecer incriminadora e ainda ter uma explicação simples.",
    gateKind: "CLUSTER",
    graphUnlocked: true,
  },
  {
    number: 3,
    eyebrow: "NOVO INTEL · ENTITY RESOLUTION",
    title: "Tem alguém aqui que não é quem diz ser.",
    briefing:
      "Inconsistências cadastrais apareceram em algumas solicitações. Mensagens recuperadas podem separar identidade real de ruído.",
    objective: "Formem uma hipótese de identidade e encontrem a evidência que a sustenta.",
    decision: "Trave a hipótese que merece uma busca semântica",
    decisionHint: "A busca é aberta: formulem a pergunta com suas próprias palavras.",
    gateKind: "IDENTITY",
    graphUnlocked: true,
  },
  {
    number: 4,
    eyebrow: "NOVO INTEL · FOLLOW THE MONEY",
    title: "Feche o caminho do dinheiro.",
    briefing:
      "Transações, uma empresa e um corretor completam o quadro. A acusação final depende de pessoas, mecanismo e prova.",
    objective: "Construam uma acusação que sobreviva ao dinheiro, às datas e aos falsos positivos.",
    decision: "Confirme a teoria final antes de enviar a acusação",
    decisionHint: "Quem aparece mais no grafo não é necessariamente quem coordena.",
    gateKind: "FINAL",
    graphUnlocked: true,
    recommendedPattern: "MULE_ACCOUNTS",
  },
];

export const HOST_CLUES: HostClue[] = [
  {
    id: "clue_r2_infrastructure",
    title: "Novo relatório de infraestrutura",
    subtitle: "Revela a próxima camada de conexões",
    evidenceId: "evidence_01",
    accent: "signal",
  },
  {
    id: "clue_r3_message",
    title: "Pista semântica",
    subtitle: "Liberar quando a sala estiver presa na primeira leitura",
    evidenceId: "message_01",
    accent: "amber",
  },
  {
    id: "clue_r4_money",
    title: "Informação bancária",
    subtitle: "O dinheiro fecha ou desmonta a teoria",
    evidenceId: "evidence_01",
    accent: "danger",
  },
];

export const HOST_SCRIPT: HostRoundScript[] = [
  { round: 1, teachingGoal: "Features individuais não fecham um caso.", likelyMove: "A sala vai perseguir o score mais baixo.", rescueQuestion: "O que vocês ainda não conseguem saber olhando só para esta ficha?", revealLine: "Até agora vocês analisaram indivíduos. Agora conectem os pontos." },
  { round: 2, teachingGoal: "Uma relação sem contexto não é prova.", likelyMove: "O time vai escalar o primeiro device compartilhado.", rescueQuestion: "Existe uma explicação legítima para essa infraestrutura?", revealLine: "A conexão apareceu. O contexto decide o que ela significa." },
  { round: 3, teachingGoal: "Identidade e linguagem exigem evidência.", likelyMove: "A sala vai tratar a primeira mensagem como confissão.", rescueQuestion: "O que a mensagem diz literalmente — e o que vocês estão inferindo?", revealLine: "Uma mensagem é uma pista. O conjunto é a evidência." },
  { round: 4, teachingGoal: "Fluxo e tempo fecham a acusação.", likelyMove: "O time vai seguir o caminho mais conectado.", rescueQuestion: "Quem coordena, e qual data torna essa teoria possível?", revealLine: "Agora não basta apontar pessoas. Provem o mecanismo." },
];

export function currentBrief(round: number): PlayerRoundBrief {
  return PLAYER_BRIEFS.find((brief) => brief.number === round) ?? PLAYER_BRIEFS[0];
}

export function displayName(file: Pick<CaseFile, "label_display">): string {
  return file.label_display.replace(/\s+—.*$/, "");
}
