import { after, NextResponse } from "next/server";
import { requireApplicationPermission, requireCoveUser } from "@/lib/access/server";
import { reverseAppBuilderRequest } from "@/lib/app-builder/queue";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "app-builder", "app_builder.configure");
    const user = await requireCoveUser(identity);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    after(() => reverseAppBuilderRequest(id, user.id));
    return NextResponse.json({ ok: true }, { status: 202 });
  } catch (error) {
    console.error("[app-builder] reversal failed", error);
    return NextResponse.json({ error: "The change could not be reversed. The published version remains live." }, { status: 500 });
  }
}
