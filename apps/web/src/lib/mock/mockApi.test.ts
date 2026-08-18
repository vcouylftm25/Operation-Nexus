import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, isInsufficientCredits } from "@/lib/api";
import {
  advancePhase,
  buyHint,
  getHints,
  getLeaderboard,
  getSuspects,
  investigate,
  resetMockState,
  startPlay,
  submitGuess,
} from "@/lib/mock/mockApi";
import { MOCK_GAME_ID } from "@/lib/constants";
import { GROUND_TRUTH, ROUNDS } from "@/lib/mock/scenario";

const FINAL_PHASE = ROUNDS.length;

async function startAtFinalPhase(name: string) {
  const started = await startPlay(name);
  const { team_id } = started.team;
  const token = started.session_token;
  for (let phase = started.team.current_round; phase < FINAL_PHASE; phase += 1) {
    await advancePhase(team_id, token);
  }
  return { team_id, token };
}

beforeEach(() => {
  resetMockState();
});

describe("startPlay", () => {
  it("creates a team the first time and resumes the same run for the same name", async () => {
    const first = await startPlay("Os Detetives");
    expect(first.resumed).toBe(false);
    expect(first.rounds).toHaveLength(FINAL_PHASE);

    await advancePhase(first.team.team_id, first.session_token);

    const again = await startPlay("  os   detetives ");
    expect(again.resumed).toBe(true);
    expect(again.team.team_id).toBe(first.team.team_id);
    expect(again.team.current_round).toBe(2);
  });

  it("rejects a name that cannot identify a team", async () => {
    await expect(startPlay(" a ")).rejects.toMatchObject({
      status: 422,
      body: { error: "INVALID_TEAM_NAME" },
    });
  });
});

describe("advancePhase", () => {
  it("adds the new phase's credits to whatever the team had left", async () => {
    const started = await startPlay("Equipe Beta");
    const before = started.team.credits_balance;

    const advanced = await advancePhase(started.team.team_id, started.session_token);
    expect(advanced.team.current_round).toBe(2);
    expect(advanced.briefing.number).toBe(2);
    expect(advanced.team.credits_balance).toBe(before + advanced.briefing.credits_awarded);
  });

  it("refuses to go past the last phase", async () => {
    const { team_id, token } = await startAtFinalPhase("Equipe Gama");
    await expect(advancePhase(team_id, token)).rejects.toMatchObject({
      status: 409,
      body: { error: "NO_FURTHER_PHASE" },
    });
  });
});

describe("hints", () => {
  it("only offers hints up to the team's current phase", async () => {
    const started = await startPlay("Equipe Delta");
    const cards = await getHints(started.team.team_id, started.session_token);

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every((card) => card.round === 1)).toBe(true);
    expect(cards.every((card) => card.text === null)).toBe(true);
  });

  it("charges the price and reveals the text on purchase", async () => {
    const started = await startPlay("Equipe Épsilon");
    const [card] = await getHints(started.team.team_id, started.session_token);

    const bought = await buyHint(started.team.team_id, card.id, started.session_token);
    expect(bought.hint.purchased).toBe(true);
    expect(bought.hint.text).toBeTruthy();
    expect(bought.credits_balance).toBe(started.team.credits_balance - card.cost);
  });

  it("answers 402 INSUFFICIENT_CREDITS when the team cannot afford it", async () => {
    const started = await startPlay("Equipe Zeta");
    const { team_id } = started.team;
    const token = started.session_token;

    // Burn the opening grant on the most expensive tool.
    for (let i = 0; i < 4; i += 1) {
      await investigate(team_id, `/challenge hipótese ${i} | person_01`, token);
    }

    const [card] = await getHints(team_id, token);
    const error = await buyHint(team_id, card.id, token).catch((err: unknown) => err);
    expect(isInsufficientCredits(error)).toBe(true);
  });
});

describe("guessing", () => {
  it("is locked until the final phase", async () => {
    const started = await startPlay("Equipe Eta");
    await expect(
      submitGuess(started.team.team_id, GROUND_TRUTH.coordinator, started.session_token),
    ).rejects.toMatchObject({ status: 409, body: { error: "GUESS_LOCKED" } });
  });

  it("gives three attempts and marks the suspect as already guessed", async () => {
    const { team_id, token } = await startAtFinalPhase("Equipe Teta");
    const suspects = await getSuspects(team_id, token);
    const wrong = suspects.find((s) => s.id !== GROUND_TRUTH.coordinator);
    if (!wrong) throw new Error("scenario has no wrong suspect to guess");

    const result = await submitGuess(team_id, wrong.id, token);
    expect(result.correct).toBe(false);
    expect(result.attempts_used).toBe(1);
    expect(result.attempts_remaining).toBe(2);
    expect(result.status).toBe("PLAYING");

    const after = await getSuspects(team_id, token);
    expect(after.find((s) => s.id === wrong.id)?.already_guessed).toBe(true);
  });

  it("solves the case and puts the team at the top of the ranking", async () => {
    const { team_id, token } = await startAtFinalPhase("Equipe Iota");

    const result = await submitGuess(team_id, GROUND_TRUTH.coordinator, token);
    expect(result.correct).toBe(true);
    expect(result.status).toBe("SOLVED");
    expect(result.score).toBeGreaterThan(0);

    const leaderboard = await getLeaderboard(MOCK_GAME_ID);
    expect(leaderboard[0].team_id).toBe(team_id);
    expect(leaderboard.every((row) => row.status !== "PLAYING" || row.score === 0)).toBe(true);
  });

  it("refuses an id that is not a suspect", async () => {
    const { team_id, token } = await startAtFinalPhase("Equipe Kappa");
    const error = await submitGuess(team_id, "device_01", token).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError<{ error: string }>).body.error).toBe("UNKNOWN_SUSPECT");
  });
});

describe("mock /inspect DSL", () => {
  it("charges 5 credits and returns person_01 in the subgraph", async () => {
    const started = await startPlay("Equipe Lambda");
    const result = await investigate(
      started.team.team_id,
      "/inspect person_01",
      started.session_token,
    );

    expect(result.plan.intent).toBe("ENTITY_LOOKUP");
    expect(result.plan.tool_calls[0]?.tool).toBe("inspect_entity");
    expect(result.credits_charged).toBe(5);
    expect(result.subgraph.nodes.map((n) => n.id)).toContain("person_01");
    expect(result.answer.discovered_node_ids).toContain("person_01");
  });
});
