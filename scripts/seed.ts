import bcrypt from "bcryptjs";
import { pool, q, q1 } from "../lib/db";
import { computeTier } from "../lib/tier";
import { linkAccount } from "../lib/nessie";

const AVAIL = ["Fri evening", "Sat afternoon", "Sat evening"];
const USERS = [
  { name: "Demo Dana", email: "demo@wsp.app", interests: ["food", "entertainment", "outdoors"] },
  { name: "Ravi", email: "ravi@wsp.app", interests: ["food", "coffee"] },
  { name: "Mia", email: "mia@wsp.app", interests: ["food", "entertainment"] },
  { name: "Jon", email: "jon@wsp.app", interests: ["outdoors", "food"] },
];

async function main() {
  await pool.query("truncate stop_skips, payments, votes, plans, plan_rounds, memberships, groups, users restart identity cascade");
  const hash = await bcrypt.hash("demo1234", 8);
  const ids: number[] = [];
  for (const u of USERS) {
    let acct = `mock-${u.name.toLowerCase().replace(/\W/g, "")}`;
    const r = await q1<{ id: number }>("insert into users(name,email,password_hash,nessie_customer_id,nessie_account_id,interests) values($1,$2,$3,$4,$5,$6) returning id", [u.name, u.email, hash, `c-${acct}`, acct, u.interests]);
    ids.push(r!.id);
    // With a Nessie key, give the demo users real sandbox accounts. The "average" profile opens with $1,500 to $4,000, which covers any split,
    // so paying a share never fails for lack of funds. Without a key (or with USE_MOCKS=true) they keep local mock accounts.
    if (process.env.NESSIE_API_KEY && process.env.USE_MOCKS !== "true") {
      const linked = await linkAccount(u.name, r!.id, "average");
      acct = linked.accountId;
      await q("update users set nessie_customer_id=$1, nessie_account_id=$2 where id=$3", [linked.customerId, acct, r!.id]);
    }
    await computeTier(r!.id, acct);
  }
  const g1 = await q1<{ id: number }>("insert into groups(name,city,lat,lng,invite_code,created_by) values('Friday Crew','Austin, TX',30.2672,-97.7431,'FRIDAY',$1) returning id", [ids[0]]);
  const g2 = await q1<{ id: number }>("insert into groups(name,city,lat,lng,invite_code,created_by) values('Study Break','Austin, TX',30.2849,-97.7341,'STUDY1',$1) returning id", [ids[1]]);
  for (const id of ids) await q("insert into memberships(group_id,user_id,availability) values($1,$2,$3)", [g1!.id, id, JSON.stringify(AVAIL)]);
  for (const id of ids.slice(0, 2)) await q("insert into memberships(group_id,user_id,availability) values($1,$2,'[]')", [g2!.id, id]);

  const { runFindPlans } = await import("../lib/pipeline");
  const round = await runFindPlans(g1!.id);
  // Ravi and Mia have already voted, so the demo shows "2 of 4 voted". Dana (demo) and Jon still need to vote.
  const plans = await q<{ id: number }>("select id from plans where round_id=$1 order by id", [round]);
  const votes: [number, string[]][] = [[ids[1], ["approve", "pass", "approve"]], [ids[2], ["approve", "approve", "pass"]]];
  for (const [uid, vals] of votes) for (let i = 0; i < plans.length; i++) await q("insert into votes(plan_id,user_id,value) values($1,$2,$3)", [plans[i].id, uid, vals[i]]);
  console.log("seeded. demo login: demo@wsp.app / demo1234");
  await pool.end();
}
main();
