-- US spell check for the US-market brands (Nicola, 9 Sep). A scan of every
-- template those brands send found two British spellings still in the copy:
-- "cancelled" in the cancellation subject and body, and "favourite" in the
-- confirmation, feedback and reminder templates.
--
-- Send-time correction now exists too (toAmericanEnglish in english.ts), but
-- the stored copy is what a Pod Lead reads and edits in Guest Communications,
-- so it should be right at rest as well.
--
-- Scoped to brands where market = 'US', and done with targeted word
-- replacement so any other edit a Pod Lead has made is preserved. Whole words
-- only: "cancellation" keeps its double l in US English.
update booking.message_template t
   set subject = regexp_replace(subject, '\mcancelled\M', 'canceled', 'g'),
       body_html = regexp_replace(body_html, '\mcancelled\M', 'canceled', 'g')
  from booking.brand b
 where b.id = t.brand_id
   and b.market = 'US'
   and (subject ~ '\mcancelled\M' or body_html ~ '\mcancelled\M');

update booking.message_template t
   set subject = regexp_replace(subject, '\mCancelled\M', 'Canceled', 'g'),
       body_html = regexp_replace(body_html, '\mCancelled\M', 'Canceled', 'g')
  from booking.brand b
 where b.id = t.brand_id
   and b.market = 'US'
   and (subject ~ '\mCancelled\M' or body_html ~ '\mCancelled\M');

update booking.message_template t
   set subject = regexp_replace(subject, '\mfavourite\M', 'favorite', 'g'),
       body_html = regexp_replace(body_html, '\mfavourite\M', 'favorite', 'g')
  from booking.brand b
 where b.id = t.brand_id
   and b.market = 'US'
   and (subject ~ '\mfavourite\M' or body_html ~ '\mfavourite\M');

update booking.message_template t
   set subject = regexp_replace(subject, '\mFavourite\M', 'Favorite', 'g'),
       body_html = regexp_replace(body_html, '\mFavourite\M', 'Favorite', 'g')
  from booking.brand b
 where b.id = t.brand_id
   and b.market = 'US'
   and (subject ~ '\mFavourite\M' or body_html ~ '\mFavourite\M');
