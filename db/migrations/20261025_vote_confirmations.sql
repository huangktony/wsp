-- Apply manually after team review. Additive and idempotent; nothing is backfilled.
-- Older final rounds stay unconfirmed until the organizer confirms them.
create table if not exists vote_confirmations (
  round_id int references plan_rounds(id) on delete cascade,
  user_id int references users(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (round_id, user_id)
);
alter table plan_rounds add column if not exists confirmed_at timestamptz;
alter table plan_rounds add column if not exists confirmed_by int references users(id);
