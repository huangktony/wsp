create table if not exists users (
  id serial primary key,
  name text not null,
  email text unique not null,
  password_hash text not null,
  nessie_customer_id text,
  nessie_account_id text,
  budget_tier text,
  avg_outing_cost numeric,
  max_distance_mi int not null default 10,
  interests text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists groups (
  id serial primary key,
  name text not null,
  city text not null,
  lat double precision not null,
  lng double precision not null,
  invite_code text unique not null,
  created_by int references users(id),
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  group_id int references groups(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  availability jsonb not null default '[]',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists plan_rounds (
  id serial primary key,
  group_id int references groups(id) on delete cascade,
  status text not null default 'generating',
  group_tier text,
  winner_plan_id int,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id serial primary key,
  round_id int references plan_rounds(id) on delete cascade,
  title text not null,
  summary text not null,
  stops jsonb not null,
  est_cost_per_person numeric not null,
  price_level text,
  why_fits text
);

create table if not exists votes (
  plan_id int references plans(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  value text not null check (value in ('approve','pass')),
  primary key (plan_id, user_id)
);

create table if not exists payments (
  id serial primary key,
  round_id int references plan_rounds(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  amount numeric not null,
  status text not null default 'owed' check (status in ('owed','paid')),
  unique (round_id, user_id)
);

-- Plans flow (screens 8-10). Safe to re-run on existing data.
alter table groups add column if not exists vote_hours int not null default 24;
alter table plan_rounds add column if not exists slot text;
alter table plan_rounds add column if not exists attempt int not null default 1;
alter table plan_rounds add column if not exists excluded text[] not null default '{}';
alter table plan_rounds add column if not exists vote_deadline timestamptz;
alter table plan_rounds add column if not exists payer_id int references users(id);
alter table plan_rounds add column if not exists split_mode text not null default 'even';
alter table plan_rounds add column if not exists requests_sent boolean not null default false;

create table if not exists stop_skips (
  round_id int references plan_rounds(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  stop_index int not null,
  primary key (round_id, user_id, stop_index)
);

alter table payments add column if not exists transfer_id text;

-- A member's own pick of comfort level for this group. null means use the suggestion from their spending (users.budget_tier).
alter table memberships add column if not exists comfort_tier text check (comfort_tier in ('$','$$','$$$'));

-- A member's vote to throw away a FINAL plan and redraw. Counts only while the round is final and the split requests are not sent.
create table if not exists redraw_votes (
  round_id int references plan_rounds(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  primary key (round_id, user_id)
);

-- Profile photo: small resized JPEG stored as a data URL (see lib/profile.ts). Null = default initial avatar.
alter table users add column if not exists avatar text;

-- Round search context; also available as a standalone migration in db/migrations/.
-- Group coordinates remain NOT NULL and are geocoded during creation.

-- Legacy rounds keep NULL search_city and resolve to Austin, TX in application code.
-- New rounds snapshot their search city; no database default or backfill.
alter table plan_rounds add column if not exists search_city text;
alter table plan_rounds add column if not exists search_distance_mi int;
alter table plan_rounds add column if not exists sample_places boolean;
alter table plan_rounds add column if not exists search_error text;

-- When money moved, so the Spending screen can list it, and when the payer last nudged someone who hasn't paid back.
alter table payments add column if not exists paid_at timestamptz;
alter table payments add column if not exists reminded_at timestamptz;
alter table plan_rounds add column if not exists requests_sent_at timestamptz;
alter table plan_rounds add column if not exists bill_total numeric;

-- Snapshot members' search preferences at round creation (server-only; never returned to clients).
alter table plan_rounds add column if not exists search_settings jsonb;-- WSP Travel: run manually via the documented db:migrate command. No existing data modified.
create table if not exists travel_trips (
 id serial primary key, name text not null, organizer_id int not null references users(id),
 invite_code text not null unique, candidates jsonb not null, revision int not null default 1,
 created_at timestamptz not null default now()
);
create table if not exists travel_members (
 trip_id int not null references travel_trips(id) on delete cascade,
 user_id int not null references users(id) on delete cascade,
 airport text, flight_budget numeric check (flight_budget > 0 and flight_budget <= 100000),
 joined_at timestamptz not null default now(), primary key(trip_id,user_id)
);
create table if not exists travel_comparisons (
 id serial primary key, trip_id int not null references travel_trips(id) on delete cascade,
 revision int not null, status text not null check (status in ('generating','voting','final','vetoed','failed','stale')),
 options jsonb not null default '[]', member_ids int[] not null, winner_id int,
 error text, created_at timestamptz not null default now(), checked_at timestamptz,
 expires_at timestamptz
);
create index if not exists travel_comparisons_trip on travel_comparisons(trip_id,id desc);
create table if not exists travel_votes (
 comparison_id int not null references travel_comparisons(id) on delete cascade,
 user_id int not null references users(id) on delete cascade,
 option_id int not null, value text not null check(value in ('approve','veto')),
 primary key(comparison_id,user_id,option_id)
);
