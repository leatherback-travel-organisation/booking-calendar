import { after, NextResponse } from "next/server";
import { requireApplicationPermission, requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { listAppBuilderTargets } from "@/lib/app-builder/server";
import { reconcileAppBuilderWork } from "@/lib/app-builder/queue";

export async function POST() {
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "app-builder", "app_builder.read");
    const user = await requireCoveUser(identity);
    const targets = await listAppBuilderTargets(user);
    const executionAssetIds = [...new Set(targets.flatMap((target) => target.readiness === "ready" ? [target.executionAssetId] : []))];
    after(() => reconcileAppBuilderWork(executionAssetIds));
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
}
