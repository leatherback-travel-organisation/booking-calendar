-- SMS consent for the US-market brands (Nicola, 8 Sep). US law wants express
-- written consent before a marketing or service text: an unchecked box the
-- guest ticks themselves, wording that says what they are agreeing to, and a
-- record of it. The booking form collects it; these columns are the record.
--
-- sms_consent_text stores the exact disclosure the guest saw, not a version
-- number: if the wording is ever revised, an old booking must still be able
-- to show what was actually on screen when its guest agreed.
alter table booking.booking
  add column if not exists sms_opt_in boolean not null default false,
  add column if not exists sms_opt_in_at timestamptz,
  add column if not exists sms_consent_text text;

-- Named in the disclosure, so it has to be a real page per brand rather than
-- a guessed path — Carex's lives at /privacy-page/, not /privacy-policy/.
alter table booking.brand
  add column if not exists privacy_policy_url text;

update booking.brand set privacy_policy_url = 'https://harrietadventures.com/privacy-policy/' where key = 'harriet';
update booking.brand set privacy_policy_url = 'https://carexdesign.com/privacy-page/' where key = 'carex';
update booking.brand set privacy_policy_url = 'https://saltcaravan.com/privacy-policy/' where key = 'salt-caravan';
