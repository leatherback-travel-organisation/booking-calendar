"use server";

import { revalidatePath } from "next/cache";
import { requireApplicationPermission } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { isValidInjuryDate, type NewInjuryReport } from "./model";
import { createInjuryReport, updateEmployeeInjury } from "./server";

function clean(value: string, max: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function validatedReport(input: NewInjuryReport): NewInjuryReport {
  if (!isValidInjuryDate(input.dateOfInjury)) throw new Error("Choose a valid injury date.");
  const nature = clean(input.nature, 1000);
  if (nature.length < 5) throw new Error("Describe the injury or illness.");
  if (!Number.isInteger(input.daysOff) || input.daysOff < 0 || input.daysOff > 365) throw new Error("Enter a valid number of days off.");

  return {
    ...input,
    nature,
    location: clean(input.location, 300),
    additionalInformation: clean(input.additionalInformation, 1500),
    bodilyLocation: clean(input.bodilyLocation, 500),
    equipmentDetails: clean(input.equipmentDetails, 700),
  };
}

export async function submitInjuryReport(input: NewInjuryReport) {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "injuries", "injuries.submit");
  const result = await createInjuryReport(identity, validatedReport(input));
  revalidatePath("/injuries");
  revalidatePath("/admin/injuries");
  return result;
}

export async function editInjuryReport(recordId: string, input: NewInjuryReport) {
  const identity = await requireEmployeeIdentity();
  await requireApplicationPermission(identity, "injuries", "injuries.submit");
  const result = await updateEmployeeInjury(identity, recordId, validatedReport(input));
  revalidatePath("/injuries");
  revalidatePath("/admin/injuries");
  return result;
}
