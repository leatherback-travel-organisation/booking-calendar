import type { DataOrigin } from "@/lib/airtable/model";

export const recruitmentStatuses = [
  "Unreviewed",
  "Shortlist",
  "Interview",
  "Challenge",
  "2nd Interview",
  "Final Round",
  "Hire",
  "Personal Rejection",
  "General Rejection",
  "Closed",
  "Next opening",
  "Other Role",
  "Review Later",
  "Talent Pool",
  "Reference Checks",
] as const;

export type RecruitmentStatus = (typeof recruitmentStatuses)[number];
export type RolePublishingStatus = "draft" | "ready" | "live" | "paused" | "closed";

export const recruitmentProfileFlags = [
  "Talent Pool / High Potential",
  "Experienced",
  "Qualified",
  "Great Energy / Personality",
] as const;

export type RecruitmentProfileFlag = (typeof recruitmentProfileFlags)[number];

export type RecruitmentAttachment = {
  id: string;
  filename: string;
  url: string;
  type?: string;
  previewUrl?: string;
};

export type RecruitmentCandidate = {
  id: string;
  name: string;
  email?: string;
  roles: string[];
  status: RecruitmentStatus;
  location?: string;
  schedule: string[];
  assignee?: string;
  interviewer?: string;
  notes?: string;
  firstInterviewNotes?: string;
  secondInterviewNotes?: string;
  createdAt?: string;
  updatedAt?: string;
  attachments: RecruitmentAttachment[];
  comments: RecruitmentComment[];
  tags?: string[];
};

export const recruitmentTemplateKeys = [
  "interview",
  "challenge",
  "reference-checks",
  "talent-pool",
  "general-rejection",
] as const;

export type RecruitmentTemplateKey = (typeof recruitmentTemplateKeys)[number];

export type RecruitmentEmailTemplate = {
  key: RecruitmentTemplateKey;
  stage: RecruitmentStatus;
  label: string;
  subject: string;
  body: string;
  enabled: boolean;
  updatedAt?: string;
};

export type RecruitmentComment = {
  id: string;
  body: string;
  authorName: string;
  authorInitials: string;
  createdAt: string;
};

export type RecruitmentRole = {
  title: string;
  status: RolePublishingStatus;
  hiringManager: string;
  location: string;
  employmentType: string;
  adCopy: string;
  adUrl?: string;
  advertisingChannels: string[];
  publishingNotes: string;
  updatedAt?: string;
  activeCandidates: number;
};

export type RecruitmentWorkspace = {
  candidates: RecruitmentCandidate[];
  roles: RecruitmentRole[];
  origin: DataOrigin;
  integrityIssues: number;
  writesEnabled: boolean;
  truncated: boolean;
  emailTemplates: RecruitmentEmailTemplate[];
};

export const knownRecruitmentRoles = [
  "Inbound Service and Bookings Officer",
  "Trip Design Writer",
  "Social Media Assistant",
  "Senior Customer Support Specialist",
  "Trip Design Assistant",
  "Senior Marketer",
  "Marketing Assistant",
  "Trip Design Intern",
  "Marketing Intern",
  "Trip Ops",
  "Operations Assistant",
  "Booking Manager LATAM",
  "Marketing VA",
  "Head of Finance",
  "Bookkeeping Coordinator",
  "Senior Recruitment Manager",
  "Senior Trip Designer",
] as const;

export function roleReadiness(role: RecruitmentRole) {
  const checks = [
    Boolean(role.hiringManager && role.location && role.employmentType),
    Boolean(role.adCopy.trim()),
    role.advertisingChannels.length > 0,
    Boolean(role.adUrl),
  ];
  return {
    checks,
    complete: checks.filter(Boolean).length,
    percentage: Math.round((checks.filter(Boolean).length / checks.length) * 100),
  };
}
