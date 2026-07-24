import { getSql } from "@/lib/db/neon";
import { applicationFaviconOverride } from "@/lib/telemetry/favicon-overrides";
import { downloadApplicationFavicon } from "@/lib/telemetry/favicon-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_CACHE = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";

type ApplicationRow = { slug: string; name: string; launch_url: string };

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  if (!UUID.test(applicationId)) return notFound();

  try {
    const rows = await getSql()`select slug, name, launch_url
      from applications
      where id = ${applicationId}::uuid and status = 'active'
      limit 1` as ApplicationRow[];
    const application = rows[0];
    if (!application) return notFound();

    const favicon = applicationFaviconOverride({
      slug: application.slug,
      name: application.name,
      launchUrl: application.launch_url,
    }) ?? await downloadApplicationFavicon(application.launch_url);

    if (!favicon) {
      console.info("[app-icon] unavailable", { applicationId });
      return notFound();
    }

    console.info("[app-icon] delivered", { applicationId, contentType: favicon.contentType });
    const body = new ArrayBuffer(favicon.bytes.byteLength);
    new Uint8Array(body).set(favicon.bytes);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": favicon.contentType,
        "Cache-Control": PUBLIC_CACHE,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[app-icon] failed", {
      applicationId,
      message: error instanceof Error ? error.message : "Unknown favicon error",
    });
    return notFound();
  }
}
