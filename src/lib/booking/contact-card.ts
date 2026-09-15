// A brand's contact card (vCard 3.0), for the "save our number" button on
// the booking confirmation (Nicola, 15 Sep): a guest who has the number
// saved does not take the Booking Manager's call for spam. Pure, so the
// exact text is testable; the route only adds headers.
//
// vCard 3.0 rather than 4.0 because iOS and Android both open it straight
// into "add contact" with every field filled, and 4.0 support is patchier.

export type ContactCardInput = {
  name: string;
  email: string | null;
  /** In the order to show them; the first is the main number. */
  phones: Array<{ label: string; number: string }>;
  website: string | null;
  photoUrl: string | null;
  note: string | null;
};

/** Escape a vCard text value: backslash, comma, semicolon, newline. */
export function escapeVCardText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\;").replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets, per RFC 2426 (continuation = one space). */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, "utf8");
    if (bytes + size > 75) {
      out.push(current);
      current = " ";
      bytes = 1;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n");
}

export function buildContactCard(input: ContactCardInput): string {
  const name = escapeVCardText(input.name.trim());
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `N:;${name};;;`, `ORG:${name}`];
  for (const phone of input.phones) {
    const number = phone.number.replace(/[^\d+]/g, "");
    if (!number) continue;
    lines.push(`TEL;TYPE=${phone.label === "main" ? "WORK,VOICE,PREF" : "WORK,VOICE"}:${number}`);
  }
  if (input.email?.trim()) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVCardText(input.email.trim())}`);
  if (input.website?.trim()) lines.push(`URL:${escapeVCardText(input.website.trim())}`);
  if (input.photoUrl?.trim()) lines.push(`PHOTO;VALUE=URI:${input.photoUrl.trim()}`);
  if (input.note?.trim()) lines.push(`NOTE:${escapeVCardText(input.note.trim())}`);
  lines.push("END:VCARD");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A safe download file name: "Harriet Adventures.vcf". */
export function contactCardFileName(name: string): string {
  const clean = name.replace(/[^\w\- ]+/g, "").trim() || "contact";
  return `${clean}.vcf`;
}
