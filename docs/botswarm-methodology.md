# BotSwarm review intelligence methodology

## Purpose

BotSwarm's Review Keeper detects new external reviews, associates them with the correct Leatherback brand and—only when evidence is strong enough—the correct guest and booking. It records the rating in Airtable, presents uncertain cases to a person, and produces transparent sentiment signals for operations and marketing.

The system is designed around five rules:

1. A public reviewer name is not a reliable guest identifier.
2. No probabilistic model may silently alter a guest record.
3. Every write is idempotent, attributable and reversible through history.
4. Raw provider content is retained only when the provider's terms allow it.
5. Low confidence is a valid result and must remain visible.

## Compliant Google review ingestion

### Connection

Use the Google Business Profile APIs only for listings Leatherback owns or is authorised to manage. The Google Cloud project must have approved Business Profile API access, the authenticated account must manage each verified location, and the OAuth grant must include offline access with the `business.manage` scope.

Maintain an explicit configuration mapping:

`Google account resource → Google location resource → canonical Leatherback brand record`

Never infer a brand from a listing name during a production run.

### Daily run

1. Vercel invokes the production cron route once daily with `Authorization: Bearer <CRON_SECRET>`.
2. The route verifies the secret independently of employee login and opens an immutable run record.
3. For each active configured location, fetch review pages ordered by `updateTime desc`, with a 48-hour overlap beyond the saved watermark to catch edits and late processing.
4. Upsert on provider, location and external review ID. An edit updates the existing item and schedules re-analysis; it never creates a duplicate.
5. Retry `429` and server failures with bounded exponential backoff and jitter. Authentication and configuration errors require intervention rather than blind retries.
6. Mark an otherwise successful run `partial` when one location fails, retain per-location evidence and alert the operator.
7. Advance a location watermark only after its pages are safely committed.

Google's review endpoint provides rating, comment, public reviewer information and timestamps. It does not provide a guest email or booking identifier.

### Retention and policy boundary

The current Google Business Profile API policy states that API Content may be stored only in limited amounts for performance, temporarily for no more than 30 calendar days, and restricts manipulation or aggregation. Before retaining a permanent corpus or producing historical cross-brand sentiment analysis, Leatherback must obtain a policy/legal decision or use a licensed data source/export with terms that permit the intended analytics.

Until that decision:

- set `raw_expires_at` no later than 30 days after retrieval;
- purge review text and public reviewer data automatically at expiry;
- do not copy raw review text into Airtable;
- limit the interface to a live operational window;
- preserve only data that counsel confirms may remain, with provenance and deletion controls;
- do not claim that an internal derivative avoids the source policy.

