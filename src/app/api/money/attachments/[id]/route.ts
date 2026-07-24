import { Buffer } from "node:buffer";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { getMoneyAttachment } from "@/lib/money/server";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await requireEmployeeIdentity();
  const { id } = await context.params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const attachment = await getMoneyAttachment(id);
  if (!attachment) return new Response("Not found", { status: 404 });
  if (attachment.employee_email.toLowerCase() !== identity.email.toLowerCase()) {
    await requireApplicationPermission(identity, "money", "money.review");
  }

  const safeName = attachment.attachment_name.replace(/[\r\n"\\/]/g, "_").slice(0, 180);
  return new Response(Buffer.from(attachment.attachment_base64, "base64"), {
    headers: {
      "Content-Type": attachment.attachment_content_type,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
