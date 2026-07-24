import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { createMoneyRequest } from "@/lib/money/server";
import type { NewMoneyRequest } from "@/lib/money/model";
import { validateNewMoneyRequest } from "@/lib/money/validation";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5_000_000;
const ALLOWED_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item : "";
}

export async function POST(request: Request) {
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "money", "money.submit");
    const formData = await request.formData();
    const kind = value(formData, "kind") as NewMoneyRequest["kind"];
    const file = formData.get("file");
    if (kind !== "travel_credit" && !(file instanceof File)) return error("Attach the invoice or receipt before submitting.", 400);
    if (file instanceof File && (!ALLOWED_TYPES.has(file.type) || file.size === 0 || file.size > MAX_FILE_BYTES)) return error("Attach a PDF, JPG, or PNG smaller than 5 MB.", 400);

    const input = validateNewMoneyRequest({
      kind,
      title: value(formData, "title"),
      description: value(formData, "description"),
      amount: Number(value(formData, "amount")),
      currency: value(formData, "currency"),
      counterparty: value(formData, "counterparty"),
      category: value(formData, "category"),
      transactionDate: value(formData, "transactionDate"),
      dueDate: value(formData, "dueDate"),
      invoiceNumber: value(formData, "invoiceNumber"),
    });
    const attachment = file instanceof File ? {
      filename: file.name.slice(0, 180),
      contentType: file.type,
      base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    } : undefined;
    const result = await createMoneyRequest(input, { name: identity.displayName, email: identity.email }, attachment);
    return NextResponse.json(result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "This request could not be submitted.";
    console.error("Money submission failed", cause);
    return error(message, 400);
  }
}
