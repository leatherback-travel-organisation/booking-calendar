export type EmergencyApplicationLink = {
  readonly slug: string;
  readonly name: string;
  readonly url: string;
};

/**
 * Build-time recovery directory. Keep this free of database and identity
 * imports: it must remain renderable when Cove, Clerk, or Postgres is down.
 */
export const emergencyApplicationDirectory = [
  { slug: "booking", name: "Calltime", url: "https://cove.leatherbacktravel.com/booking" },
  { slug: "app-builder", name: "App Builder", url: "https://cove.leatherbacktravel.com/app-builder" },
  { slug: "recruitment", name: "Recruitment", url: "https://cove.leatherbacktravel.com/recruitment" },
  { slug: "superpanel", name: "SuperPanel", url: "https://cove.leatherbacktravel.com/systems" },
  { slug: "trtl", name: "TRTL", url: "https://trtl.leatherbacktravel.com" },
  {
    slug: "leatherback-answers",
    name: "Leatherback Answers",
    url: "https://answers.leatherbacktravel.com",
  },
  {
    slug: "supplier-portal",
    name: "Supplier Portal",
    url: "https://suppliers.leatherbacktravel.com",
  },
  {
    slug: "1mwu",
    name: "1MWU",
    url: "https://docs.google.com/spreadsheets/d/1KuxRxUy5MlUNof1dC7oGuHRomsb5wDqBJC3fFPTeXN0/edit?gid=0#gid=0",
  },
  { slug: "money", name: "Your Money", url: "https://cove.leatherbacktravel.com/money" },
  {
    slug: "injuries",
    name: "Injury Reporting",
    url: "https://cove.leatherbacktravel.com/injuries",
  },
] as const satisfies readonly EmergencyApplicationLink[];
