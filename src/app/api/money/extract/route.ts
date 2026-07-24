import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { extractInvoiceFields } from "@/lib/money/invoice-extraction";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 5_000_000;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  try {
    const identity = await requireEmployeeIdentity();
    await requireApplicationPermission(identity, "money", "money.submit");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) return error("Choose an invoice PDF to continue.", 400);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return error("Invoice extraction currently supports PDF files.", 415);
    if (file.size === 0 || file.size > MAX_FILE_BYTES) return error("Choose a PDF smaller than 5 MB.", 413);

    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    if (totalPages > 20) return error("Choose an invoice with 20 pages or fewer.", 413);
    if (text.replace(/\s/g, "").length < 20) {
      return error("We couldn’t find readable text in this PDF. Try exporting the invoice as a text-based PDF.", 422);
    }

    return NextResponse.json({ fields: extractInvoiceFields(text, file.name) });
  } catch (cause) {
    console.error("Invoice extraction failed", cause);
    return error("We couldn’t read that invoice. Try another text-based PDF.", 422);
  }
}
