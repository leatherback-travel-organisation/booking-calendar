import { after, NextResponse } from "next/server";
import { requireApplicationPermission, requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { findAppBuilderRequestById, listAppBuilderPublishingRequestIds, listAppBuilderTargets, listRecoverableAppBuilderResponses } from "@/lib/app-builder/server";
import { continueAppBuilderResponse, continueAppBuilderReversal, publishAppBuilderRequest } from "@/lib/app-builder/queue";

export async function POST() {
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "app-builder", "app_builder.read");
    const user = await requireCoveUser(identity);
    const targets = await listAppBuilderTargets(user);
    const executionAssetIds = [...new Set(targets.flatMap((target) => target.readiness === "ready" ? [target.executionAssetId] : []))];
    const [responseIds, publishingIds] = await Promise.all([
      listRecoverableAppBuilderResponses(executionAssetIds),
      listAppBuilderPublishingRequestIds(executionAssetIds),
    ]);
    after(async () => {
      for (const id of responseIds) await continueAppBuilderResponse(id, "reconcile");
      for (const id of publishingIds) {
        const request = await findAppBuilderRequestById(id);
        if (request?.status === "reversing") await continueAppBuilderReversal(id);
        else await publishAppBuilderRequest(id);
      }
    });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
}
