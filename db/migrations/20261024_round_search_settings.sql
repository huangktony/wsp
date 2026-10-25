-- Apply manually after team review, after 20261024_round_search_context.sql.
-- No default/backfill: older rounds are marked out of date until regenerated.
alter table plan_rounds add column if not exists search_settings jsonb;
