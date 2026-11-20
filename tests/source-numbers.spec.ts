import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

// Energy-Charts and PSE records for 20:00 Warsaw time, 25 October 2026.
// The only intercepted boundary is HTTP delivery of the real backend response.
test("renders the published storage interval and PSE readings", async ({ page }) => {
  const args = ["./_build/default/test/replay_day.exe", "2026-10-25", "../tests/source-records"];
  const windows = process.platform === "win32";
  const body = execFileSync(
    windows ? "wsl.exe" : args[0]!,
    windows
      ? ["-d", process.env["WSL_DISTRO"] ?? "Ubuntu-24.04", "--exec", ...args]
      : args.slice(1),
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
  await page.getByText("Tabela przepływów na granicach").click();
  const table = page.getByRole("table", { name: /Saldo dla Polski/ });
  await expect(table.getByRole("row", { name: /Niemcy/ })).toHaveText(/Niemcy\+1866,5Import/);
  await expect(table.getByRole("row", { name: /Czechy/ })).toHaveText(/Czechy-1498,4Eksport/);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Pobierz CSV/ }).click();
  const csv = await readFile((await (await download).path())!, "utf8");
  // Archived fixture endpoints and status messages contain no CSV delimiters.
  const [heading, ...records] = csv.trimEnd().split(/\r?\n/);
  const names = heading!.split(",");
  const found = records.find((line) => line.startsWith("2026-10-25T19:00:00Z,"));
  expect(records).toHaveLength(100);
  expect(found).toBeDefined();
  const cells = found!.split(",");
  const row = Object.fromEntries(names.map((name, i) => [name, cells[i]]));
  expect(row).toMatchObject({
    generation_interval_minutes: "15",
    generation_coal_mw: "5336.2",
    generation_solar_mw: "0",
    DE_net_import_mw: "1866.5",
    DE_export_mw: "0",
    CZ_net_import_mw: "-1498.4",
    CZ_import_mw: "0",
    CZ_export_mw: "1498.4",
    DE_import_published_at_utc: "2026-10-26T00:18:12.403Z",
    CZ_export_published_at_utc: "2026-10-26T00:18:12.403Z",
    price_published_at_utc: "2026-10-24T12:09:21.062Z",
    guidance_published_at_utc: "2026-10-25T21:35:03.542Z",
    generation_provider_generated_at_utc: "2026-10-26T22:57:29Z",
    generation_fetched_at_utc: "",
    guidance_code: "1",
  });
});
