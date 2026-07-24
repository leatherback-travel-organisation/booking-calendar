export type DataOrigin = "airtable" | "database" | "preview" | "unavailable";

export type Brand = {
  id: string;
  name: string;
  description: string;
  category: string;
  region: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  brandFilesUrl?: string;
  brandFilesLabel?: string;
  brandGuidelinesUrl?: string;
  productBriefUrl?: string;
  brandColours?: string;
  registrationStatus?: string;
  legalEntityOwner?: string;
  logoUrl?: string;
  logoTone?: "light" | "dark";
  teamCount?: number;
  status: "active" | "developing" | "archived";
  accent: string;
};

export type DirectoryPerson = {
  id: string;
  name: string;
  role: string;
  team: string;
  brands?: string[];
  availability: string;
  joinedDate?: string;
  birthday?: string;
  email?: string;
  initials: string;
};

export type AirtableCollection<T> = {
  items: T[];
  origin: DataOrigin;
  integrityIssues: number;
};
