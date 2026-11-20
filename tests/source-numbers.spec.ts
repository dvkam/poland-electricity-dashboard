import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";

// Energy-Charts and PSE records for 20:00 Warsaw time, 25 October 2026.
// The only intercepted boundary is HTTP delivery of the real backend response.
test("renders the published storage interval and PSE readings", async ({ page }) => {
  const args = ["./_build/default/test/replay_day.exe", "2026-10-25", "../tests/source-records"];
  const windows = process.platform === "win32";
  const body = execFileSync(
    windows ? "wsl.exe" : args[0]!,
    windows ? ["-d", "Ubuntu-24.04", "--exec", ...args] : args.slice(1),
    { cwd: "backend", encoding: "utf8" },
  );
  await page.clock.install({ time: new Date("2026-10-25T21:00:00Z") });
  await page.route("**/api/v1/day?*", (route) =>
    route.fulfill({ contentType: "application/json", body }),
  );
  await page.goto("/");
  await expect(page.locator(".stats-grid")).toContainText("Raportowana produkcja netto");
  await expect(page.locator(".stats-grid")).toContainText("Produkcja publiczna · Energy-Charts");
  const values = page.locator(".stat-value");
  await expect(values).toHaveText(["18,22GW", "18,40GW", "41,8%", "523,01zł/MWh"]);
  await expect(page.locator(".flow-summary")).toContainText("0,15");
  await expect(page.locator(".flow-summary")).toContainText("eksport netto");
  await expect(page.locator(".guidance")).toContainText("Zwykłe korzystanie");
  await expect(page.locator(".interval-label")).toContainText("20:00–20:15");
});
