# WSP

A mobile-first web app for planning group hangouts everyone can afford. You link a demo bank account, join a group, and set when you're free. The app works out a private budget level ($, $$, $$$) from your spending, finds nearby places, writes 3 plans, and the group votes. Friends only ever see the group's lowest level, never anyone's purchases.

Built for HackTX 26.

## Setup (about 5 minutes)

You need two things installed first: **Node 22** and **Postgres** (on a Mac: `brew install node postgresql@17`).

Run these in the project folder, one at a time:

```
npm install
cp .env.example .env.local
createdb wsp
npm run db:setup
npm run dev
```

Then open http://localhost:3000 and tap **Continue with demo account**.

That's it. No API keys needed.

### Fill in `.env.local`

After `cp .env.example .env.local`, open `.env.local` and set these two lines:

```
DATABASE_URL=postgres://localhost:5432/wsp
SESSION_SECRET=any-long-random-text
```

Leave `USE_MOCKS=true`. That makes the app use fake data for the bank, places and AI, so it never breaks. To try the real services, add the keys (`NESSIE_API_KEY`, `SERPAPI_KEY`, `GEMINI_API_KEY`) and set `USE_MOCKS=false`.

### Using Tiger Data instead of local Postgres

1. Create a database (service) in Tiger Data and copy its connection string.
2. Put it in `.env.local` as `DATABASE_URL=...` (replace any password placeholder).
3. Create the tables: `npm run db:migrate`
4. Load the demo data: `npm run db:seed` (wipes the tables first, so only on a fresh database).
5. `npm run dev`

SSL is turned on automatically for any database that isn't on localhost. You don't need `createdb` for this.

### If something goes wrong

| Problem | Fix |
|---|---|
| `createdb: command not found` | Postgres isn't installed or isn't running. `brew install postgresql@17` then `brew services start postgresql@17` |
| `database "wsp" does not exist` | Run `createdb wsp` (local Postgres only) |
| SSL or certificate error with Tiger Data | Check the connection string was copied in full, then tell the team what the error says |
| "demo user missing" on the login screen | Run `npm run db:setup` |
| `npm error ... package.json` | You're in the wrong folder. `cd` into the project folder first |
| Want a clean slate | Run `npm run db:setup` again. It wipes the tables and re-adds the demo data |

## Demo login

`demo@wsp.app` / `demo1234`. The demo data has 4 people and 2 groups. "Friday Crew" already has plans open for voting.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the app on port 3000 |
| `npm run build` | Check that everything compiles |
| `npm run db:migrate` | Create the tables (safe on real data) |
| `npm run db:setup` | Create tables and load demo data (wipes existing data) |

## Where things are

| Folder | What's in it |
|---|---|
| `app/` | The screens and the API routes |
| `components/` | Shared pieces (tab bar, chart, logo) |
| `lib/` | The server logic: budget level, finding plans, and the Nessie, SerpApi and Gemini connections |
| `db/schema.sql` | The database tables |
| `scripts/` | Migration and demo data scripts |

## Sponsor map

| Sponsor | Where it is used |
|---|---|
| Capital One Nessie | `lib/nessie.ts` creates the demo bank account and reads purchases. `lib/tier.ts` turns them into a private budget level. |
| SerpApi | `lib/serpapi.ts` searches Google Maps for places near the group, skipping places above the group's level. |
| Gemini | `lib/gemini.ts` writes 3 plans using a fixed JSON format. It retries once, then falls back to mock plans. |
| Tiger Data | The Postgres database. Put its connection string in `DATABASE_URL`. |
| Vultr | Where the app is deployed. |
| .TECH | The domain name for the deployed app. |

## Privacy rules

- Raw purchases are only returned by `GET /api/me/spending`, and only to the signed-in owner.
- Group screens show names, setup status and the group's lowest level. Nothing else about other members.
- Only the group creator can lock in a plan. Payments are demo only. No money moves.

## Testing on phones (same Wi-Fi)

Run the built app on your laptop and open it from phones on the same Wi-Fi. No tunnels or public links.

1. Build it: `npm run build`
2. Start it on all network interfaces, with a random session secret (see the warning below):
   ```
   USE_MOCKS=false SESSION_SECRET="$(openssl rand -base64 32)" npx next start -H 0.0.0.0 -p 3000
   ```
   Leave off `USE_MOCKS=false` if you want mock data instead of live Nessie.
