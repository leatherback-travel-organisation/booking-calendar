import { after, NextResponse } from "next/server";
import { requireApplicationPermission, requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { APP_BUILDER_MAX_PDF_BYTES, validPdfUpload } from "@/lib/app-builder/model";
import { appBuilderEngineConfigured, createAppBuilderRequest, listAppBuilderTargets } from "@/lib/app-builder/server";
import { kickAppBuilderQueue } from "@/lib/app-builder/queue";

export const runtime = "nodejs";

function json(error: string, status: number) { return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } }); }

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "app-builder", "app_builder.submit");
    const user = await requireCoveUser(identity);
    if (!appBuilderEngineConfigured()) return json("App Builder's AI connection is still being configured.", 503);
    const form = await request.formData();
    const targetId = String(form.get("targetId") ?? "");
    const notes = String(form.get("notes") ?? "").trim().slice(0, 2000);
    const file = form.get("pdf");
    const target = (await listAppBuilderTargets(user)).find((item) => item.id === targetId);
    if (!target) return json("You are not an administrator for this app.", 403);
    if (target.readiness !== "ready") return json("This app needs a connected build source before Cove can prepare changes.", 409);
    if (!(file instanceof File)) return json("Choose a PDF to continue.", 400);
    if (file.size > APP_BUILDER_MAX_PDF_BYTES) return json("Choose a PDF no larger than 4 MB.", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const problem = validPdfUpload({ name: file.name, type: file.type, size: file.size, signature: bytes.slice(0, 5) });
    if (problem) return json(problem, 415);
    const created = await createAppBuilderRequest({ user, target, filename: file.name, notes, pdf: bytes });
    after(() => kickAppBuilderQueue(target.executionAssetId));
    console.info("[app-builder] upload accepted", { requestId: created.id, target: target.slug, bytes: file.size, durationMs: Date.now() - startedAt });
    return NextResponse.json({ ok: true, id: created.id }, { status: 202 });
  } catch (error) {
    console.error("[app-builder] upload failed", { durationMs: Date.now() - startedAt, error });
    return json("The request could not be started. Nothing was changed.", 500);
  }
}
