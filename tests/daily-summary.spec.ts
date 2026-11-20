import { expect, test } from "@playwright/test";
import { fixtureDay } from "./fixtures";

test("daily summaries report eligible time and open the chosen repeated hour", async ({ page }) => {
  const day = fixtureDay();
  for (const [index, point] of day.points.entries()) {
    point.renewablePercent = index === 8 || index === 12 ? 25 : null;
    point.rcePlnMwh = index === 8 || index === 12 ? -15 : null;
  }
  await page.clock.install({ time: new Date("2026-10-25T22:59:00Z") });
  await page.route("**/api/v1/day?*", (route) => route.fulfill({ json: day }));
  await page.goto("/");
  const renewables = page.getByRole("article").filter({ hasText: "UDZIAŁ ODNAWIALNYCH" });
  await expect(renewables).toContainText("0,5 z 25 godz.");
  const prices = page.getByRole("article").filter({ hasText: "MINIMUM RYNKOWE" });
  await expect(prices).toContainText("-15,00 zł/MWh");
  await prices.getByText("Przedziały z minimum (2)").click();
  await expect(prices.getByRole("button", { name: "02:00–02:15 (UTC+2)" })).toBeVisible();
  await prices.getByRole("button", { name: "02:00–02:15 (UTC+1)" }).click();
  await expect(page.locator("#price-heading")).toBeFocused();
  await expect(page.locator("#timeline-slider")).toHaveValue("12");
  await expect(page.locator(".snapshot-heading")).toContainText("02:00–02:15 (UTC+1)");
  const overview = page.getByText("Dostępność danych w ciągu dnia", { exact: true });
  await overview.click();
  const rce = page
    .locator(".coverage-feed")
    .filter({ has: page.getByRole("heading", { name: "Cena RCE" }) });
  await expect(rce).toContainText("0,5 z 25 godz.");
  await expect(rce).toContainText("02:15 UTC+2–02:00 UTC+1");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test("an hourly source contributes once and only after its measurement ends", async ({ page }) => {
  const day = fixtureDay("2026-03-29");
  for (const [index, point] of day.points.entries()) {
    point.generationStart = day.points[index - (index % 4)]!.start;
    point.generationEnd = day.points[index - (index % 4) + 3]!.end;
    point.generation.solar = index < 4 ? 0 : 500;
  }
  await page.clock.install({ time: new Date("2026-03-29T00:45:00Z") });
  await page.route("**/api/v1/day?*", (route) => route.fulfill({ json: day }));
  await page.goto("/");
  const solar = page.getByRole("article").filter({ hasText: "SŁONECZNE MAKSIMUM" });
  await expect(solar).toContainText("0,00 GW ze słońca");
  await expect(solar).toContainText("1 z 23 godz.");
  const link = solar.getByRole("button", { name: "00:00–01:00 (UTC+1)" });
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#timeline-slider")).toBeFocused();
  await expect(page.locator("#timeline-slider")).toHaveValue("0");
  await expect(page.locator(".interval-label")).toHaveText(
    "Średnia godzinowa · 00:00–01:00 (UTC+1)",
  );
});
