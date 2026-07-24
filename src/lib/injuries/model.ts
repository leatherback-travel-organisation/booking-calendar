import type { DataOrigin } from "@/lib/airtable/model";
import { isIsoCalendarDateOnOrBefore, isIsoOperationalDate } from "../integrity/date.ts";

export type InjuryRecord = {
  id: string;
  employeeName?: string;
  dateOfSubmission: string;
  dateOfInjury: string;
  nature: string;
  location?: string;
  discussedWithManager?: boolean;
  daysOff?: number;
  additionalInformation?: string;
  bodilyLocation?: string;
  equipmentDetails?: string;
};

export type InjuryCollection = {
  items: InjuryRecord[];
  origin: DataOrigin;
  employeeMatched: boolean;
  integrityIssues: number;
};

export type NewInjuryReport = {
  dateOfInjury: string;
  nature: string;
  location: string;
  discussedWithManager: boolean;
  daysOff: number;
  additionalInformation: string;
  bodilyLocation: string;
  equipmentDetails: string;
};

export type InjuryMutationResult = {
  record: InjuryRecord;
  persisted: boolean;
};

export function isValidInjuryDate(value: string, now = new Date()): boolean {
  return isIsoCalendarDateOnOrBefore(value, now);
}

export function isValidInjurySourceRecord(input: {
  dateOfInjury: string;
  dateOfSubmission: string;
  nature: string;
}, now = new Date()): boolean {
  return (
    isValidInjuryDate(input.dateOfInjury, now) &&
    isIsoOperationalDate(input.dateOfSubmission) &&
    input.nature.trim().length > 0
  );
}
