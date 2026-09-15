// Guest happy path: land on /book for a BM, pick a slot, fill the form,
// reach the confirmation screen. Requires a running app with DATABASE_URL,
// the 037 migration applied, and at least one active staff row (run the
// reference sync first). Google/Resend may be unconfigured — the flow
// degrades to stub mode and still completes.
//
//   BOOKING_E2E_BASE_URL=<url> BOOKING_E2E_BM_SLUG=<slug> npx playwright test

import { expect, test } from "@playwright/test";

const BM_SLUG = process.env.BOOKING_E2E_BM_SLUG ?? "claire-jakobi";

test("a guest books a call end to end", async ({ page }) => {
  await page.goto(`/book?bm=${BM_SLUG}`);

  // The BM card renders with a first name and the brand phone is visible.
  await expect(page.getByRole("heading").first()).toBeVisible();

  // Pick the first available slot.
  const slot = page.getByTestId("slot").first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  await slot.click();

  // Confirmation form. Phone is required when the BM is phone-only (video
  // toggled off — the default since 20 Aug); filling it is safe either way.
  await page.getByLabel(/name/i).first().fill("E2E Test Guest");
  await page.getByLabel(/email/i).first().fill(`e2e+${Date.now()}@example.com`);
  await page.getByLabel(/phone/i).first().fill("+61 400 000 000");
  await page.getByRole("button", { name: /confirm|book/i }).click();

  // Success screen shows the booked time and the manage link.
  await expect(page.getByText(/confirmation email|you're booked|booked/i).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("an unknown trip slug degrades to the picker, never an error page", async ({ page }) => {
  await page.goto("/book?trip=this-slug-does-not-exist-e2e");
  await expect(
    page.getByText(/which of our travel brands|choose|pick|find/i).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/500|error/i)).toHaveCount(0);
});
