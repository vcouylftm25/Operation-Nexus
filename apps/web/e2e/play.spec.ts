import { expect, test } from "@playwright/test";

test("a team starts, investigates and walks to the accusation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "OPERATION NEXUS" })).toBeVisible();

  await page.getByTestId("team-name-input").fill("Equipe Alfa");
  await page.getByTestId("start-play").click();

  await page.getByRole("button", { name: "Pular tutorial" }).click();
  await expect(page.getByText("FASE 1 DE 3")).toBeVisible();

  // Phase 1 has no relationships at all — the canvas must say so instead of
  // looking broken.
  await expect(page.getByText("A rede ainda não apareceu.")).toBeVisible();
  await expect(page.getByTestId("guess-panel")).toContainText("fase 3 para acusar");

  // Opening a case file selects it, so the Inspector takes over the rail.
  await page.getByRole("button", { name: /Marcos Duarte/ }).click();
  await expect(page.getByTestId("graph-inspector")).toContainText("Consultor financeiro");
  await page.getByTestId("classify-uncertain").click();
  await expect(page.getByTestId("board-count-uncertain")).toHaveText("1");
  await page.getByTestId("close-inspector").click();

  await page.getByRole("tab", { name: "Dicas" }).click();
  await page.getByRole("button", { name: /Revelar por \d+ créditos/ }).first().click();
  await expect(page.getByText(/Cada ficha tem duas camadas|Score de crédito mede/)).toBeVisible();

  for (let phase = 1; phase <= 2; phase += 1) {
    await page.getByTestId("advance-phase").click();
    await page.getByTestId("advance-phase-confirm").click();
    await expect(page.getByText(`FASE ${phase + 1} DE 3`)).toBeVisible();
  }

  await expect(page.getByTestId("advance-phase")).toHaveCount(0);
  await expect(page.getByTestId("attempts-remaining")).toHaveText("3 de 3");

  await page.getByRole("button", { name: "Fernanda Lima", exact: true }).click();
  await page.getByTestId("confirm-guess").click();
  await expect(page.getByTestId("guess-panel")).toContainText(/Restam \d tentativas|acertaram/);
});
