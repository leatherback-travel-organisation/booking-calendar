import type { InjuryRecord } from "./model";

export const previewInjuryRecords: InjuryRecord[] = [
  {
    id: "preview-injury-1",
    employeeName: "Alex Morgan",
    dateOfSubmission: "2026-05-18T10:12:00.000Z",
    dateOfInjury: "2026-05-17",
    nature: "Minor strain while lifting luggage",
    location: "Hotel storage room",
    discussedWithManager: true,
    daysOff: 0,
    additionalInformation: "Reported as a precaution. No follow-up treatment was required.",
  },
];
