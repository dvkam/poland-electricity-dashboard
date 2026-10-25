import { expect, test } from "@playwright/test";
import { fixtureDay } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
  await page.route("**/api/v1/day?*", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date") ?? "2026-10-25";
    return route.fulfill({ json: fixtureDay(date) });
  });
});
test("shared selection, tariffs, source dialog and CSV work on a 25-hour day", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Skąd bierze się nasz prąd?" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Wybierz kwadrans" })).toBeVisible();
  const slider = page.getByRole("slider", { name: "Wybierz kwadrans" });
  await slider.fill("52");
  await expect(page.locator(".snapshot-heading")).toContainText("12:00–12:15");
  await expect(page.locator(".interval-label")).toHaveText("12:00–12:15 (UTC+1)");
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

for (const scenario of [
  { date: "2026-03-29", count: 92, noon: 44, offset: "UTC+2" },
  { date: "2026-09-14", count: 96, noon: 48, offset: "UTC+2" },
  { date: "2026-10-25", count: 100, noon: 52, offset: "UTC+1" },
]) {
  test(`${scenario.count} quarters preserve synchronized Warsaw noon`, async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Dzień danych").fill(scenario.date);
    const slider = page.getByRole("slider", { name: "Wybierz kwadrans" });
    await expect(slider).toHaveAttribute("max", String(scenario.count - 1));
    await slider.fill(String(scenario.noon));
    await expect(page.locator(".interval-label")).toHaveText(`12:00–12:15 (${scenario.offset})`);
    await expect(page.locator(".snapshot-heading")).toContainText(
      `12:00–12:15 (${scenario.offset})`,
    );
  });
}

test("repeated hours have distinct visible offsets", async ({ page }) => {
  await page.goto("/");
  const slider = page.getByRole("slider", { name: "Wybierz kwadrans" });
  await slider.fill("9");
  await expect(page.locator(".interval-label")).toHaveText("02:15–02:30 (UTC+2)");
  await slider.fill("13");
  await expect(page.locator(".interval-label")).toHaveText("02:15–02:30 (UTC+1)");
});

test("today follows midnight while a selected historical day stays put", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-24T21:59:50Z"));
  await page.goto("/");
  await expect(page.getByLabel("Dzień danych")).toHaveValue("2026-10-24");
  await page.clock.setFixedTime(new Date("2026-10-24T22:00:20Z"));
  await page.clock.runFor(30_000);
  await expect(page.getByLabel("Dzień danych")).toHaveValue("2026-10-25");
  await page.getByLabel("Dzień danych").fill("2026-09-14");
  await page.clock.setFixedTime(new Date("2026-10-25T23:01:00Z"));
  await page.clock.runFor(30_000);
  await expect(page.getByLabel("Dzień danych")).toHaveValue("2026-09-14");
});

test("failed date changes never relabel the previous day's measurements", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stats-grid")).toBeVisible();
  await page.route("**/api/v1/day?date=2026-09-14", (route) => route.fulfill({ status: 503 }));
  await page.getByLabel("Dzień danych").fill("2026-09-14");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator(".stats-grid")).toHaveCount(0);
});

test("mobile design remains readable at narrow widths", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".stats-grid")).toBeVisible();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await expect(page.locator(".snapshot-date")).toBeVisible();
  }
});
