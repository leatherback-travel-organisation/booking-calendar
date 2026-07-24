"use client";

import { useState } from "react";
import type { DirectoryPerson } from "@/lib/airtable/model";
import { parseIsoCalendarDate } from "@/lib/integrity/date";

const DAY_IN_MS = 86_400_000;

function parseDateOnly(value?: string) {
  return value ? parseIsoCalendarDate(value) : null;
}

function joinedDetails(value: string | undefined, today: Date) {
  const joined = parseDateOnly(value);
  if (!joined) return { date: "Not added yet", detail: "Awaiting profile update" };

  const formatted = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(joined);
  if (joined > today) {
    const days = Math.ceil((joined.getTime() - today.getTime()) / DAY_IN_MS);
    return { date: formatted, detail: `Starts in ${days} ${days === 1 ? "day" : "days"}` };
  }

  let months = (today.getUTCFullYear() - joined.getUTCFullYear()) * 12 + today.getUTCMonth() - joined.getUTCMonth();
  if (today.getUTCDate() < joined.getUTCDate()) months -= 1;
  const years = Math.floor(Math.max(months, 0) / 12);
  const remainingMonths = Math.max(months, 0) % 12;
  let detail = "Joined this month";
  if (years && remainingMonths) detail = `${years}y ${remainingMonths}m with Leatherback`;
  else if (years) detail = `${years} ${years === 1 ? "year" : "years"} with Leatherback`;
  else if (remainingMonths) detail = `${remainingMonths} ${remainingMonths === 1 ? "month" : "months"} with Leatherback`;
  return { date: formatted, detail };
}

function birthdayDetails(value: string | undefined, today: Date) {
  const birthday = parseDateOnly(value);
  if (!birthday) return { date: "Not added yet", detail: "Awaiting profile update" };

  const month = birthday.getUTCMonth();
  const day = birthday.getUTCDate();
  const birthdayInYear = (year: number) => {
    const candidate = new Date(Date.UTC(year, month, day));
    return candidate.getUTCMonth() === month ? candidate : new Date(Date.UTC(year, month + 1, 0));
  };
  let next = birthdayInYear(today.getUTCFullYear());
  if (next < today) next = birthdayInYear(today.getUTCFullYear() + 1);
  const days = Math.round((next.getTime() - today.getTime()) / DAY_IN_MS);
  const formatted = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(birthday);
  const detail = days === 0 ? "Today — wish them well!" : days === 1 ? "Tomorrow" : `In ${days} days`;
  return { date: formatted, detail };
}

export function PeopleDirectory({ people, today: todayValue }: { people: DirectoryPerson[]; today: string }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = needle ? people.filter((person) => `${person.name} ${person.role} ${person.team} ${person.brands?.join(" ") ?? ""} ${person.availability}`.toLowerCase().includes(needle)) : people;
  const today = parseDateOnly(todayValue) ?? new Date(0);

  return (
    <>
      <div className="directory-toolbar">
        <p aria-live="polite"><strong>{visible.length}</strong> {visible.length === 1 ? "person" : "people"}{needle ? ` matching “${query.trim()}”` : ""}</p>
        <label className="directory-search">
          <span className="sr-only">Search the team directory</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search people, roles, brands…" />
          <span aria-hidden="true">⌕</span>
        </label>
      </div>

      <div className="directory-table-shell">
        <table className="directory-table">
          <caption className="sr-only">Leatherback Travel team directory</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col">Role</th>
              <th scope="col">Brand / team</th>
              <th scope="col">Availability</th>
              <th scope="col">Joined</th>
              <th scope="col">Birthday</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((person) => {
              const joined = joinedDetails(person.joinedDate, today);
              const birthday = birthdayDetails(person.birthday, today);
              return (
                <tr key={person.id}>
                  <th className="directory-person" scope="row">
                    <span className="directory-person-layout">
                      <span className="directory-table-avatar" aria-hidden="true">{person.initials}</span>
                      <span><strong>{person.name}</strong>{person.email && <small>{person.email}</small>}</span>
                    </span>
                  </th>
                  <td className="directory-role" data-label="Role">{person.role || "Not added yet"}</td>
                  <td className="directory-affiliation" data-label="Brand / team">
                    <span className="directory-team">{person.team || "Unassigned team"}</span>
                    {Boolean(person.brands?.length) && <span className="directory-brands">{person.brands?.map((brand) => <span key={brand}>{brand}</span>)}</span>}
                  </td>
                  <td data-label="Availability"><span className="directory-availability">{person.availability || "Not added yet"}</span></td>
                  <td className="directory-date" data-label="Joined"><strong>{joined.date}</strong><small>{joined.detail}</small></td>
                  <td className="directory-date" data-label="Birthday"><strong>{birthday.date}</strong><small>{birthday.detail}</small></td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td className="directory-empty" colSpan={6}><strong>No people found</strong><span>Try a different name, role, brand or availability.</span></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
