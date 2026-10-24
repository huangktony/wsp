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

### If something goes wrong

| Problem | Fix |
|---|---|
| `createdb: command not found` | Postgres isn't installed or isn't running. `brew install postgresql@17` then `brew services start postgresql@17` |
| `database "wsp" does not exist` | Run `createdb wsp` |
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