3. Find your laptop's IP: `ipconfig getifaddr en0` (Wi-Fi on a Mac). It looks like `10.x.x.x` or `192.168.x.x`.
4. On each phone, join the same Wi-Fi and open `http://<that-ip>:3000`.
5. The first time, macOS may ask whether to allow incoming connections for `node`. Click **Allow**.

Keep the laptop awake and on that Wi-Fi the whole time. If a phone cannot connect but `curl -I http://<that-ip>:3000/login` works on the laptop, the Wi-Fi is probably blocking device-to-device traffic (client isolation). Hackathon and campus Wi-Fi often does this. Try a phone hotspot that the laptop joins instead.

**Warning:** `-H 0.0.0.0` lets anyone on that network reach the app. If `SESSION_SECRET` is missing, the code falls back to a default that is public in this repo, and anyone could forge a login cookie. Always set a random one, as in step 2, and stop the server when you are done testing. The app uses plain http here, so do not reuse a real password.

## Deploying to Vultr

1. Create a Vultr cloud server (Ubuntu) and install Node 22.
2. Clone the repo and fill in `.env.local` with a real `SESSION_SECRET` and the Tiger Data `DATABASE_URL`.
3. Run `npm ci`, `npm run build`, then `npm run db:migrate`. Use `db:setup` only if you want demo data, since it wipes the tables.
4. Start with `npm start` under a process manager (pm2 or systemd), with Caddy or nginx in front for HTTPS.
5. Point the .TECH domain's A record at the server.

## Open items for the team

Search the code for these tags:

- `TODO(decision)`: palette (B is the default), fonts, which spending screen design wins, even split vs split by level, and a real city lookup.
- `TODO(verify)`: check the Nessie endpoints, the SerpApi response fields, and the Gemini model name against current docs. These have only been tested with mock data.

## Plans flow (screens 8-10)

Owned by person 4. Files: `app/groups/[id]/finding`, `plans`, `final`, `app/api/groups/[id]/plans|final|split`, `app/api/plans/[id]/vote`, `app/api/payments`, `lib/pipeline.ts`, `lib/slot.ts`.

- **Finding plans** picks the slot most members share, uses the group's lowest budget level, searches places and writes 3 plans. If two people open it at once they share one search.
- **Voting**: approve or veto each plan (tap again to undo). Tallies stay hidden until voting closes. Voting closes at the deadline (`groups.vote_hours`, default 24) or once everyone has voted on every plan. The creator can also tap **Close voting now**.
- **Winner** = most approvals, then fewest vetoes, then cheapest. If every plan was vetoed and none approved, the app makes new plans that leave out those places, and the deadline resets.
- **Split**: the creator pays up front and picks **Split evenly** or **By item**. Anyone can tick stops they'll skip. Sending requests locks the split. Paying back uses a Nessie transfer when both accounts are real.

Round status values (`plan_rounds.status`): `generating`, `voting`, `vetoed`, `final`, `failed`. Group screens can use these for the card status.

For person 2: the create-group voting deadline (6/12/24/48h) should be saved to `groups.vote_hours`.

### City-aware plan searches

Before starting new plan searches against an existing database, review and apply
`db/migrations/20261024_round_search_context.sql` through your normal database change process.
It leaves the existing NOT NULL coordinate constraints intact and records each round's city, distance limit,
sample-data flag, and safe search error. Existing rounds remain readable before the migration: optional fields are read through JSON,
and a missing/NULL search city resolves to Austin, TX (30.2672, -97.7431), as agreed
for legacy rounds. Stored round cities always take precedence. New searches require the migration to preserve their city snapshot.
The migration has not been applied by the assistant. `db:migrate` runs only the additive CREATE/ALTER statements currently in `db/schema.sql`
(but DDL can take locks). `db:seed` truncates all eight application tables and resets identities;
`db:setup` runs that destructive seed after migrating. Never use either for this shared-database update.

Live place search requires `SERPAPI_KEY`. `USE_MOCKS` now controls Nessie/Gemini only;
it no longer replaces place searches. `USE_SAMPLE_PLACES` is optional and must be
explicitly enabled to produce synthetic venues, labeled **Sample data** in the UI.
Leave it unset or disabled for real places. Restart the dev server after env changes.
No API keys are logged. Search failures appear in the Finding plans screen.

Creation validates a US city and state, geocodes it, and saves the city and coordinates with the creator membership in one transaction. There is currently no city-edit UI for
existing groups. New rounds snapshot the saved city and the smallest setup-complete member distance
preference, use the group's saved coordinates when the city matches (otherwise geocode the round's saved city), and filter venues by straight-line miles from that city
center. Maps results without coordinates are excluded rather than assumed nearby.
The diagnostic command accepts a city: `npm run places:check -- '$' 'Dallas, TX'`
(it makes live provider calls and consumes search credits).

