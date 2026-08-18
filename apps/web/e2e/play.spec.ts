import { expect, test } from "@playwright/test";

test("mock war room joins and investigates", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("OPERATION NEXUS")).toBeVisible();
  await page.getByTestId("mock-join-team").click();
  await expect(page.getByText("Equipe Alfa")).toBeVisible();
  await expect(page.getByText("Investigador")).toBeVisible();
  await page.getByRole("button", { name: /Inspecionar/ }).click();
  await page.getByRole("button", { name: "Investigar" }).click();
  await expect(page.getByText("Investigador").first()).toBeVisible();
  await expect(page.locator("body")).toContainText(/person_01|Marcos|crédito|conta|dispositivo/i);
});
