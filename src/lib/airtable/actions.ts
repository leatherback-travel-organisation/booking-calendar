"use server";

import { revalidatePath } from "next/cache";
import { ZodError, z } from "zod";
import { requireCoveUser } from "@/lib/access/server";
import { requireEmployeeIdentity } from "@/lib/identity/server";
import { isIsoCalendarDateOnOrBefore } from "@/lib/integrity/date";
import { TEAM_MEMBER_EDITABLE_FIELDS } from "./personal-details";
import { updatePersonalDetails } from "./server";

export type PersonalDetailsActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

const editableFields = new Set<string>(TEAM_MEMBER_EDITABLE_FIELDS);
const updateSchema = z.object({
  fields: z.record(z.string(), z.string().max(2_000)),
});

function validateFields(input: unknown) {
  const parsed = updateSchema.parse(input).fields;
  const entries = Object.entries(parsed);
  if (!entries.length) throw new Error("There are no editable details to save.");
  if (entries.some(([field]) => !editableFields.has(field))) {
    throw new Error("That HR field cannot be edited here.");
  }

  const dateOfBirth = parsed["Date of Birth"]?.trim();
  if (dateOfBirth && !isIsoCalendarDateOnOrBefore(dateOfBirth, new Date())) {
    throw new Error("Enter date of birth as a complete date.");
  }

  const personalEmail = parsed.Email?.trim();
  if (personalEmail) z.email().parse(personalEmail);

  return Object.fromEntries(entries.map(([field, value]) => [field, value.trim()]));
}

export async function updatePersonalDetailsAction(
  input: unknown,
): Promise<PersonalDetailsActionResult> {
  try {
    const identity = await requireEmployeeIdentity();
    await requireCoveUser(identity);
    const fields = validateFields(input);
    await updatePersonalDetails(identity, fields);
    revalidatePath("/my-details");
    return { ok: true, message: "Your details have been updated." };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, message: "Check the details you entered and try again." };
    }
    if (error instanceof Error && [
      "There are no editable details to save.",
      "That HR field cannot be edited here.",
      "Enter date of birth as a complete date.",
    ].includes(error.message)) {
      return { ok: false, message: error.message };
    }
    console.error("[personal-details] update failed", error);
    return {
      ok: false,
      message: "Your details could not be saved. Try again or contact People & Operations.",
    };
  }
}
