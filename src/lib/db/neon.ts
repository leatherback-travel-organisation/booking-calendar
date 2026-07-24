import "server-only";

import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function databaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql(): NeonQueryFunction<false, false> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");
  if (!client) {
    // Do not attach a one-shot AbortSignal to this singleton. Once that signal
    // expires, every later query in the warm serverless function is aborted.
    client = neon(databaseUrl);
  }
  return client;
}
