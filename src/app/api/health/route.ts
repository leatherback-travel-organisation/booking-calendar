import { NextResponse } from "next/server";
import { getDirectory } from "@/lib/airtable/server";
import { identityMode } from "@/lib/identity/server";
import { getRecruitmentCoverage } from "@/lib/recruitment/server";
import { databaseConfigured, getSql } from "@/lib/db/neon";
import {
  postgresAccessDirectoryHealthy,
  postgresAccessPolicyHealthy,
  postgresAuditFeedHealthy,
  postgresApplicationRegistryHealthy,
} from "@/lib/access/postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  const identity = identityMode();
  const recruitment = await getRecruitmentCoverage();
  let database = false;
  let accessRegistry = false;
  let accessPolicy = false;
  let accessDirectory = false;
  let accessAudit = false;
  let moneySubmissions = false;
  let directoryRecords = 0;
  let joinedDates = 0;
  let birthdays = 0;
  let directoryLive = false;

  try {
    const directory = await getDirectory();
    directoryLive = directory.origin === "airtable";
    directoryRecords = directory.items.length;
    joinedDates = directory.items.filter((person) => Boolean(person.joinedDate)).length;
    birthdays = directory.items.filter((person) => Boolean(person.birthday)).length;
  } catch {
    directoryLive = false;
  }

  if (databaseConfigured()) {
    try {
      await getSql()`select 1 as healthy`;
      database = true;
      accessRegistry = await postgresApplicationRegistryHealthy();
      accessPolicy = accessRegistry && await postgresAccessPolicyHealthy();
      accessDirectory = accessPolicy && await postgresAccessDirectoryHealthy();
      accessAudit = accessDirectory && await postgresAuditFeedHealthy();
      const moneyRows = await getSql()`select to_regclass('public.money_submissions') is not null as healthy`;
      moneySubmissions = moneyRows[0]?.healthy === true;
    } catch {
      database = false;
      accessRegistry = false;
      accessPolicy = false;
      accessDirectory = false;
      accessAudit = false;
      moneySubmissions = false;
    }
  }
  const demo = identity === "preview";
  const ready = demo || (identity === "clerk" && database && accessRegistry && accessPolicy && accessDirectory && accessAudit && directoryLive);

  return NextResponse.json(
    {
      ok: ready,
      service: "cove",
      mode: demo ? "demonstration" : "live",
      checks: {
        identity: identity === "clerk" || demo,
        accessDatabase: database,
        accessRegistry: demo || accessRegistry,
        accessPolicy: demo || accessPolicy,
        accessDirectory: demo || accessDirectory,
        accessAudit: demo || accessAudit,
        directory: demo || directoryLive,
        recruitment: demo || recruitment.available,
        moneyWrites: moneySubmissions || process.env.AIRTABLE_MONEY_WRITES_ENABLED === "true",
        injuryWrites: process.env.AIRTABLE_INJURIES_WRITES_ENABLED === "true",
        githubTelemetry: Boolean(
          process.env.COVE_GITHUB_READ_TOKEN?.trim() ||
          (
            process.env.COVE_GITHUB_APP_ID?.trim() &&
            process.env.COVE_GITHUB_APP_INSTALLATION_ID?.trim() &&
            process.env.COVE_GITHUB_APP_PRIVATE_KEY?.trim()
          ),
        ),
      },
      directoryCoverage: {
        records: directoryRecords,
        joinedDates,
        birthdays,
      },
      recruitmentCoverage: {
        records: recruitment.records,
        candidates: recruitment.candidates,
        truncated: recruitment.truncated,
      },
    },
    {
      status: ready ? 200 : 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
