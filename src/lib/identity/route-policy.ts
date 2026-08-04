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
    pathname.startsWith("/api/app-icons/")
  );
}
