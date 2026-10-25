-- WSP Travel: run manually via the documented db:migrate command. No existing data modified.
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