### Pending round metadata migration (reviewed October 24, 2026)

The four nullable additions in `db/migrations/20261024_round_search_context.sql` are
idempotent. No data is backfilled or deleted. After team approval, run only that file
from the repository root (requires `psql`; loads `.env.local` without printing its values):

```sh
node --env-file=.env.local -e 'const {spawnSync}=require("node:child_process"); const r=spawnSync("psql",["-X","--set=ON_ERROR_STOP=1","--single-transaction","--file=db/migrations/20261024_round_search_context.sql"],{stdio:"inherit",env:{...process.env,PGDATABASE:process.env.DATABASE_URL}}); if(r.error) console.error("Could not start psql"); process.exit(r.status ?? 1);'
```

Column audit for the finding/pipeline/voting helpers and API routes, including columns
returned by shared helpers and table defaults (SQL result aliases and JSON keys are not
physical columns). Compared against `db/schema.sql` and a read-only live
`information_schema.columns` query:

| Table | Columns checked | Result |
| --- | --- | --- |
| users | id, name, email, password_hash, nessie_customer_id, nessie_account_id, budget_tier, avg_outing_cost, max_distance_mi, interests, created_at | All present |
| groups | id, name, city, lat, lng, invite_code, created_by, created_at, vote_hours | All present |
| memberships | group_id, user_id, availability, joined_at, comfort_tier | All present |
| plan_rounds | id, group_id, status, group_tier, winner_plan_id, created_at, slot, attempt, excluded, vote_deadline, payer_id, split_mode, requests_sent | All present |
| plan_rounds | search_city (text), search_distance_mi (int), sample_places (boolean), search_error (text) | In repo schema/migration; missing from live database |
| plans | id, round_id, title, summary, stops, est_cost_per_person, price_level, why_fits | All present |
| votes | plan_id, user_id, value | All present |
| payments | id, round_id, user_id, amount, status, transfer_id | All present |
| stop_skips | round_id, user_id, stop_index | All present |

The live database also has `redraw_votes(round_id, user_id)`, which is not defined in
this checkout's schema or referenced by its API routes. It was left untouched.
`lib/finding.ts` is pure code; its counts and `setup_done` values are derived, not
additional database columns. No other missing columns were found.


### Search settings and fresh rounds

Review `db/migrations/20261024_round_search_settings.sql` after the round-search-context
migration. This adds only `search_settings jsonb`, nullable with no default or backfill.
Neither migration was applied by the assistant. New searches require both; old plans
remain readable and are marked out of date until regenerated.

Each new round stores a server-only, canonical snapshot of members' distance, comfort
and suggested tier, interests, availability, and membership. The group distance is the
minimum among setup-complete members; the budget is the lowest effective member tier.
Generation uses that snapshot, including the saved tier and city. Changed settings
show **Settings changed. Find new plans to update.** on group home. Individual financial
preferences in the snapshot are never included in the group API response.

Maps requests use distance-dependent zoom (1/2/5/10/20 miles -> 15/14/13/12/11;
larger distances -> 10). GPS/haversine filtering enforces miles from the city center.
If fewer than three candidates survive, a single wider viewport is searched, and the
radius increases in two steps up to the next distance band (above 20 miles, at most
twice the requested radius). Any expansion is stated in each plan's Why text and the
actual radius is saved for the Finding screen. Budgets are never relaxed.

Known dollar prices are enforced, including rejecting $$$$ for $$$ groups. Numeric
price ranges use their midpoint: <=12 is $, <=30 $$, <=60 $$$, otherwise $$$$.
At $, unpriced restaurants and paid venues are excluded; clearly free outdoor places,
explicitly free-admission museums/galleries, and normally cheap coffee shops remain
eligible. Estimated prices stay marked as estimates.

Each category uses its first Maps page; a second page (start=20) is fetched only while
fewer than eight distinct candidates survive. No deeper pages are requested. Identical
engine/query/coordinates/zoom/page requests share a bounded 12-hour in-memory cache,
including concurrent requests. The cache is per process, not in the database; errors
are not cached. Ratings and review counts determine order, with random ties for variety.
Changed settings can still produce some of the same good places; different results
are not guaranteed. Development logs show safe parameters and filter counts, never keys.
