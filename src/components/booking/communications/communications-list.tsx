// Server-rendered list of guest messages, grouped by brand (Nicola, 15 Sep).
//
// One section per brand, its five messages in the order a guest receives
// them. Each row says what the message is in plain words, then shows the
// brand's call types as pills — each pill opens that call type's version of
// the message directly, so nobody has to open a message to discover what is
// inside it. The two reminder rows carry that reminder's email switch and
// its text-message switch, under Email and SMS headings in the brand header.
//
// Bookkeeping stays out: no version counts, no seed actors. A person's edit
// still shows, quietly, under the description.

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  editorLabel,
  formatDiffDate,
  MOMENT_META,
  type BrandSummary,
} from "@/lib/booking/notify/template-scope.ts";
import type { BrandCallType } from "@/app/booking/communications/template-data";
import { ReminderSwitches } from "./reminder-switches";
import styles from "./communications-list.module.css";

export type BrandGroup = {
  summary: BrandSummary;
  colorPrimary: string | null;
  callTypes: BrandCallType[];
  reminder24hEnabled: boolean;
  reminder1hEnabled: boolean;
  smsReminder24hEnabled: boolean;
  smsReminder1hEnabled: boolean;
};

export type PodSection = {
  key: string;
  name: string;
  groups: BrandGroup[];
};

type CommunicationsListProps = {
  pods: PodSection[];
  canEdit: boolean;
};

function editorHref(
  moment: string,
  brandKey: string,
  typeKey?: string,
): string {
  const params = new URLSearchParams({ brand: brandKey });
  if (typeKey) params.set("type", typeKey);
  return `/booking/communications/${moment}?${params.toString()}`;
}

export function CommunicationsList({ pods, canEdit }: CommunicationsListProps) {
  return (
    <div className={styles.journey}>
      <p className={styles.intro}>
        The emails each brand sends a guest, in the order they arrive, grouped
        by pod. Pick a call type to read or change that version of the message.
        {canEdit
          ? ""
          : " Reminder switches are set by Pod Leads and Senior BMs."}
      </p>
      {pods.map((pod) => (
        <section key={pod.key} className={styles.pod}>
          <h2 className={styles.podTitle}>{pod.name}</h2>
          {pod.groups.map((group) => (
            <BrandCard
              key={group.summary.brandKey}
              group={group}
              canEdit={canEdit}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function BrandCard({
  group,
  canEdit,
}: {
  group: BrandGroup;
  canEdit: boolean;
}) {
  const { summary, colorPrimary, callTypes, ...flags } = group;
  const brandKey = summary.brandKey;
  return (
    <section
      className={styles.brandGroup}
      style={
        colorPrimary ? ({ "--tag": colorPrimary } as CSSProperties) : undefined
      }
    >
      <div className={styles.brandHead}>
        <span className={styles.brandDot} aria-hidden="true" />
        <h3 className={styles.brandTitle}>{summary.brandName}</h3>
        {/* Column headings for the switches on the reminder rows. */}
        <span className={styles.channelHeads} aria-hidden="true">
          <span className={styles.channelHead}>Email</span>
          <span className={styles.channelHead}>SMS</span>
        </span>
      </div>
      <ul className={styles.rows}>
        {summary.moments.map((cell) => {
          const meta = MOMENT_META[cell.moment];
          const editor = cell.lastEdited
            ? editorLabel(cell.lastEdited.by)
            : null;
          const reminder =
            cell.moment === "reminder_24h"
              ? {
                  kind: "reminder_24h" as const,
                  email: flags.reminder24hEnabled,
                  sms: flags.smsReminder24hEnabled,
                }
              : cell.moment === "reminder_1h"
                ? {
                    kind: "reminder_1h" as const,
                    email: flags.reminder1hEnabled,
                    sms: flags.smsReminder1hEnabled,
                  }
                : null;
          const off = reminder !== null && !reminder.email && !reminder.sms;
          return (
            <li
              key={cell.moment}
              className={styles.messageRow}
              data-off={off ? "" : undefined}
            >
              <div className={styles.messageText}>
                <Link
                  href={editorHref(cell.moment, brandKey)}
                  className={styles.messageName}
                >
                  {meta.label}
                </Link>
                <span className={styles.messageDescription}>
                  {meta.description}
                </span>
                {editor && cell.lastEdited && (
                  <span className={styles.messageEdited}>
                    Changed by {editor}, {formatDiffDate(cell.lastEdited.at)}
                  </span>
                )}
              </div>
              <div className={styles.pillsCol}>
                {callTypes.length > 0 && (
                  <span className={styles.pills}>
                    {callTypes.map((type) => {
                      const own = cell.typeKeys.includes(type.key);
                      return (
                        <Link
                          key={type.key}
                          href={editorHref(cell.moment, brandKey, type.key)}
                          className={styles.pill}
                          data-own={own || undefined}
                          title={
                            own
                              ? `${type.name}: its own version — open to read or change it`
                              : `${type.name}: uses the shared wording — open to write its own`
                          }
                        >
                          {type.name}
                        </Link>
                      );
                    })}
                  </span>
                )}
              </div>
              {reminder && (
                <div className={styles.rowSetting}>
                  <ReminderSwitches
                    brandKey={brandKey}
                    brandName={summary.brandName}
                    moment={reminder.kind}
                    label={meta.label}
                    emailEnabled={reminder.email}
                    smsEnabled={reminder.sms}
                    canEdit={canEdit}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
