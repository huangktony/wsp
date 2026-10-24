import bcrypt from "bcryptjs";
import { pool, q, q1 } from "../lib/db";
import { computeTier } from "../lib/tier";

const AVAIL = ["Fri evening", "Sat afternoon", "Sat evening"];
const USERS = [
  { name: "Demo Dana", email: "demo@wsp.app", interests: ["food", "entertainment", "outdoors"] },
  { name: "Ravi", email: "ravi@wsp.app", interests: ["food", "coffee"] },
  { name: "Mia", email: "mia@wsp.app", interests: ["food", "entertainment"] },
  { name: "Jon", email: "jon@wsp.app", interests: ["outdoors", "food"] },
];

async function main() {
  await pool.query("truncate payments, votes, plans, plan_rounds, memberships, groups, users restart identity cascade");
  const hash = await bcrypt.hash("demo1234", 8);
  const ids: number[] = [];
  for (const u of USERS) {
    const acct = `mock-${u.name.toLowerCase().replace(/\W/g, "")}`;
    const r = await q1<{ id: number }>("insert into users(name,email,password_hash,nessie_customer_id,nessie_account_id,interests) values($1,$2,$3,$4,$5,$6) returning id", [u.name, u.email, hash, `c-${acct}`, acct, u.interests]);
    ids.push(r!.id);
    await computeTier(r!.id, acct);
  }
  const g1 = await q1<{ id: number }>("insert into groups(name,city,lat,lng,invite_code,created_by) values('Friday Crew','Austin, TX',30.2672,-97.7431,'FRIDAY',$1) returning id", [ids[0]]);
  const g2 = await q1<{ id: number }>("insert into groups(name,city,lat,lng,invite_code,created_by) values('Study Break','Austin, TX',30.2849,-97.7341,'STUDY1',$1) returning id", [ids[1]]);
  for (const id of ids) await q("insert into memberships(group_id,user_id,availability) values($1,$2,$3)", [g1!.id, id, JSON.stringify(AVAIL)]);
  for (const id of ids.slice(0, 2)) await q("insert into memberships(group_id,user_id,availability) values($1,$2,'[]')", [g2!.id, id]);

  const { runFindPlans } = await import("../lib/pipeline");
  await runFindPlans(g1!.id);
  console.log("seeded. demo login: demo@wsp.app / demo1234");
  await pool.end();
}
main();
