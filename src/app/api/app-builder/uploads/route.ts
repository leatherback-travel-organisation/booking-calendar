import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireApplicationPermission, requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { APP_BUILDER_MAX_PDF_BYTES } from "@/lib/app-builder/model";
import { listAppBuilderTargets } from "@/lib/app-builder/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as HandleUploadBody;
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const identity = await requireEmployeeIdentity();
        await requireApplicationPermission(identity, "app-builder", "app_builder.submit");
        const user = await requireCoveUser(identity);
        const payload = JSON.parse(clientPayload ?? "{}") as { targetId?: unknown };
        const targetId = typeof payload.targetId === "string" ? payload.targetId : "";
        const target = (await listAppBuilderTargets(user)).find((item) => item.id === targetId);
        if (!target) throw new Error("You are not an administrator for this app.");
        if (target.readiness !== "ready") throw new Error("This app needs a connected build source.");
        if (!/^app-builder\/[0-9a-f-]{36}\.pdf$/i.test(pathname)) throw new Error("Choose a PDF brief to continue.");
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: APP_BUILDER_MAX_PDF_BYTES,
          addRandomSuffix: true,
          allowOverwrite: false,
          cacheControlMaxAge: 60,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "The upload could not be authorized.";
    return NextResponse.json({ error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
