"use server";

// Server actions for per-BM scheduling controls. Permission rules are
// enforced HERE, not in the UI: a Booking Manager (no booking.manage) may
// change only their own buffer, bio and guest-reminder toggle; everything
// else is Pod Lead only.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { DateTime } from "luxon";
import { requireBookingAccess } from "@/lib/booking/access";
import { getStaffById, getWorkingHours } from "@/lib/booking/availability/service";
import { getSql } from "@/lib/booking/db";
import type { Staff } from "@/lib/booking/model";

const BUFFER_CHOICES = [0, 5, 10, 15, 30];

async function auditAvailabilityChange(actor: string, subjectEmail: string, detail: Record<string, unknown>): Promise<void> {
  const sql = getSql();
  await sql`
    insert into booking.audit_log (actor, action, subject, detail)
    values (${actor}, 'availability_updated', ${subjectEmail}, ${JSON.stringify(detail)}::jsonb)`;
}

async function loadTargetStaff(formData: FormData): Promise<Staff> {
  const staffId = String(formData.get("staffId") ?? "");
  const staff = staffId ? await getStaffById(staffId) : null;
  if (!staff) throw new Error("Unknown staff member.");
  return staff;
}

export async function saveWorkingHours(formData: FormData): Promise<void> {
  const access = await requireBookingAccess("booking.read");
  if (!access.canManage) {
    throw new Error("Working hours are managed by your Pod Lead.");
  }
  const staff = await loadTargetStaff(formData);

  const next: Array<{ dayOfWeek: number; startMin: number; endMin: number }> = [];
  for (let day = 0; day < 7; day += 1) {
    if (formData.get(`d${day}on`) !== "on") continue;
    const startMin = Number(formData.get(`d${day}start`));
    const endMin = Number(formData.get(`d${day}end`));
    if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) throw new Error("Invalid working hours.");
    if (startMin < 0 || endMin > 1440 || endMin <= startMin) throw new Error("Working hours must end after they start.");
    next.push({ dayOfWeek: day, startMin, endMin });
  }

  const before = await getWorkingHours(staff.id);
  const sql = getSql();
  await sql`delete from booking.working_hours where staff_id = ${staff.id}`;
  for (const row of next) {
    await sql`
      insert into booking.working_hours (staff_id, day_of_week, start_min, end_min)
      values (${staff.id}, ${row.dayOfWeek}, ${row.startMin}, ${row.endMin})`;
  }

  await auditAvailabilityChange(access.identity.email, staff.email, {
    workingHours: { from: before, to: next },
  });
  revalidatePath(`/booking/team/${staff.slug}`);
  redirect(`/booking/team/${staff.slug}?saved=hours`);
}

