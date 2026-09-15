// Probe Google domain-wide delegation for the Calltime service account:
// requests a delegated calendar.readonly token for one BM and prints Google's
// exact answer. Prints no secrets — only the token endpoint's response body.
//
//   node scripts/probe-google-delegation.mjs [impersonated-email]
//
// "unauthorized_client" = the delegation entry in admin.google.com (client id
// 114308479214764617748) is missing, wrong, or not yet propagated.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

const envLine = readFileSync(`${process.cwd()}/.env.local`, "utf8")
  .split("\n")
  .find((line) => line.startsWith("GOOGLE_SA_KEY_B64="));
if (!envLine || envLine.trim() === "GOOGLE_SA_KEY_B64=") {
  console.error("GOOGLE_SA_KEY_B64 is not set in .env.local");
  process.exit(1);
}
const key = JSON.parse(Buffer.from(envLine.slice("GOOGLE_SA_KEY_B64=".length), "base64").toString("utf8"));

const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
const claims = Buffer.from(
  JSON.stringify({
    iss: key.client_email,
    sub: process.argv[2] ?? "nicola@leatherbacktravel.com",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 300,
  }),
).toString("base64url");
const signer = createSign("RSA-SHA256");
signer.update(`${header}.${claims}`);
const jwt = `${header}.${claims}.${signer.sign(key.private_key, "base64url")}`;

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
});
const body = await response.json();
console.log("status:", response.status);
console.log("service account:", key.client_email);
console.log(body.access_token ? "SUCCESS — delegated token issued" : `error: ${JSON.stringify(body)}`);
