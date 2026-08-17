import { defineConfig } from "@playwright/test";

// Booking-app e2e. Runs against a deployed preview (or local dev with a real
// DATABASE_URL): BOOKING_E2E_BASE_URL=https://<preview>.vercel.app npx playwright test
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.BOOKING_E2E_BASE_URL ?? "http://localhost:3000",
  },
});
