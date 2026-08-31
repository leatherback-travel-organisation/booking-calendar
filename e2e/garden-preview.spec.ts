import { expect, test } from "@playwright/test";

// Garden preview-mode walkthrough. Runs against a preview-identity server:
// BOOKING_E2E_BASE_URL=http://localhost:3005 npx playwright test e2e/garden-preview.spec.ts

test("garden dashboard renders seed data with attention, overlaps and stages", async ({ page }) => {
  await page.goto("/garden");
  await expect(page.getByRole("heading", { name: "The Garden", level: 1 })).toBeVisible();
  await expect(page.getByText("Needs your attention")).toBeVisible();
  await expect(page.getByText("Worth a conversation")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Active work/ })).toBeVisible();
});

test("search and filters narrow the garden and reset cleanly", async ({ page }) => {
  await page.goto("/garden");
  await page.getByPlaceholder("Search projects…").fill("Mailvio");
  await expect(page.getByRole("heading", { name: "Mailvio rollout - migrate other brands onto Mailvio", level: 3 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Guest Portal", level: 3 })).toHaveCount(0);

  await page.getByLabel("Filter by team").selectOption("Trip Design");
  await expect(page.getByText("No projects match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(page.getByRole("heading", { name: "Guest Portal", level: 3 })).toBeVisible();
});

test("project drawer opens with editable fields and last-modified metadata", async ({ page }) => {
  await page.goto("/garden");
  await page.getByRole("heading", { name: "Trip Summaries", level: 3 }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Trip Summaries" })).toBeVisible();
  await expect(drawer.getByText(/Last modified:/)).toBeVisible();
  await expect(drawer.getByText(/Both change Stacker/).first()).toBeVisible();
  await expect(drawer.getByLabel("Purpose")).toHaveValue(/Notion into Stacker/);

  // Inline stage change persists in the tab (demo mode) and stamps the editor.
  await drawer.getByLabel("Growth stage").selectOption("Testing or roll out");
  await expect(drawer.getByText("Testing/Feedback owners")).toBeVisible();
  await expect(page.getByText("Demonstration data — changes stay in this tab only.")).toBeVisible();
});

test("cancelled project shows red acknowledgement state and Got it settles it for the viewer", async ({ page }) => {
  await page.goto("/garden");
  await page.getByRole("heading", { name: "Online Booking Portal", level: 3 }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("This project has been cancelled or replaced.")).toBeVisible();
  await expect(drawer.getByText("Functionality incorporated into Guest Portal.").first()).toBeVisible();
});

test("create project flow validates required fields and plants a project", async ({ page }) => {
  await page.goto("/garden");
  await page.getByRole("button", { name: "Create Project" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Plant project" }).click();
  await expect(drawer.getByText("Give the project a name.")).toBeVisible();

  await drawer.getByLabel("Project name").fill("E2E Compost Rollout");
  await drawer.getByLabel("Purpose").fill("Verify the create flow end to end.");
  await drawer.getByLabel("Owner").selectOption({ index: 1 });
  await drawer.getByLabel("Leadership sponsor").selectOption({ index: 2 });
  await drawer.getByRole("button", { name: "Plant project" }).click();
  await expect(drawer.getByText("Pick an estimated completion date.")).toBeVisible();
  await drawer.getByLabel("Estimated completion").fill("2026-12-01");
  await drawer.getByRole("button", { name: "Plant project" }).click();
  await expect(drawer.getByText("Pick at least one team impacted.")).toBeVisible();
  await drawer.getByText("Operations", { exact: true }).click();
  await drawer.getByRole("button", { name: "Plant project" }).click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "E2E Compost Rollout", level: 3 })).toBeVisible();
});

test("archive holds completed and cancelled work with reasons", async ({ page }) => {
  await page.goto("/garden");
  await page.getByRole("tab", { name: /Archive/ }).click();
  await expect(page.getByRole("heading", { name: "Exploring Web Design Capabilities", level: 3 })).toBeVisible();
  await expect(page.getByText("Superseded by the Automations Index project.")).toBeVisible();
});
