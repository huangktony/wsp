-- Review and apply manually. This migration has NOT been run.
-- Optional fields: old deployments continue to use the existing setup/plan builders.
alter table memberships add column if not exists preferences jsonb;
-- Atomic attempt claims and validated results, separated into hangout/travel keys.
alter table plan_rounds add column if not exists gemini_state jsonb;
