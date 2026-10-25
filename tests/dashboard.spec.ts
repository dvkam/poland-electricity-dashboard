import { expect, test } from "@playwright/test";
test("real OCaml API drives the dashboard and shared selection", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  expect(await health.json()).toMatchObject({
    status: "ok",
    service: "prad-polski-ocaml",
    ocaml: "5.5.0",
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Skąd bierze się nasz prąd?" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Wybierz kwadrans" })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Wybierz kwadrans" });
  await slider.fill("48");
  await expect(page.locator(".snapshot-heading")).toContainText("12:00–12:15");
  await expect(page.locator(".interval-label")).toHaveText("12:00–12:15");
  await page.getByRole("button", { name: "Stała · G11", exact: true }).click();
  await expect(page.locator(".tariff-explanation")).toContainText("zwykle nie obniża kosztu");
  await page.getByRole("button", { name: "Dynamiczna", exact: true }).click();
  await expect(page.locator(".tariff-explanation")).toContainText("innego indeksu niż RCE");
  await page.getByRole("button", { name: "Dane i metodologia", exact: false }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Ostatnie skuteczne pobranie");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Pobierz CSV" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^prad-polski-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(errors).toEqual([]);
});
test("mobile layout does not overflow and source panel stays usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Skąd bierze się nasz prąd?" })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await page.getByRole("button", { name: "Dane i metodologia", exact: false }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Zamknij panel źródeł" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("invalid dates are rejected by the backend", async ({ request }) => {
  const response = await request.get("/api/v1/day?date=2026-02-30");
  expect(response.status()).toBe(400);
});
test("API failure has an honest retry state", async ({ page }) => {
  await page.route("**/api/v1/day?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"unavailable"}',
    }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Nie udało się odświeżyć");
  await expect(page.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
  await expect(page.locator(".stats-grid")).toHaveCount(0);
});
