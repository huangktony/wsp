-- Review/apply manually. This file has NOT been applied by the assistant.
-- Group coordinates remain NOT NULL and are geocoded during creation.

-- Legacy rounds intentionally keep NULL search_city: their true origin is unknown.
-- Reads fall back to the group city for legacy rounds; new rounds snapshot their search city.
alter table plan_rounds add column if not exists search_city text;
alter table plan_rounds add column if not exists search_distance_mi int;
alter table plan_rounds add column if not exists sample_places boolean;
alter table plan_rounds add column if not exists search_error text;