export async function saveSettings(formData: FormData): Promise<void> {
  const access = await requireBookingAccess("booking.read");
  const staff = await loadTargetStaff(formData);
  const isSelf = staff.email.toLowerCase() === access.identity.email.toLowerCase();
  if (!access.canManage && !isSelf) {
    throw new Error("You can only edit your own settings.");
  }

  const bufferMinutes = Number(formData.get("bufferMinutes"));
  if (!BUFFER_CHOICES.includes(bufferMinutes)) throw new Error("Invalid buffer.");
  const bioRaw = formData.get("bio");
  const bio = typeof bioRaw === "string" && bioRaw.trim().length > 0 ? bioRaw.trim() : null;

  // Checkboxes: an unchecked box submits nothing, so the form carries a marker
  // field — without it (e.g. an older form) the value is left unchanged. Like
  // buffer and bio, a BM may toggle these on their own row.
  const reminder24hEnabled =
    formData.get("remindersEnabledField") === null
      ? staff.reminder24hEnabled
      : formData.get("reminder24hEnabled") === "on";
  const reminder1hEnabled =
    formData.get("remindersEnabledField") === null
      ? staff.reminder1hEnabled
      : formData.get("reminder1hEnabled") === "on";

  // Pod Lead only: the disabled checkbox submits nothing for BMs, and a
  // submitted change from a non-manager is an escalation attempt — refuse it.
  const canEditCommunications =
    formData.get("remindersEnabledField") === null || !access.canManage
      ? staff.canEditCommunications
      : formData.get("canEditCommunications") === "on";
  if (!access.canManage && formData.get("canEditCommunications") === "on" && !staff.canEditCommunications) {
    throw new Error("Guest Communications access is granted by your Pod Lead.");
  }

  // Restricted fields: disabled inputs are not submitted, so a missing value
  // means "unchanged". A submitted, changed value from a non-manager is an
  // attempt to escalate — refuse it.
  const noticeRaw = formData.get("minNoticeHours");
  const minNoticeHours = noticeRaw === null || noticeRaw === "" ? staff.minNoticeHours : Number(noticeRaw);
  const windowRaw = formData.get("bookingWindowDays");
  const bookingWindowDays = windowRaw === null || windowRaw === "" ? staff.bookingWindowDays : Number(windowRaw);
  const timezoneRaw = formData.get("timezoneOverride");
  const timezoneOverride =
    timezoneRaw === null ? staff.timezoneOverride : String(timezoneRaw).trim().length > 0 ? String(timezoneRaw).trim() : null;

  if (!access.canManage) {
    const restrictedChanged =
      minNoticeHours !== staff.minNoticeHours ||
      bookingWindowDays !== staff.bookingWindowDays ||
      timezoneOverride !== staff.timezoneOverride;
    if (restrictedChanged) {
      throw new Error("Notice, booking window and timezone are managed by your Pod Lead.");
    }
  }

  if (!Number.isInteger(minNoticeHours) || minNoticeHours < 0 || minNoticeHours > 72) {
    throw new Error("Minimum notice must be between 0 and 72 hours.");
  }
  if (!Number.isInteger(bookingWindowDays) || bookingWindowDays < 7 || bookingWindowDays > 90) {
    throw new Error("Booking window must be between 7 and 90 days.");
  }
  if (timezoneOverride !== null && !DateTime.now().setZone(timezoneOverride).isValid) {
    throw new Error(`"${timezoneOverride}" is not a valid IANA timezone.`);
  }

  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (bufferMinutes !== staff.bufferMinutes) diff.bufferMinutes = { from: staff.bufferMinutes, to: bufferMinutes };
  if (bio !== staff.bio) diff.bio = { from: staff.bio, to: bio };
  if (reminder24hEnabled !== staff.reminder24hEnabled) {
    diff.reminder24hEnabled = { from: staff.reminder24hEnabled, to: reminder24hEnabled };
  }
  if (reminder1hEnabled !== staff.reminder1hEnabled) {
    diff.reminder1hEnabled = { from: staff.reminder1hEnabled, to: reminder1hEnabled };
  }
  if (canEditCommunications !== staff.canEditCommunications) {
    diff.canEditCommunications = { from: staff.canEditCommunications, to: canEditCommunications };
  }
  if (minNoticeHours !== staff.minNoticeHours) diff.minNoticeHours = { from: staff.minNoticeHours, to: minNoticeHours };
  if (bookingWindowDays !== staff.bookingWindowDays) {
    diff.bookingWindowDays = { from: staff.bookingWindowDays, to: bookingWindowDays };
  }
  if (timezoneOverride !== staff.timezoneOverride) {
    diff.timezoneOverride = { from: staff.timezoneOverride, to: timezoneOverride };
  }

  if (Object.keys(diff).length > 0) {
    const sql = getSql();
    await sql`
      update booking.staff
         set buffer_minutes = ${bufferMinutes},
             min_notice_hours = ${minNoticeHours},
             booking_window_days = ${bookingWindowDays},
             timezone_override = ${timezoneOverride},
             bio = ${bio},
             reminder_24h_enabled = ${reminder24hEnabled},
             reminder_1h_enabled = ${reminder1hEnabled},
             can_edit_communications = ${canEditCommunications}
       where id = ${staff.id}`;
    await auditAvailabilityChange(access.identity.email, staff.email, diff);
  }
  revalidatePath(`/booking/team/${staff.slug}`);
  redirect(`/booking/team/${staff.slug}?saved=settings`);
}
