-- Guest emails leaned hard on em dashes (Nicola, 26 Aug: too many). Same
-- phrase rewrites as the code defaults and the seed script, applied to the
-- live template rows, then a catch-all so no " — " reaches a guest at all.

update booking.message_template set
  subject = replace(replace(replace(replace(subject,
    ' — your ', ', your '),
    'Tomorrow''s the day — your', 'Tomorrow''s the day: your'),
    'All sorted — new time', 'All sorted. New time'),
    ' — ', ', '),
  body_html = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(body_html,
    ' — your ', ', your '),
    ') — we''ve set aside', '). We''ve set aside'),
    'Life happens — you', 'Life happens. You'),
    '</a> — takes seconds', '</a>. Takes seconds'),
    ' — about an hour from now', ', about an hour from now'),
    'is cancelled — all taken care of', 'is cancelled. All taken care of'),
    'Just a friendly nudge — you', 'Just a friendly nudge: you'),
    ' for you — expectations', ' for you: expectations'),
    'go next — no commitments', 'go next: no commitments'),
    'none at all — that''s', 'none at all; that''s'),
    'your trip went — the stories', 'your trip went: the stories'),
    'Cancel</a> — whatever works', 'Cancel</a>, whatever works'),
    ' — ', ', ')
where subject like '% — %' or body_html like '% — %';

insert into booking.audit_log (actor, action, subject, detail)
values ('migration:046', 'templates_dedashed', 'all',
        jsonb_build_object('note', 'em dashes replaced with plainer punctuation in guest templates'));

-- Cancellation prose fixes (same pass, Nicola 26 Aug): brands without a
-- phone rendered "call Harriet Adventures on ," — drop the phone clause and
-- make "book a new time" the booking link itself. Two capitalisations exist
-- in the seeded rows (sentence-start and mid-sentence).
update booking.message_template set
  body_html = replace(replace(body_html,
    'we''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.',
    'you can <a href="{{booking.book_link}}">book a new time</a> whenever suits you.'),
    'We''re easy to reach: call {{brand.name}} on {{brand.phone}}, or book a new time whenever suits you.',
    'You can <a href="{{booking.book_link}}">book a new time</a> whenever suits you.')
where body_html like '%call {{brand.name}} on {{brand.phone}}%';
