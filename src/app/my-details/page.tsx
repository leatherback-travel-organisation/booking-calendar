import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { PersonalDetails } from "@/components/personal-details/personal-details";
import { requireCoveUser } from "@/lib/access/server";
import { getPersonalDetails } from "@/lib/airtable/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Details · Cove",
  description: "Review the personal and employment details in your Leatherback HR record.",
};

export default async function MyDetailsPage() {
  const identity = await requireEmployeeIdentity();
  await requireCoveUser(identity);
  const details = await getPersonalDetails(identity);

  return (
    <AppShell active="home">
      <PersonalDetails identity={identity} result={details} />
    </AppShell>
  );
}
