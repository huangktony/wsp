-- Snapshot members' search preferences at round creation
-- (server-only; never returned to clients).
alter table plan_rounds add column if not exists search_settings jsonb;

-- Confirmed ballots: once a member confirms, their votes for that round are final.
-- Also in db/migrations/20261025_vote_confirmations.sql.
create table if not exists vote_confirmations (
  round_id int references plan_rounds(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

-- The organizer confirms the winning plan. Non-null confirmed_at = saved as final:
-- no redraw, and payment requests can be sent.
alter table plan_rounds add column if not exists confirmed_at timestamptz;
alter table plan_rounds add column if not exists confirmed_by int references users(id);

-- Nessie's status for the transfer behind a payment
-- ('completed', or 'pending' until Nessie executes it).
-- Refreshed when the split screen loads.
alter table payments add column if not exists transfer_status text;

-- WSP Travel: run manually via the documented db:migrate command.
-- No existing data modified.
create table if not exists travel_trips (
  id serial primary key,
  name text not null,
  organizer_id int not null references users(id),
  invite_code text not null unique,
  candidates jsonb not null,
  revision int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists travel_members (
  trip_id int not null references travel_trips(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  airport text,
  flight_budget numeric check (
    flight_budget > 0 and flight_budget <= 100000
  ),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create table if not exists travel_comparisons (
  id serial primary key,
  trip_id int not null references travel_trips(id) on delete cascade,
  revision int not null,
  status text not null check (
    status in ('generating', 'voting', 'final', 'vetoed', 'failed', 'stale')
  ),
  options jsonb not null default '[]',
  member_ids int[] not null,
  winner_id int,
  error text,
  created_at timestamptz not null default now(),
  checked_at timestamptz,
  expires_at timestamptz
);

create index if not exists travel_comparisons_trip
  on travel_comparisons (trip_id, id desc);

create table if not exists travel_votes (
  comparison_id int not null references travel_comparisons(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  option_id int not null,
  value text not null check (value in ('approve', 'veto')),
  primary key (comparison_id, user_id, option_id)
);