Relevant official references: [reviews list method](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list), [OAuth implementation](https://developers.google.com/my-business/content/implement-oauth), and [Business Profile API policies](https://developers.google.com/my-business/content/policies).

## Guest and booking matching

### Candidate generation

Generate candidates from the guest/booking system of record, initially constrained to the review's brand. Prefer bookings whose trip ended within 120 days before the review, with a controlled fallback window of 365 days. Candidate features may include:

- Unicode-normalised full-name, surname, first-name, nickname and initial similarity;
- booking and trip dates relative to review creation;
- brand and operating entity;
- destination or trip tokens explicitly present in the text;
- co-traveller relationship where the source system permits its use;
- a prior human-confirmed reviewer alias.

Email, phone number or other private attributes must never be guessed from a Google profile.

### Deterministic gates

Before any probability is considered:

- the brand/location mapping must be verified;
- the booking must be a real record in the configured source;
- at least two independent evidence types must agree, including booking/trip context;
- there must be no hard contradiction such as travel occurring after the review;
- a previous human decision may not be replaced automatically.

### Probabilistic score

Use a calibrated logistic or Bayesian matcher trained only on resolved Leatherback decisions. An initial heuristic can rank work but must not be presented as empirically calibrated. Candidate signals should be logged as separate, explainable contributions.

Suggested initial ranking weights:

| Signal | Directional weight |
| --- | ---: |
| Exact normalised full name | 0.35 |
| Surname plus first-name/initial similarity | 0.20 |
| Travel-to-review time proximity | 0.15 |
| Trip or destination evidence | 0.15 |
| Verified brand match | 0.10 |
| Unique viable booking | 0.05 |

Penalise common names, several plausible bookings, contradictory trip details and weak reviewer identity. Recalibrate thresholds on a held-out labelled set and monitor Brier score/reliability, not accuracy alone.

### Decision thresholds

- **Auto-assignment candidate:** probability at least `0.94`, all deterministic gates pass, exactly one viable candidate and at least `0.15` margin over the runner-up.
- **Human review:** probability `0.70–0.94`, narrow candidate margin, a common name, or any meaningful ambiguity.
- **Unmatched:** below `0.70` or no viable booking.

For the first production phase, keep even high-confidence assignments in confirmation mode until a representative labelled sample validates precision. Optimise for false-positive avoidance: an unmatched review is inconvenient; a review written to the wrong guest is a data integrity failure.

### Human review feed

The queue shows brand, rating, date, a policy-permitted excerpt and ranked candidate bookings. For each candidate it explains supporting signals, contradictions, confidence and whether the threshold was calibrated or heuristic.

An operator can:

- assign to a candidate;
- search for another guest/booking;
- mark as not identifiable;
- ignore a non-guest or irrelevant review;
- defer pending more information;
- correct a previous assignment.

Each decision records actor, time, old value, new value and reason. Corrections become training labels only after validation; model learning is never immediate and uncontrolled.

## Airtable write policy

Use a dedicated, least-privilege Airtable personal access token or a scoped TRTL service API. Do not reuse HR or general administrator credentials.

### Schema discovery

Before enabling writes, verify exact base, table and field IDs and inspect the type and existing meaning of `External Review Score`. Never assume a field name identifies its semantics. Complete a dry read, a single marked test record, verification and cleanup before processing live reviews.

### Preferred data model

Create a dedicated External Reviews table when one does not already exist, containing only policy-permitted fields:

- unique provider review ID;
- source and brand;
- provider URL;
- rating and review date;
- linked guest, booking and trip;
- match confidence and method;
- decision actor and timestamp.

The guest's `External Review Score` should preferably be a rollup/average of linked, verified review ratings, accompanied by review count. If it is a plain numeric field, recompute the approved aggregate from linked review records. Do not silently overwrite it with the latest rating.

### Transaction behaviour

1. Upsert the External Review record using the immutable provider review ID.
2. Confirm the upsert response and linked guest.
3. Recompute and patch the guest score if required.
4. Record both results in the BotSwarm decision/feed history.
5. If step 3 fails, retain a retryable `write_failed` state; do not report success.

Batch no more than ten Airtable records per request, pace requests within Airtable's base limit, use exponential backoff for rate limits, and attach an idempotency key to internal jobs. Never expose the Airtable token or raw payload in the browser or operational logs.

## Sentiment analysis

Sentiment answers operational questions; it does not determine who a reviewer is.

### Deterministic layer

- star-rating prior mapped consistently to positive, neutral and negative;
- language-aware sentiment lexicon with negation and intensifiers;
- aspect dictionaries for guide, accommodation, food, itinerary, transport, booking support, value and safety;
- explicit escalation patterns for safety, injury, discrimination, fraud, refund and chargeback;
- entity extraction for known trip and destination names;
- deterministic `reply_needed` and response-SLA rules.

Critical safety or financial patterns always create a review item regardless of the blended sentiment score.

### Probabilistic layer

Use a versioned, calibrated classifier for overall and aspect sentiment. A structured-output language model may supplement it for multilingual nuance, emotion, urgency and concise summaries, provided the data-processing agreement permits review content and the response validates against a strict schema.

The model must return confidence, model/version and per-aspect evidence. It may not match a guest, update Airtable, publish a reply or make a public claim.

### Ensemble

An initial text-bearing review can combine:

- 45% star-rating prior;
- 20% deterministic lexicon score;
- 35% calibrated probabilistic classifier.

Rating-only reviews use the rating prior. When components strongly disagree or confidence is low, label the result `uncertain`. Deterministic critical-risk rules override the blended classification.

Evaluate on a separately labelled, representative sample using class precision/recall/F1, calibration/Brier score, per-language performance, aspect performance and human disagreement. Report model changes and back-tests before promotion.

## Feed and audit behaviour

BotSwarm presents append-only events for review detected, candidate generated, assignment proposed, human decision, Airtable update, correction, provider failure and policy retention purge. General feed metadata must be redacted: no tokens, contact details, full provider payloads or unrestricted free text.

The UI separates:

- active bot health and next run;
- items needing a person;
- immutable run history;
- redacted operational feed;
- configuration health without secret values.

## Production blockers

Review Keeper must remain read-only or demonstrative until all applicable blockers are cleared:

- Google Cloud Business Profile API access has been approved and quota is non-zero;
- the OAuth account manages every intended verified location;
- the explicit location-to-brand map is complete;
- Google client credentials and refresh token are stored in Vercel production secrets;
- `CRON_SECRET` is configured and the route is independently protected;
- a guest/booking Airtable or TRTL service interface and exact field IDs are supplied;
- `External Review Score` semantics and any review-log table are verified;
- Airtable write scope and rollback procedure are approved;
- the probabilistic processor has approved data-handling terms;
- retention and long-term sentiment use have passed the Google policy/legal review.

The absence of credentials or source data must be shown as `connection required`, never replaced with invented live results.
