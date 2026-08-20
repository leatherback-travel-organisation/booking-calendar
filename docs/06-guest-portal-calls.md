# Guest Portal → Calltime: "Book a call with your BM"

For the guest-portal team. Every booking shown in the portal can offer a
one-click "book a call" with the Booking Manager who coordinates that trip.
Calltime does all the routing — the portal only needs the booking's Airtable
**trip record id** (the `Trips` link on the guest's Bookings row).

## The one-liner

Link (or redirect) the guest to:

```
https://cove.leatherbacktravel.com/book?tripRecord=<recXXXXXXXXXX>&source=portal&type=lead-up
```

- `tripRecord` — the Airtable record id of the trip the guest booked.
  Calltime resolves it to that exact departure's Trip Coordinator, brands
  the page, and shows their live availability.
- `source=portal` — records the booking with `source_kind = 'portal'`
  (visible on the Calltime dashboard as "self-booked · portal").
- `type` — optional call type: `lead-up` (default here), `enquiry`, `rhime`,
  `feedback`. Omit to let the guest pick.
- Add `&embed=1` to render the compact widget variant inside an iframe.

If the trip record can't be resolved (cancelled trip, missing coordinator),
the page degrades to a picker — never an error page — and the miss shows up
on Calltime's coverage map.

## Optional: a richer button (call-card API)

To render "Book a call with Claire" with the BM's photo and brand colour
before the guest clicks, call:

```
GET https://cove.leatherbacktravel.com/api/booking/public/call-card?tripRecord=<recXXX>[&type=lead-up]
```

CORS is open (`*`), no auth, read-only, and it returns only what the public
/book page already shows guests:

```json
{
  "found": true,
  "kind": "primary",
  "bookUrl": "https://cove.leatherbacktravel.com/book?tripRecord=recX&source=portal&type=lead-up",
  "trip":  { "title": "Sri Lanka", "startDate": "2026-08-22" },
  "brand": { "key": "patch", "name": "Patch Adventures", "logoUrl": null, "colorPrimary": "#ad5046" },
  "bm":    { "firstName": "Mandy", "photoUrl": "…", "bio": "…" },
  "poolLabel": null,
  "callType": { "key": "lead-up", "name": "Lead-Up Call", "durationMin": 20 }
}
```

- `kind: "pool"` means no single coordinator is reachable — `bm` is null and
  `poolLabel` gives the honest wording ("the Patch Adventures team").
- `found: false` means the record didn't resolve; hide the button.

Suggested markup: `Book a call with {bm.firstName ?? poolLabel}` on a button
tinted `brand.colorPrimary`, linking to `bookUrl`.

## What Calltime does with portal bookings

- Books against the BM's real Google Calendar (conflict-safe), emails the
  guest a branded confirmation with reschedule/cancel links, reminders at
  24h and 1h (SMS too where the brand has it enabled and a phone was left).
- Opens a Help Scout conversation in the brand mailbox assigned to the BM,
  including the guest-crossover flag (other active CRM leads the guest holds,
  with each owning BM notified).
- The exact departure is preserved (`airtableTripRecordId`), so "this same
  trip" crossover detection works.

Questions → Nicola / the booking-calendar repo (`docs/05-booking-app.md`
covers the wider architecture).
