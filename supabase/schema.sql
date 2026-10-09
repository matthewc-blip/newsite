-- MCC Solutions booking database for Supabase (Postgres).
-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- (The server also creates these tables on first start if they are missing.)

create table if not exists settings (
  key text primary key,
  value jsonb not null
);

create table if not exists notaries (
  id integer generated always as identity primary key,
  name text not null,
  email text,
  phone text,
  states text default '',
  ron integer default 0,
  rin integer default 0,
  active integer default 1,
  notes text default '',
  created_at timestamptz default now()
);

create table if not exists bookings (
  id integer generated always as identity primary key,
  ref text unique not null,
  token text not null,
  service text not null check (service in ('mobile','ron','rin')),
  category text not null,
  is_loan integer default 0,
  signers integer default 1,
  start_utc timestamptz not null,
  end_utc timestamptz not null,
  customer_tz text,
  address text, city text, state text, zip text,
  signer_location text, signer_state text,
  in_us integer,
  mailing_address text,
  docs_delivery text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text not null,
  signer_names text, company text, file_number text, notes text,
  est_fee double precision,
  quoted_fee double precision,
  status text not null default 'requested'
    check (status in ('requested','confirmed','assigned','completed','canceled','no_show')),
  notary_id integer references notaries(id) on delete set null,
  internal_notes text default '',
  source text default 'web',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_bookings_start on bookings(start_utc);
create index if not exists idx_bookings_service on bookings(service, status);

create table if not exists booking_events (
  id integer generated always as identity primary key,
  booking_id integer not null references bookings(id) on delete cascade,
  at timestamptz default now(),
  actor text,
  text text
);
create index if not exists idx_events_booking on booking_events(booking_id);

create table if not exists applications (
  id integer generated always as identity primary key,
  data jsonb not null,
  status text default 'new',
  created_at timestamptz default now()
);

create table if not exists messages (
  id integer generated always as identity primary key,
  name text, email text, topic text, message text,
  handled integer default 0,
  created_at timestamptz default now()
);

-- Lock the tables away from Supabase's public API (anon/authenticated keys).
-- Only your server, which connects with the database password, can read or write them.
alter table settings enable row level security;
alter table notaries enable row level security;
alter table bookings enable row level security;
alter table booking_events enable row level security;
alter table applications enable row level security;
alter table messages enable row level security;

-- ===== Notary onboarding, assignments and payouts (added in v2; safe to re-run) =====
alter table notaries add column if not exists commission_number text;
alter table notaries add column if not exists commission_expires date;
alter table notaries add column if not exists eo_amount text;
alter table notaries add column if not exists eo_expires date;
alter table notaries add column if not exists background_date date;
alter table notaries add column if not exists agreement_name text;
alter table notaries add column if not exists agreement_at timestamptz;
alter table notaries add column if not exists agreement_ip text;
alter table notaries add column if not exists agreement_version text;
alter table notaries add column if not exists sms_ok integer default 1;
alter table notaries add column if not exists last_login_at timestamptz;
create unique index if not exists idx_notaries_email on notaries (lower(email)) where email is not null and email <> '';

alter table bookings add column if not exists notary_status text;          -- offered | accepted | declined
alter table bookings add column if not exists notary_fee double precision;  -- what you pay the notary
alter table bookings add column if not exists notary_paid_at timestamptz;
alter table bookings add column if not exists notary_responded_at timestamptz;
alter table bookings add column if not exists return_tracking text;
alter table bookings add column if not exists completed_at timestamptz;
alter table bookings add column if not exists offer_count integer default 0;

create table if not exists notary_documents (
  id integer generated always as identity primary key,
  notary_id integer not null references notaries(id) on delete cascade,
  kind text not null check (kind in ('commission','eo','background','w9','certification','other')),
  filename text not null,
  content_type text not null,
  size_bytes integer not null,
  storage text not null default 'db',     -- 'db' or 'supabase'
  path text,                              -- object path when storage = 'supabase'
  data bytea,                             -- file bytes when storage = 'db'
  uploaded_by text,
  uploaded_at timestamptz default now()
);
create index if not exists idx_docs_notary on notary_documents(notary_id);

create table if not exists notary_login_tokens (
  token_hash text primary key,
  notary_id integer not null references notaries(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists reminders_sent (
  notary_id integer not null references notaries(id) on delete cascade,
  kind text not null,          -- commission | eo | background
  threshold text not null,     -- 30d | 7d | expired
  for_date date not null,      -- the expiration date this reminder was about
  sent_at timestamptz default now(),
  primary key (notary_id, kind, threshold, for_date)
);

alter table notary_documents enable row level security;
alter table notary_login_tokens enable row level security;
alter table reminders_sent enable row level security;

-- ===== Documents, client accounts and auto-dispatch (added in v3; safe to re-run) =====
create table if not exists client_accounts (
  id integer generated always as identity primary key,
  company text not null,
  phone text,
  billing_email text,
  instructions text default '',        -- standing signing/return instructions shown to notaries
  notes text default '',               -- desk-only notes
  active integer default 1,
  created_at timestamptz default now()
);

create table if not exists client_users (
  id integer generated always as identity primary key,
  account_id integer not null references client_accounts(id) on delete cascade,
  name text not null,
  email text not null,
  active integer default 1,
  last_login_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists idx_client_users_email on client_users (lower(email));

create table if not exists client_login_tokens (
  token_hash text primary key,
  user_id integer not null references client_users(id) on delete cascade,
  expires_at timestamptz not null
);

create table if not exists booking_documents (
  id integer generated always as identity primary key,
  booking_id integer not null references bookings(id) on delete cascade,
  kind text not null check (kind in ('package','scanback','other')),
  filename text not null,
  content_type text not null,
  size_bytes integer not null,
  storage text not null default 'db',
  path text,
  data bytea,
  uploaded_by text not null,           -- client | desk | notary
  uploaded_by_name text,
  review_status text,                  -- scanbacks: pending | approved | rejected
  review_note text,
  reviewed_at timestamptz,
  downloaded_at timestamptz,           -- first time the notary downloaded a package file
  purged_at timestamptz,               -- file contents deleted under the retention policy
  created_at timestamptz default now()
);
create index if not exists idx_bdocs_booking on booking_documents(booking_id);

alter table bookings add column if not exists client_account_id integer references client_accounts(id) on delete set null;
alter table bookings add column if not exists client_user_id integer references client_users(id) on delete set null;
alter table bookings add column if not exists scanback_status text;      -- pending | approved | rejected
alter table bookings add column if not exists auto_dispatch integer default 0;
alter table bookings add column if not exists offer_expires_at timestamptz;
alter table bookings add column if not exists declined_notary_ids integer[] default '{}';

alter table notaries add column if not exists home_zip text;
alter table notaries add column if not exists travel_miles integer default 30;

alter table client_accounts enable row level security;
alter table client_users enable row level security;
alter table client_login_tokens enable row level security;
alter table booking_documents enable row level security;

-- ===== State-specific notary attestations (added in v4; safe to re-run) =====
alter table notaries add column if not exists attestations jsonb default '{}'::jsonb;

-- ===== Billing (added in v5; safe to re-run) =====
alter table client_accounts add column if not exists payment_terms_days integer default 30;
alter table bookings add column if not exists proof_link text;               -- the Proof session link for a RON booking
alter table bookings add column if not exists proof_sent_at timestamptz;      -- when the join email last went to the client
alter table bookings add column if not exists notarial_fee double precision;   -- state-capped notarial portion of the client price
alter table bookings add column if not exists invoice_id integer;

create table if not exists invoices (
  id integer generated always as identity primary key,
  client_account_id integer references client_accounts(id) on delete set null,
  bill_to_name text not null,
  bill_to_email text not null,
  number text,
  invoice_date date not null,
  due_date date not null,
  period_start date,
  period_end date,
  amount double precision not null,
  status text not null default 'draft',        -- draft | open | paid | void
  provider text not null default 'manual',     -- stripe | manual
  payment_url text,
  sent_at timestamptz,
  paid_at timestamptz,
  last_synced_at timestamptz,
  error text,
  created_at timestamptz default now()
);
create table if not exists invoice_items (
  id integer generated always as identity primary key,
  invoice_id integer not null references invoices(id) on delete cascade,
  booking_id integer references bookings(id) on delete set null,
  name text not null,
  quantity double precision not null default 1,
  unit_price double precision not null
);
create index if not exists idx_invoice_items_invoice on invoice_items(invoice_id);
alter table invoices enable row level security;
alter table invoice_items enable row level security;

-- ===== Stripe billing ids (added in v6; safe to re-run) =====
alter table client_accounts add column if not exists stripe_customer_id text;
alter table invoices add column if not exists stripe_invoice_id text;

-- ===== Card on file for individuals + review requests (added in v7; safe to re-run) =====
alter table bookings add column if not exists stripe_customer_id text;
alter table bookings add column if not exists stripe_payment_method_id text;
alter table bookings add column if not exists card_brand text;
alter table bookings add column if not exists card_last4 text;
alter table bookings add column if not exists card_saved_at timestamptz;
alter table bookings add column if not exists checkout_session_id text;
alter table invoices add column if not exists stripe_payment_intent_id text;

create table if not exists review_requests (
  id integer generated always as identity primary key,
  booking_id integer references bookings(id) on delete set null,
  email text not null,
  sent_at timestamptz default now()
);
create index if not exists idx_review_requests_email on review_requests (lower(email), sent_at);
create table if not exists review_optouts (
  email text primary key,
  at timestamptz default now()
);
alter table bookings add column if not exists review_requested_at timestamptz;
alter table review_requests enable row level security;
alter table review_optouts enable row level security;

-- ===== Checkout add-ons (added in v8; safe to re-run) =====
alter table bookings add column if not exists addons jsonb default '[]'::jsonb;
alter table bookings add column if not exists addons_total double precision default 0;

-- ===== Witnesses (added in v9; safe to re-run) =====
alter table notaries add column if not exists role text default 'notary';   -- notary | witness
alter table notary_documents drop constraint if exists notary_documents_kind_check;
alter table notary_documents add constraint notary_documents_kind_check
  -- one list for every version: the schema re-runs on each start, so this must allow every kind ever stored
  check (kind in ('commission','eo','background','w9','certification','other','id','license','registration','auto_insurance'));
create table if not exists booking_witnesses (
  id integer generated always as identity primary key,
  booking_id integer not null references bookings(id) on delete cascade,
  witness_id integer not null references notaries(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered','accepted','declined','removed')),
  fee double precision,
  paid_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz default now()
);
create unique index if not exists idx_booking_witnesses_pair on booking_witnesses(booking_id, witness_id);
create index if not exists idx_booking_witnesses_witness on booking_witnesses(witness_id);
alter table booking_witnesses enable row level security;

-- ===== Service requests + process servers (added in v10; safe to re-run) =====
alter table notaries add column if not exists license_expires date;
alter table notaries add column if not exists vehicle_reg_expires date;
alter table notaries add column if not exists auto_insurance_expires date;
-- (document kinds for process servers are in the v9 constraint above, so re-running never trips on them)

create table if not exists service_requests (
  id integer generated always as identity primary key,
  ref text unique not null,
  type text not null,
  status text not null default 'new' check (status in ('new','quoted','in_progress','completed','canceled')),
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  company text,
  client_account_id integer references client_accounts(id) on delete set null,
  details jsonb default '{}'::jsonb,
  notes text,
  due_date date,
  fee double precision,              -- what the client pays
  vendor_cost double precision,      -- partner/third-party cost (recording fees, translator, shredder…)
  assignee_id integer references notaries(id) on delete set null,
  assignee_status text,              -- offered | accepted | declined
  assignee_fee double precision,
  assignee_paid_at timestamptz,
  internal_notes text default '',
  invoice_id integer references invoices(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_service_requests_status on service_requests(status);
create index if not exists idx_service_requests_assignee on service_requests(assignee_id);

create table if not exists request_events (
  id integer generated always as identity primary key,
  request_id integer not null references service_requests(id) on delete cascade,
  at timestamptz default now(),
  actor text,
  text text
);
create index if not exists idx_request_events on request_events(request_id);

create table if not exists request_attempts (
  id integer generated always as identity primary key,
  request_id integer not null references service_requests(id) on delete cascade,
  at timestamptz not null,
  result text not null check (result in ('served','not_home','refused','bad_address','other')),
  served_to text,
  description text,
  by_name text,
  created_at timestamptz default now()
);
create index if not exists idx_request_attempts on request_attempts(request_id);

create table if not exists request_documents (
  id integer generated always as identity primary key,
  request_id integer not null references service_requests(id) on delete cascade,
  kind text not null check (kind in ('papers','proof','other')),
  filename text not null,
  content_type text not null,
  size_bytes integer not null,
  storage text not null default 'db',
  path text,
  data bytea,
  uploaded_by text not null,
  uploaded_by_name text,
  created_at timestamptz default now()
);
create index if not exists idx_request_documents on request_documents(request_id);
alter table invoice_items add column if not exists request_id integer references service_requests(id) on delete set null;

alter table service_requests enable row level security;
alter table request_events enable row level security;
alter table request_attempts enable row level security;
alter table request_documents enable row level security;

-- ===== Law firm features (added in v11; safe to re-run) =====
-- client's own file / matter number, who at the client account placed it, one-time upload link for the public form,
-- and whether the customer gets an email for each logged attempt
alter table service_requests add column if not exists client_ref text;
alter table service_requests add column if not exists client_user_id integer references client_users(id) on delete set null;
alter table service_requests add column if not exists upload_token_hash text;
alter table service_requests add column if not exists upload_token_expires timestamptz;
alter table service_requests add column if not exists notify_attempts integer default 1;
create index if not exists idx_service_requests_client on service_requests(client_account_id);

-- ===== Extra fees and late fees (added in v12; safe to re-run) =====
-- extra fees live in bookings.addons (kind "fee"); requests get the same kind of list
alter table invoices add column if not exists late_fee_at timestamptz;
alter table service_requests add column if not exists extras jsonb default '[]'::jsonb;
alter table service_requests add column if not exists extras_total double precision default 0;

-- ===== Bookkeeping leads (added in v13; safe to re-run) =====
-- intake from the bookkeeping page: answers (platform, volume, needs), the estimate at the time, pipeline status,
-- the desk's quote and notes, and which onboarding checklist items are done
create table if not exists bookkeeping_leads (
  id integer generated always as identity primary key,
  data jsonb not null,
  estimate jsonb,
  status text default 'new',
  quote_monthly double precision,
  notes text default '',
  done jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_bookkeeping_status on bookkeeping_leads(status);
alter table bookkeeping_leads enable row level security;

-- ===== Self-service business accounts (added in v14; safe to re-run) =====
-- accounts created by the business itself start unapproved: they can sign in but not order until the desk approves
alter table client_accounts add column if not exists approved integer default 1;
alter table client_accounts add column if not exists source text default 'desk';

-- ===== Passkeys: required second factor for client users and notaries (added in v15; safe to re-run) =====
-- kind is 'client' (client_users) or 'portal' (notaries, witnesses and process servers). Credentials hold only a public key.
create table if not exists passkeys (
  id integer generated always as identity primary key,
  kind text not null check (kind in ('client','portal')),
  subject_id integer not null,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text,
  name text,
  created_at timestamptz default now(),
  last_used_at timestamptz
);
create index if not exists idx_passkeys_subject on passkeys (kind, subject_id);
alter table passkeys enable row level security;

-- ===== Admin account (added in v16; safe to re-run) =====
-- The dashboard login lives here, not in an environment variable: one fixed owner email, a password hash, and a passkey (kind 'admin' in passkeys).
-- Recovery: to wipe the passkey, run  delete from passkeys where kind = 'admin';  then request a setup link on the sign-in page.
alter table passkeys drop constraint if exists passkeys_kind_check;
alter table passkeys add constraint passkeys_kind_check check (kind in ('client','portal','admin'));
create table if not exists admin_users (
  id integer generated always as identity primary key,
  email text not null unique,
  password_hash text,
  session_epoch integer not null default 1,   -- bump to sign every dashboard session out
  failed_logins integer not null default 0,
  locked_until timestamptz,
  password_set_at timestamptz,
  created_at timestamptz default now()
);
create table if not exists admin_setup_tokens (
  token_hash text primary key,
  admin_id integer not null references admin_users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);
alter table admin_users enable row level security;
alter table admin_setup_tokens enable row level security;

-- ===== Backup codes and security log (added in v17; safe to re-run) =====
-- One-time codes that let a person who lost their passkey register a new one. Only salted scrypt hashes are stored.
create table if not exists backup_codes (
  id integer generated always as identity primary key,
  kind text not null check (kind in ('client','portal')),
  subject_id integer not null,
  salt text not null,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_backup_codes_subject on backup_codes (kind, subject_id);
-- Who reset or recovered what, and how identity was checked.
create table if not exists security_events (
  id integer generated always as identity primary key,
  kind text not null,
  subject_id integer,
  subject_label text,
  action text not null,
  method text,
  note text,
  created_at timestamptz default now()
);
alter table backup_codes enable row level security;
alter table security_events enable row level security;

-- ===== Passwords for client users and notaries (added in v18; safe to re-run) =====
-- Sign-in is now email + password, then a passkey. The emailed link only proves the address, to set or reset the password.
alter table client_users add column if not exists password_hash text;
alter table client_users add column if not exists password_set_at timestamptz;
alter table client_users add column if not exists failed_logins integer not null default 0;
alter table client_users add column if not exists locked_until timestamptz;
alter table notaries add column if not exists password_hash text;
alter table notaries add column if not exists password_set_at timestamptz;
alter table notaries add column if not exists failed_logins integer not null default 0;
alter table notaries add column if not exists locked_until timestamptz;

-- ===== "How did you find us?" (added in v19; safe to re-run) =====
alter table bookings add column if not exists heard_from text;
alter table bookings add column if not exists heard_note text;
alter table messages add column if not exists heard_from text;
alter table messages add column if not exists heard_note text;
alter table service_requests add column if not exists heard_from text;
alter table service_requests add column if not exists heard_note text;

-- ===== Unfinished-booking reminder and callback requests (safe to re-run) =====
create table if not exists booking_drafts (
  email text primary key,
  name text, service text, category text,
  created_at timestamptz default now(),
  reminded_at timestamptz
);
create table if not exists followup_optouts (
  email text primary key,
  at timestamptz default now()
);
alter table booking_drafts enable row level security;
alter table followup_optouts enable row level security;

-- ===== Remote sessions: Zoom meeting + Persona ID check + 3-day paper deadline (safe to re-run) =====
create table if not exists remote_sessions (
  id serial primary key,
  ref text unique not null,
  booking_id integer,
  signer_name text not null,
  signer_email text,
  signer_phone text,
  signer_location text,
  doc_title text,
  act text default 'jurat',
  scheduled_at timestamptz,
  status text default 'scheduled',
  zoom_meeting_id text, zoom_join_url text, zoom_start_url text, zoom_passcode text,
  persona_inquiry_id text, persona_status text, persona_link text, persona_checked_at timestamptz,
  id_method text,
  witness_name text,
  recording_ref text, recording_url text, recording_passcode text, recording_at timestamptz,
  session_ended_at timestamptz,
  paper_due_at timestamptz,
  paper_received_at timestamptz,
  tracking text,
  checklist jsonb default '{}'::jsonb,
  notes text,
  deadline_alerted boolean default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);
alter table remote_sessions add column if not exists archive_error text;  -- last fingerprint/archive failure, shown on the card
alter table remote_sessions enable row level security;

-- Tamper-evidence: SHA-256 fingerprints of recordings and signed papers (safe to re-run)
create table if not exists remote_hashes (
  id serial primary key,
  session_id integer not null references remote_sessions(id) on delete cascade,
  kind text not null,          -- recording, transcript, signed_paper, notarized_copy, other
  filename text,
  size_bytes bigint,
  sha256 text not null,
  source text default 'manual', -- zoom (hashed by the server when Zoom finished recording) or manual
  created_at timestamptz default now()
);
alter table remote_hashes add column if not exists stored_key text;          -- object key in the R2 bucket
alter table remote_hashes add column if not exists stored_at timestamptz;
alter table remote_hashes add column if not exists stored_verified boolean;   -- stored copy was read back and matched the fingerprint
alter table remote_hashes add column if not exists retain_until date;         -- 10-year retention target (the bucket lock enforces it)
create index if not exists remote_hashes_session on remote_hashes(session_id);
alter table remote_hashes enable row level security;

-- ===== Bookkeeping billing (added in v20; safe to re-run) =====
-- Invoices for bookkeeping clients hang off the lead instead of a booking. period_key ("2026-10") makes a monthly invoice happen once per month.
alter table invoices add column if not exists kind text default 'notary';
alter table invoices add column if not exists bk_lead_id integer;
alter table invoices add column if not exists period_key text;
create unique index if not exists uq_invoices_bk_period on invoices(bk_lead_id, period_key) where period_key is not null and status <> 'void';
alter table bookkeeping_leads add column if not exists bill_auto boolean default false;      -- send the monthly invoice automatically
alter table bookkeeping_leads add column if not exists bill_day integer default 1;            -- day of the month it goes out (1 to 28)
alter table bookkeeping_leads add column if not exists bill_terms integer default 10;         -- days to pay
alter table bookkeeping_leads add column if not exists bill_since date;                       -- automatic billing starts with the first bill date on or after this day
alter table bookkeeping_leads add column if not exists bill_email text;                       -- where invoices go, if not the lead's email
alter table bookkeeping_leads add column if not exists stripe_customer_id text;
