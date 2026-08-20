// Generates the per-call-type guest comms: every brand × guest-facing call
// type × moment, each in the brand's voice (per the Leatherback Writing &
// Communication Guide) and worded for what that call actually is.
//
//   node scripts/booking-seed-type-templates.mjs           # apply to .pglite-dev (server stopped)
//   node scripts/booking-seed-type-templates.mjs --sql     # also write scripts/type-templates.generated.sql
//
// Rows are inserted with on-conflict-do-nothing at (moment, brand, type)
// scope, so hand-edited versions are never overwritten.

import { writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// One voice per brand — Special Feeling: conversational, greet → hug →
// clear answer → warm sign-off, at most one emoji, no clichés.
const VOICES = {
  patch: {
    confirmLead: "Brilliant",
    hug: "the planning fun starts here",
    signoff: "Adventure awaits",
    emoji: " 🎒",
  },
  "camino-women": {
    confirmLead: "Wonderful",
    hug: "you're one step closer already",
    signoff: "One foot in front of the other — you've got this",
    emoji: " 🥾",
  },
  "magnificent-explorers": {
    confirmLead: "Splendid",
    hug: "consider your seat reserved",
    signoff: "First class, always",
    emoji: " 🚂",
  },
  fencox: {
    confirmLead: "Good news",
    hug: "it's in the diary and we're looking forward to it",
    signoff: "Speak soon",
    emoji: "",
  },
  carex: {
    confirmLead: "Lovely",
    hug: "something beautiful is taking root",
    signoff: "Happy wandering",
    emoji: " 🌿",
  },
  "salt-caravan": {
    confirmLead: "Wonderful news",
    hug: "the road is already humming",
    signoff: "Until the road calls again",
    emoji: " ✨",
  },
  harriet: {
    confirmLead: "Yes",
    hug: "this is going to be a good one",
    signoff: "Onward",
    emoji: " 🎉",
  },
};

// What each call actually is, in guest words.
const TYPES = {
  enquiry: {
    noun: "trip enquiry chat",
    purpose: "a chance to dream up where you might go next — no commitments, just possibilities",
    prep: "Bring the destinations on your shortlist, or none at all — that's half the fun.",
  },
  rhime: {
    noun: "RHIME call",
    purpose: "we'll make sure this trip is the right match for you — expectations, fitness, and all the little details",
    prep: "Have your questions about the itinerary handy; nothing is too small to ask.",
  },
  "lead-up": {
    noun: "lead-up call",
    purpose: "a pre-departure check-in so you're fully set before you go",
    prep: "Gather any last questions — packing, paperwork, meeting the group.",
  },
  feedback: {
    noun: "feedback call",
    purpose: "we'd love to hear how your trip went — the stories and the honest bits alike",
    prep: "Bring your favourite moment, and anything we could have done better.",
  },
  chat: {
    noun: "quick chat",
    purpose: "fifteen minutes for whatever's on your mind",
    prep: "No prep needed — just bring your questions.",
  },
};

const WHEN =
  "<p><strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — we've set aside {{booking.duration}} just for you.</p>";
const JOIN = "<p>{{booking.join_details}}</p>";
const MANAGE =
  '<p>Life happens — you can <a href="{{booking.reschedule_link}}">reschedule</a> or <a href="{{booking.cancel_link}}">cancel</a> whenever you need, no fuss.</p>';
const RESCHED = '<p>Day looking different than planned? <a href="{{booking.reschedule_link}}">Reschedule here</a> — takes seconds.</p>';

function templates(voice, type) {
  const signoff = `<p>${voice.signoff},<br/>{{host.first_name}} at {{brand.name}}</p>`;
  return {
    confirmation: {
      subject: `${voice.confirmLead}, {{guest.first_name}} — your ${type.noun} with {{host.first_name}} is locked in`,
      bodyHtml:
        `<p>Hi {{guest.first_name}},</p>` +
        `<p>${voice.confirmLead} — your ${type.noun} with {{host.first_name}} is locked in, and ${voice.hug}!${voice.emoji}</p>` +
        `<p>This one's ${type.purpose}.</p>` +
        WHEN +
        JOIN +
        MANAGE +
        `<p>${type.prep}</p>` +
        signoff,
    },
    reminder_24h: {
      subject: `Tomorrow: your ${type.noun} with {{host.first_name}} at {{booking.meeting_time}}`,
      bodyHtml:
        `<p>Hi {{guest.first_name}},</p>` +
        `<p>Just a friendly nudge — your ${type.noun} with {{host.first_name}} is tomorrow, {{booking.meeting_date}}, at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p>` +
        JOIN +
        `<p>${type.prep}</p>` +
        RESCHED +
        signoff,
    },
    reminder_1h: {
      subject: `Nearly time — your ${type.noun} starts at {{booking.meeting_time}}`,
      bodyHtml:
        `<p>Hi {{guest.first_name}},</p>` +
        `<p>Nearly time! Your ${type.noun} with {{host.first_name}} starts at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}) — about an hour from now.</p>` +
        JOIN +
        `<p>See you very soon!${voice.emoji}</p>`,
    },
    reschedule: {
      subject: `All sorted — your ${type.noun} has moved to {{booking.meeting_date}}`,
      bodyHtml:
        `<p>Hi {{guest.first_name}},</p>` +
        `<p>All sorted — your ${type.noun} with {{host.first_name}} has moved to <strong>{{booking.meeting_date}}</strong> at <strong>{{booking.meeting_time}}</strong> ({{booking.timezone}}).</p>` +
        JOIN +
        `<p>Need to juggle it again? <a href="{{booking.reschedule_link}}">Reschedule</a> · <a href="{{booking.cancel_link}}">Cancel</a> — whatever works for you.</p>` +
        signoff,
    },
    cancellation: {
      subject: `Your ${type.noun} on {{booking.meeting_date}} has been cancelled`,
      bodyHtml:
        `<p>Hi {{guest.first_name}},</p>` +
        `<p>Your ${type.noun} with {{host.first_name}} on {{booking.meeting_date}} at {{booking.meeting_time}} ({{booking.timezone}}) is cancelled — all taken care of, nothing more for you to do.</p>` +
        `<p>If you'd still love to talk, we're easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.</p>` +
        `<p>${voice.signoff},<br/>The {{brand.name}} team</p>`,
    },
  };
}

const sqlEscape = (value) => value.replace(/'/g, "''");
const rows = [];
for (const [brandKey, voice] of Object.entries(VOICES)) {
  for (const [typeKey, type] of Object.entries(TYPES)) {
    for (const [moment, content] of Object.entries(templates(voice, type))) {
      rows.push({ brandKey, typeKey, moment, ...content });
    }
  }
}

const valuesSql = rows
  .map(
    (row) =>
      `  ((select id from booking.brand where key = '${row.brandKey}'), '${row.typeKey}', '${row.moment}',\n` +
      `   '${sqlEscape(row.subject)}',\n` +
      `   '${sqlEscape(row.bodyHtml)}', true, 'seed:type-voice')`,
  )
  .join(",\n");
const sql =
  `-- Per-call-type guest comms (generated by scripts/booking-seed-type-templates.mjs).\n` +
  `-- Every brand x guest-facing call type x moment, in the brand's voice,\n` +
  `-- worded for what the call actually is. Hand edits win: on conflict do nothing.\n` +
  `insert into booking.message_template (brand_id, event_type_key, moment, subject, body_html, active, updated_by) values\n` +
  valuesSql +
  `\non conflict do nothing;\n`;

if (process.argv.includes("--sql")) {
  writeFileSync("scripts/type-templates.generated.sql", sql);
  console.log("wrote scripts/type-templates.generated.sql");
}

const db = new PGlite(`${process.cwd()}/.pglite-dev`, { extensions: { btree_gist, citext, pgcrypto } });
await db.waitReady;
await db.exec(sql);
const count = await db.query(
  "select count(*)::int as n from booking.message_template where updated_by = 'seed:type-voice' and active",
);
console.log(`type-voice templates active in dev: ${count.rows[0].n} (of ${rows.length} generated)`);
await db.close();
