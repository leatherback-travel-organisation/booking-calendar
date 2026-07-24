import type { Metadata } from "next";
import { ApplicantExperience } from "@/components/applicants/applicant-experience";

export const metadata: Metadata = {
  title: "Work with us · Leatherback Travel",
  description: "Explore open roles and apply to help Leatherback Travel build journeys people never stop talking about.",
};

export default function ApplyPage() {
  return <ApplicantExperience />;
}
