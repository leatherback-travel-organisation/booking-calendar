alter table money_submissions
  drop constraint if exists money_submissions_kind_check;

alter table money_submissions
  add constraint money_submissions_kind_check
  check (kind in ('invoice', 'reimbursement', 'travel_credit'));

alter table money_submissions
  alter column attachment_name drop not null,
  alter column attachment_content_type drop not null,
  alter column attachment_base64 drop not null;
