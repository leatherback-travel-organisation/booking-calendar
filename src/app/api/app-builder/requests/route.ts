import { after, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { requireApplicationPermission, requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { APP_BUILDER_MAX_PDF_BYTES, validPdfUpload } from "@/lib/app-builder/model";
import { appBuilderEngineConfigured, createAppBuilderRequest, inspectAppBuilderBriefBlob, listAppBuilderTargets } from "@/lib/app-builder/server";
import { kickAppBuilderQueue } from "@/lib/app-builder/queue";

export const runtime = "nodejs";

function json(error: string, status: number) { return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const startedAt = Date.now();
  let cleanupBlobUrl = "";
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "app-builder", "app_builder.submit");
    const user = await requireCoveUser(identity);
    if (!appBuilderEngineConfigured()) return json("App Builder's AI connection is still being configured.", 503);
    const body = await request.json() as { targetId?: unknown; notes?: unknown; blobUrl?: unknown; filename?: unknown };
    const targetId = typeof body.targetId === "string" ? body.targetId : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : "";
    const blobUrl = typeof body.blobUrl === "string" ? body.blobUrl : "";
    const filename = typeof body.filename === "string" ? body.filename.slice(0, 180) : "";
    const target = (await listAppBuilderTargets(user)).find((item) => item.id === targetId);
    if (!target) return json("You are not an administrator for this app.", 403);
    if (target.readiness !== "ready") return json("This app needs a connected build source before Cove can prepare changes.", 409);
    if (!blobUrl || !filename) return json("Choose a PDF to continue.", 400);
    cleanupBlobUrl = blobUrl;
    const inspected = await inspectAppBuilderBriefBlob(blobUrl);
    if (inspected.byteSize > APP_BUILDER_MAX_PDF_BYTES) {
      await del(blobUrl).catch(() => undefined); cleanupBlobUrl = "";
      return json("Choose a PDF no larger than 200 MB.", 413);
    }
    const problem = validPdfUpload({ name: filename, type: inspected.contentType, size: inspected.byteSize, signature: inspected.signature });
    if (problem) {
      await del(blobUrl).catch(() => undefined); cleanupBlobUrl = "";
      return json(problem, 415);
    }
    const created = await createAppBuilderRequest({ user, target, filename, notes, blobUrl, byteSize: inspected.byteSize, pdfSha256: inspected.pdfSha256 });
    cleanupBlobUrl = "";
    after(() => kickAppBuilderQueue(target.executionAssetId));
    console.info("[app-builder] upload accepted", { requestId: created.id, target: target.slug, bytes: inspected.byteSize, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, id: created.id }, { status: 202 });
  } catch (error) {
    console.error("[app-builder] upload failed", { durationMs: Date.now() - startedAt, error });
    if (cleanupBlobUrl) await del(cleanupBlobUrl).catch(() => undefined);
    return json("The request could not be started. Nothing was changed.", 500);
  }
}
