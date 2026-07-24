import { z } from "zod";

export const DELEGATE_HANDOFF_PROTOCOL = "cove-delegate-handoff/v1";

export const delegateDirectory = {
  "nevena@leatherbacktravel.com": "Nevena Mihajlovic",
  "csilla@leatherbacktravel.com": "Csilla Bozsik",
} as const;

export type DelegateEmail = keyof typeof delegateDirectory;

export const delegateActivationSchema = z.object({
  action: z.literal("activate"),
  email: z.string().trim().toLowerCase().pipe(z.enum([
    "nevena@leatherbacktravel.com",
    "csilla@leatherbacktravel.com",
  ])),
  message: z.literal("LEATHERBACK DELEGATE ACTIVE"),
}).strict();

export const delegateMessageSchema = z.object({
  action: z.literal("message"),
  message: z.string().trim().min(1).max(4000),
}).strict();

export function bearerToken(header: string | null) {
  const match = header?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/);
  return match?.[1] ?? null;
}
