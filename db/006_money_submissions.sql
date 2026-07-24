create table if not exists money_submissions (
  id uuid primary key,
  reference text not null unique,
  employee_name text not null,
  employee_email text not null,
  kind text not null check (kind in ('invoice', 'reimbursement')),
  title text not null,
  description text not null default '',
  amount numeric(14, 2) not null check (amount > 0 and amount <= 1000000),
  currency text not null check (currency in ('USD', 'EUR', 'GBP', 'ZAR', 'BWP', 'KES', 'TZS', 'UGX')),
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'in_review', 'action_required', 'approved', 'scheduled', 'paid', 'declined')),
  transaction_date date,
  due_date date,
  counterparty text not null default '',
  category text not null default '',
  invoice_number text not null default '',
  attachment_name text not null,
  attachment_content_type text not null check (attachment_content_type in ('application/pdf', 'image/jpeg', 'image/png')),
  attachment_base64 text not null,
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists money_submissions_employee_email_idx
  on money_submissions (lower(employee_email), updated_at desc);

create index if not exists money_submissions_status_idx
  on money_submissions (status, updated_at desc);
