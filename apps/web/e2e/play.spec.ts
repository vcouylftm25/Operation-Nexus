import { expect, test } from "@playwright/test";

test("mock war room joins and investigates", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("OPERATION NEXUS")).toBeVisible();
  await page.getByTestId("mock-join-team").click();
  await expect(page.getByText("Equipe Alfa")).toBeVisible();
  await expect(page.getByText("Briefing de campo")).toBeVisible();
  await page.getByRole("button", { name: "Pular tutorial" }).click();
  await expect(page.getByText("Contexto relacional bloqueado")).toBeVisible();
  await page.getByRole("button", { name: /Marcos Duarte/ }).click();
  await expect(page.getByText("descoberto").first()).toBeVisible();
  await expect(page.getByText("Investigador")).toBeVisible();
  await page.getByPlaceholder(/Pergunte em português/).fill("/inspect person_01");
  await page.getByTestId("investigate-submit").click();
  await expect(page.getByText("Investigador").first()).toBeVisible();
  await expect(page.locator("body")).toContainText(/person_01|Marcos|crédito|conta|dispositivo/i);
});
