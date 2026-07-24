const HTML_ENTITY_PATTERN = /&(?:amp|quot|#39|lt|gt);/gi;

function decodeHtmlAttribute(value: string) {
  return value.replace(HTML_ENTITY_PATTERN, (entity) => {
    switch (entity.toLowerCase()) {
      case "&amp;": return "&";
      case "&quot;": return '"';
      case "&#39;": return "'";
      case "&lt;": return "<";
      case "&gt;": return ">";
      default: return entity;
    }
  });
}

function attributesFromTag(tag: string) {
  const attributes = new Map<string, string>();
  const pattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(match[1].toLowerCase(), decodeHtmlAttribute(match[2] ?? match[3] ?? match[4] ?? ""));
  }
  return attributes;
}

export function extractFaviconUrls(html: string, pageUrl: string): readonly string[] {
  const results: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = attributesFromTag(match[0]);
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
    const href = attributes.get("href");
    if (!href || !rel.some((value) => value === "icon" || value === "shortcut" || value === "apple-touch-icon")) continue;

    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.protocol !== "https:" || resolved.username || resolved.password) continue;
      resolved.hash = "";
      const value = resolved.toString();
      if (!seen.has(value)) {
        seen.add(value);
        results.push(value);
      }
    } catch {
      // Ignore malformed icon declarations and try the conventional favicon.
    }
  }

  return results;
}

export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateNetworkAddress(normalized.slice(7));

  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

export function obviousUnsafeFaviconHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, "");
  return (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal") ||
    isPrivateNetworkAddress(normalized)
  );
}

export function sniffFaviconContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && new TextDecoder().decode(bytes.slice(0, 6)).match(/^GIF8[79]a$/)) return "image/gif";
  if (bytes.length >= 12) {
    const header = new TextDecoder().decode(bytes.slice(0, 12));
    if (header.startsWith("RIFF") && header.slice(8) === "WEBP") return "image/webp";
  }
  if (bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) return "image/x-icon";

  const start = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 512))).trimStart().toLowerCase();
  if (start.startsWith("<svg") || (start.startsWith("<?xml") && start.includes("<svg"))) return "image/svg+xml";
  return null;
}
