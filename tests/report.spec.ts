import { expect, test } from "@playwright/test";
import { daySchema } from "../src/data";

test("architecture report works offline in narrow and desktop layouts", async ({
  page,
  request,
}) => {
  await page.goto("/docs/architecture-review.html");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Keep the grid story");
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `.local-run/report-${width}.png`, fullPage: true });
  }
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "useDashboardDay.ts" })).toBeFocused();
  const links = await page
    .locator("a")
    .evaluateAll((anchors) =>
      anchors.flatMap((anchor) => (anchor instanceof HTMLAnchorElement ? [anchor.href] : [])),
    );
  for (const link of links) expect((await request.get(link)).ok()).toBeTruthy();
});

test("real API provides validated intervals and live source states", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ status: "ok", service: "prad-polski-ocaml" });
  const response = await request.get("/api/v1/day");
  expect(response.ok()).toBeTruthy();
  const day = daySchema.parse(await response.json());
  expect([92, 96, 100]).toContain(day.points.length);
  expect(day.sources).toHaveLength(4);
  for (let index = 1; index < day.points.length; index++) {
    expect(day.points[index]?.start).toBe(day.points[index - 1]?.end);
  }
  await page.goto("/");
  await expect(page.locator(".stats-grid")).toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: `.local-run/dashboard-live-${width}.png`, fullPage: true });
  }
});
