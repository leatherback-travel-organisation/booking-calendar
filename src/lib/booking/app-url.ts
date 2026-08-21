// The public origin every guest-facing link is built from.
//
// This has one job and lives on its own because it used to be copy-pasted:
// three of the internal pages defaulted to localhost, so with
// NEXT_PUBLIC_APP_URL unset in production every "Copy link" button handed
// staff a http://localhost:3000 URL that opened nothing for the guest.
// The fallback is the production host — dev sets the var in .env.local.
export function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://cove.leatherbacktravel.com";
}
