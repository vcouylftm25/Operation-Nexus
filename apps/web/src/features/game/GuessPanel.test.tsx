import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuessPanel } from "@/features/game/GuessPanel";
import type { GuessResult, Suspect } from "@/lib/types";

const getSuspects = vi.fn<() => Promise<Suspect[]>>();
const submitGuess = vi.fn<() => Promise<GuessResult>>();

vi.mock("@/lib/client", () => ({
  api: {
    getSuspects: () => getSuspects(),
    submitGuess: () => submitGuess(),
  },
}));

const suspects: Suspect[] = [
  { id: "person_01", name: "Marcos Duarte", already_guessed: false },
  { id: "person_02", name: "Fernanda Lima", already_guessed: true },
];

function renderPanel(props: Partial<Parameters<typeof GuessPanel>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GuessPanel
        teamId="team-1"
        sessionToken="tok"
        currentPhase={3}
        finalPhase={3}
        status="PLAYING"
        attemptsUsed={0}
        startedAt={null}
        solvedAt={null}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("GuessPanel", () => {
  beforeEach(() => {
    getSuspects.mockReset().mockResolvedValue(suspects);
    submitGuess.mockReset();
  });

  it("explains why accusing is locked before the final phase instead of just hiding it", async () => {
    renderPanel({ currentPhase: 2 });

    expect(await screen.findByText(/precisam chegar à fase 3 para acusar/i)).toBeInTheDocument();
    expect(getSuspects).not.toHaveBeenCalled();
  });

  it("asks for a confirmation before spending an attempt and reports what is left", async () => {
    const user = userEvent.setup();
    submitGuess.mockResolvedValue({
      correct: false,
      attempts_used: 1,
      attempts_remaining: 2,
      status: "PLAYING",
      elapsed_seconds: 300,
      score: 0,
    });
    renderPanel();

    expect(await screen.findByTestId("attempts-remaining")).toHaveTextContent("3 de 3");

    await user.click(await screen.findByRole("button", { name: "Marcos Duarte" }));
    expect(screen.getByText(/gasta uma das 3 tentativas/i)).toBeInTheDocument();
    expect(submitGuess).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("confirm-guess"));
    await waitFor(() => expect(submitGuess).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Restam 2 tentativas/i)).toBeInTheDocument();
  });

  it("locks a name the team already burned an attempt on", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: "Fernanda Lima" })).toBeDisabled();
  });

  it("closes the run with the score and the elapsed time once solved", () => {
    renderPanel({
      status: "SOLVED",
      attemptsUsed: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
      solvedAt: "2026-01-01T00:21:40.000Z",
    });

    expect(screen.getByText(/acertaram quem coordenou/i)).toBeInTheDocument();
    expect(screen.getByText("21:40 de investigação")).toBeInTheDocument();
  });

  it("shows a closing state when the attempts run out", () => {
    renderPanel({ status: "FAILED", attemptsUsed: 3 });
    expect(screen.getByText(/três tentativas acabaram/i)).toBeInTheDocument();
  });
});
