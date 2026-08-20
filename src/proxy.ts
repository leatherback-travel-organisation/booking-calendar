import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { canonicalProductionUrl } from "@/lib/identity/canonical-origin";
import { isPreviewIdentityEnabled } from "@/lib/identity/mode";
import { isPublicIdentityRoute } from "@/lib/identity/route-policy";

const withClerk = clerkMiddleware(async (auth, request) => {
  const pathname = request.nextUrl.pathname;
  if (isPublicIdentityRoute(pathname)) return;

  const session = await auth();
  if (!session.userId) {
    return session.redirectToSignIn({ returnBackUrl: request.url });
  }
});

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Vercel cron invocations arrive on the deployment host, never the
  // canonical domain — a 308 here means the job "succeeds" without ever
  // running (this silently killed every cron in production). Cron routes
  // authenticate with CRON_SECRET in their own handlers; host is moot.
  const pathname = request.nextUrl.pathname;
  const isCronPath = pathname.startsWith("/api/booking/cron/") || pathname === "/api/app-builder/cron";
  if (!isCronPath) {
    const canonicalTarget = canonicalProductionUrl(request.url);
    if (canonicalTarget) return NextResponse.redirect(canonicalTarget, 308);
  }

  if (isPreviewIdentityEnabled()) return NextResponse.next();

  if (!process.env.CLERK_SECRET_KEY || !process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    if (isPublicIdentityRoute(request.nextUrl.pathname)) return NextResponse.next();
    const target = request.nextUrl.clone();
    target.pathname = "/sign-in";
    target.searchParams.set("configuration", "missing");
    return NextResponse.redirect(target);
  }

  return withClerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
    "/(api)(.*)"
  ]
};
