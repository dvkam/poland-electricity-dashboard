import { expect, test } from "@playwright/test";
import { fixtureDay } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-25T12:00:00Z") });
});

for (const outcome of ["fresh", "failed"] as const) {
  test(`a pending source refresh delivers its ${outcome} result without a manual reload`, async ({
    page,
  }) => {
    const pending = fixtureDay();
    Object.assign(pending.sources[0]!, { cached: true, revalidating: true });
    const completed = fixtureDay();
    if (outcome === "failed") {
      Object.assign(completed.sources[0]!, {
        cached: true,
        error: "Upłynął czas na pobranie raportu.",
      });
    } else {
      completed.points.forEach((p) => {
        p.renewablePercent = 87;
      });
    }
    let waiting = false;
    let followups = 0;
    const release = Promise.withResolvers<void>();
    await page.route("**/api/v1/day?*", async (route) => {
      if (!waiting) return route.fulfill({ json: pending });
      followups++;
      await release.promise;
      await route.fulfill({ json: completed });
    });
    await page.goto("/");
    await expect(page.locator(".stats-grid")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "zgłasza problem" })).toHaveCount(0);
    waiting = true;
    await page.clock.fastForward(5_100);
    await expect.poll(() => followups).toBe(1);
    await page.clock.fastForward(35_000);
    expect(followups).toBe(1);
    release.resolve();
    if (outcome === "failed") {
      await expect(page.getByRole("status").filter({ hasText: "zgłasza problem" })).toBeVisible();
    } else {
      await expect(page.locator(".stats-grid")).toContainText("87");
    }
    await page.clock.fastForward(15_000);
    expect(followups).toBe(1);
    await page.clock.fastForward(300_000);
    await expect.poll(() => followups).toBe(2);
  });
}

test("changing date cancels the pending follow-up for the previous day", async ({ page }) => {
  let previousRequests = 0;
  let selectedRequests = 0;
  await page.route("**/api/v1/day?*", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date")!;
    const day = fixtureDay(date);
    if (date === "2026-10-25") {
      previousRequests++;
      Object.assign(day.sources[0]!, { cached: true, revalidating: true });
    } else {
      selectedRequests++;
    }
    return route.fulfill({ json: day });
  });
  await page.goto("/");
  await expect(page.locator(".stats-grid")).toBeVisible();
  const previousTotal = previousRequests;
  await page.getByLabel("Dzień danych").fill("2026-03-29");
  await expect(page.getByRole("slider", { name: "Wybierz kwadrans" })).toHaveAttribute("max", "91");
  const selectedTotal = selectedRequests;
  await page.clock.fastForward(15_000);
  expect(previousRequests).toBe(previousTotal);
  expect(selectedRequests).toBe(selectedTotal);
});
