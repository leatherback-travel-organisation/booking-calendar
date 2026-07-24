import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { RecruitmentWorkspaceView } from "@/components/recruitment/recruitment-workspace";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { getRecruitmentWorkspace } from "@/lib/recruitment/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recruitment · Cove",
  description: "Internal candidate pipeline and role advertising workspace.",
};

export default async function RecruitmentPage() {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "recruitment", "recruitment.read");
  const workspace = await getRecruitmentWorkspace();
  return <AppShell active="recruitment"><RecruitmentWorkspaceView workspace={workspace}/></AppShell>;
}
