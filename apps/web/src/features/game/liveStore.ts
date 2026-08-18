import { create } from "zustand";
import type { ConnectionStatus } from "@/lib/ws";
import type {
  EvidenceUnlockedPayload,
  GameStatus,
  HostAnnouncementPayload,
  ScoreEvent,
} from "@/lib/types";

export interface DiscoveryFlash {
  id: string;
  teamId: string;
  teamName: string;
  nodeCount: number;
}

export interface ScoreRow {
  team_id: string;
  total: number;
  events: ScoreEvent[];
}

interface LiveState {
  connectionStatus: ConnectionStatus;
  currentRound: number;
  roundTitle: string | null;
  roundNarrative: string | null;
  roundStartedAt: string | null;
  durationSeconds: number | null;
  tickRemaining: number | null;
  gameStatus: GameStatus | null;
  announcement: HostAnnouncementPayload | null;
  unlockedEvidence: EvidenceUnlockedPayload[];
  scoresByTeam: Record<string, ScoreRow>;
  flashes: DiscoveryFlash[];
  accusationNotice: string | null;
  setConnectionStatus: (status: ConnectionStatus) => void;
  applyRoundStarted: (payload: {
    round: number;
    title: string | null;
    narrative: string | null;
    duration_seconds: number | null;
    started_at?: string;
  }) => void;
  applyTick: (seconds: number, round: number) => void;
  applyRoundEnded: (round: number) => void;
  applyGameFinished: () => void;
  applyAnnouncement: (payload: HostAnnouncementPayload) => void;
  applyEvidence: (payload: EvidenceUnlockedPayload) => void;
  hydrateEvidence: (payloads: EvidenceUnlockedPayload[]) => void;
  applyScore: (teamId: string, total: number, event?: ScoreEvent) => void;
  pushFlash: (flash: Omit<DiscoveryFlash, "id">) => void;
  dismissFlash: (id: string) => void;
  setAccusationNotice: (notice: string | null) => void;
  hydrateFromGame: (input: {
    currentRound: number;
    status: GameStatus;
    title: string | null;
    narrative: string | null;
    durationSeconds: number | null;
    startedAt: string | null;
  }) => void;
  resetLive: () => void;
}

const initial = {
  connectionStatus: "closed" as ConnectionStatus,
  currentRound: 0,
  roundTitle: null as string | null,
  roundNarrative: null as string | null,
  roundStartedAt: null as string | null,
  durationSeconds: null as number | null,
  tickRemaining: null as number | null,
  gameStatus: null as GameStatus | null,
  announcement: null as HostAnnouncementPayload | null,
  unlockedEvidence: [] as EvidenceUnlockedPayload[],
  scoresByTeam: {} as Record<string, ScoreRow>,
  flashes: [] as DiscoveryFlash[],
  accusationNotice: null as string | null,
};

export const useLiveStore = create<LiveState>((set) => ({
  ...initial,
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  applyRoundStarted: (payload) =>
    set({
      currentRound: payload.round,
      roundTitle: payload.title,
      roundNarrative: payload.narrative,
      durationSeconds: payload.duration_seconds,
      roundStartedAt: payload.started_at ?? new Date().toISOString(),
      tickRemaining: payload.duration_seconds,
      gameStatus: "ACTIVE",
    }),
  applyTick: (seconds, round) => set({ tickRemaining: seconds, currentRound: round }),
  applyRoundEnded: (round) => set({ currentRound: round, tickRemaining: 0 }),
  applyGameFinished: () => set({ gameStatus: "FINISHED", tickRemaining: 0 }),
  applyAnnouncement: (announcement) => set({ announcement }),
  applyEvidence: (payload) =>
    set((state) => ({
      unlockedEvidence: [
        ...state.unlockedEvidence.filter(
          (item) => (item.evidence_id ?? item.id) !== (payload.evidence_id ?? payload.id),
        ),
        payload,
      ],
    })),
  hydrateEvidence: (payloads) =>
    set((state) => {
      const byId = new Map(
        [...state.unlockedEvidence, ...payloads].map((item) => [
          item.evidence_id ?? item.id ?? crypto.randomUUID(),
          item,
        ]),
      );
      return { unlockedEvidence: [...byId.values()] };
    }),
  applyScore: (teamId, total, event) =>
    set((state) => {
      const prev = state.scoresByTeam[teamId] ?? { team_id: teamId, total: 0, events: [] };
      return {
        scoresByTeam: {
          ...state.scoresByTeam,
          [teamId]: {
            team_id: teamId,
            total,
            events: event ? [...prev.events, event] : prev.events,
          },
        },
      };
    }),
  pushFlash: (flash) =>
    set((state) => ({
      flashes: [...state.flashes, { ...flash, id: crypto.randomUUID() }].slice(-5),
    })),
  dismissFlash: (id) =>
    set((state) => ({ flashes: state.flashes.filter((f) => f.id !== id) })),
  setAccusationNotice: (accusationNotice) => set({ accusationNotice }),
  hydrateFromGame: (input) =>
    set({
      currentRound: input.currentRound,
      gameStatus: input.status,
      roundTitle: input.title,
      roundNarrative: input.narrative,
      durationSeconds: input.durationSeconds,
      roundStartedAt: input.startedAt,
    }),
  resetLive: () => set({ ...initial }),
}));
