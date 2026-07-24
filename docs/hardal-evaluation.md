# Hardal evaluation for Leatherback Travel

**Verdict:** run a narrow, instrumented pilot; do not approve a group-wide replacement of the current analytics stack yet.

Hardal is most interesting as a server-side measurement and event-routing layer. Its documented strengths—first-party collection, cookieless sessions, raw-data access, conversion forwarding and bot visibility—address genuine blind spots in browser-only analytics. For Leatherback, the immediate value would be cleaner paid-media conversion signals and a credible view of which AI crawlers reach priority brand and trip pages.

The reason for a pilot rather than a rollout is product maturity and proof. Hardal's own roadmap still marks AI Visibility as coming soon, while the public playbook describes it as early access. Session replay, transformations, consent mode and additional attribution models are also shown as building or coming soon. Those are meaningful dependencies, not cosmetic gaps. Claims such as GDPR compliance, very high event capture and attribution improvement should be validated against Leatherback's consent configuration, contracts and measured data—not accepted as universal outcomes.

## What Hardal appears to do well

- Collect first-party web and app events server-side, with cookieless operation and flexible JSON event parameters.
- Forward events server-to-server to destinations including Meta CAPI, Google Analytics 4 and other advertising platforms, with destination activity and delivery status.
- Provide campaign, funnel, item and session reporting, plus access to raw data and external reporting tools.
- Distinguish crawler and agent requests that JavaScript analytics cannot observe. Its documented AI Visibility design groups agents by platform, category and page.
- Support custom domains, PII redaction, hashing, IP anonymisation and export controls as part of its privacy positioning.

Primary product references: [Hardal documentation](https://docs.usehardal.com/), [analytics overview](https://usehardal.com/analytics), [AI Visibility overview](https://docs.usehardal.com/user-guide/ai-visibility/overview), [destination overview](https://docs.usehardal.com/user-guide/destinations/overview), and [product roadmap](https://docs.usehardal.com/roadmap).

## Where it could help Leatherback

1. **Paid conversion resilience.** Send deduplicated lead and booking events to ad platforms when browser tags are blocked or incomplete.
2. **Cross-brand event discipline.** Establish a small canonical event dictionary across the portfolio instead of maintaining different meanings for the same action.
3. **AI crawler baseline.** See whether important product, destination and editorial pages are being reached by verified AI search and answer-engine agents.
4. **First-party campaign analysis.** Compare campaign-to-enquiry and enquiry-to-booking performance without making GA4 the only source of truth.
5. **Data portability.** Test whether raw-data access makes internal company reporting easier and reduces vendor lock-in.

## Risks and unanswered questions

### Product and evidence

- AI Visibility is documented as coming soon/early access. Leatherback should require a live demonstration using a real Vercel-hosted brand before treating it as available.
- Verify how Hardal authenticates claimed bots. User-agent strings alone are spoofable; the pilot should require published-IP or reverse-DNS verification where a provider supports it.
- Request observed delivery rates, retry behaviour, deduplication keys and a dead-letter/replay workflow for every advertising destination in scope.
- Confirm the exact attribution models available today, not only those on the roadmap.
- Confirm plan limits and total cost across nine brands, event retention, destinations, seats, custom domains and raw-data export. Public materials do not provide enough group-level pricing detail for a purchasing decision.

### Privacy, consent and ownership

- “Cookieless” does not automatically mean consent-free or lawful in every market. Document purposes, lawful basis, retention, data residency, subprocessors, deletion, DSAR handling and controller/processor roles.
- Inspect which identifiers are generated, whether sessions can be linked across visits/devices, and which fields reach ad platforms.
- Require a DPA, security evidence, incident terms, role-based access, audit logs, SSO status and a tested export/deletion path.
- Use a first-party tracking subdomain that cannot accidentally receive application cookies. Apply a strict allowlist to event names and properties; never send passports, health data, free-text guest notes or payment details.

### Architecture

- Hardal should initially complement, not replace, GA4 and existing Vercel/server telemetry. Run dual measurement long enough to quantify the difference.
- Define a Leatherback-owned event contract before implementation. A new tool cannot repair ambiguous event semantics.
- Keep a vendor-neutral event ID at the source so delivery can be deduplicated and independently reconciled.

## Recommended pilot

**Scope:** two brands with different traffic profiles, one paid conversion destination, 30 days of baseline plus 30 days live. Patch Adventures and one smaller brand would provide a useful contrast.

### Phase 0 — due diligence

- Obtain price, DPA, subprocessor list, residency/retention options, security report or certifications, SLA and exit/export terms.
- Confirm that AI Visibility is enabled for the proposed plan and can verify major crawler identities.
- Agree canonical events: `page_view`, `trip_view`, `enquiry_started`, `enquiry_submitted`, `booking_started`, `booking_confirmed`. No free text.
- Record the current GA4, advertising-platform and backend booking counts for the test period.

### Phase 1 — observe only

- Install Hardal on isolated tracking subdomains for the two pilot brands.
- Send anonymous, allowlisted events to Hardal without enabling advertising destinations.
- Reconcile daily event counts against Vercel request data, GA4 and backend enquiries/bookings.
- Inspect payloads for PII and confirm deletion/export operations with test records.

### Phase 2 — one destination

- Enable a single advertising destination using stable event IDs and explicit consent handling.
- Verify deduplication between browser and server events.
- Monitor accepted, rejected, retried and duplicate events; quantify any change in match quality and reported conversions.

### Phase 3 — AI visibility test

- Compare Hardal's bot report with Vercel or edge request logs for five priority crawler families.
- Check ten commercially important pages and ten editorial pages for discovery.
- Reject counts based only on an unverified user agent. Separate training crawlers, search indexers and user-triggered fetchers.

## Go/no-go scorecard

Proceed beyond the pilot only if all mandatory conditions pass:

| Measure | Pass condition |
| --- | --- |
| Booking/enquiry integrity | No unexplained loss or double counting; backend remains authoritative |
| Destination reliability | At least 99% of eligible events accepted or safely retryable |
| Deduplication | Demonstrably prevents browser/server double counting |
| Privacy | Approved DPA and DPIA/assessment; no prohibited fields observed |
| Operations | Named owner, documented incident/replay process and usable audit trail |
| AI bot accuracy | Major counts independently reconcile and spoof handling is documented |
| Economics | Measurable signal or workload improvement exceeds total platform/implementation cost |
| Portability | Raw export and deletion tested successfully |

## Relationship to Google Reviews

Hardal's AI Visibility measures visits to Leatherback websites; it is not a compliant source of Google Business Profile review content and should not be used as a workaround for Google API restrictions. Google's Business Profile API policies currently limit storage of API Content to a temporary period of no more than 30 days and restrict manipulation or aggregation. A separate review-ingestion and sentiment product therefore requires policy/legal confirmation or a licensed source whose terms explicitly permit persistent analytics. See [Google Business Profile API policies](https://developers.google.com/my-business/content/policies).

## Recommendation in one line

Pilot Hardal as a two-brand server-side measurement layer, require independent reconciliation and privacy proof, and buy only after the product demonstrates value on Leatherback's own conversions and crawler logs.
