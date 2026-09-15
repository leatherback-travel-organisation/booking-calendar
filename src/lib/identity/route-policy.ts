export function isPublicIdentityRoute(pathname: string) {
  return (
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/patch-quiz" ||
    pathname.startsWith("/patch-quiz/") ||
    pathname === "/stitch-wednesday" ||
    pathname.startsWith("/stitch-wednesday/") ||
    pathname === "/ai-growth" ||
    pathname.startsWith("/ai-growth/") ||
    pathname === "/review-intelligence" ||
    pathname.startsWith("/review-intelligence/") ||
    pathname === "/people/apply" ||
    pathname.startsWith("/people/apply/") ||
    pathname === "/api/health" ||
    pathname === "/api/cove/access" ||
    pathname === "/api/cove/apps" ||
    pathname === "/api/cove/verify-handoff" ||
    pathname === "/api/delegate-handoff" ||
    pathname === "/api/app-builder/openai-webhook" ||
    pathname === "/api/app-builder/cron" ||
    pathname.startsWith("/api/app-icons/") ||
    // Leatherback Booking guest surfaces. Guests are anonymous by definition;
    // every route below is rate-limited and token- or Turnstile-gated in its
    // own handler rather than by Clerk.
    pathname === "/book" ||
    pathname.startsWith("/book/") ||
    pathname === "/manage" ||
    pathname.startsWith("/manage/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/") ||
    pathname === "/session" ||
    pathname.startsWith("/session/") ||
    pathname === "/embed.js" ||
    pathname.startsWith("/api/booking/public/") ||
    pathname === "/api/booking/widget" ||
    pathname.startsWith("/api/booking/cron/") ||
    // BM profile photos appear on public booking pages and in the guest
    // portal; the route serves images only.
    pathname.startsWith("/api/booking/staff-photo/") ||
    pathname.startsWith("/api/booking/brand-logo/") ||
    pathname.startsWith("/api/booking/brand-avatar/")
  );
}
