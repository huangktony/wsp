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
