import { pool, q } from "../lib/db";

// Read-only. Prints every table. Pass a table name to see just that one: npm run db:peek -- users
const TABLES: Record<string, string> = {
  users: "select id,name,email,budget_tier,avg_outing_cost,max_distance_mi,interests from users order by id",
  groups: "select id,name,city,invite_code,created_by from groups order by id",
  memberships: "select group_id,user_id,availability from memberships order by group_id,user_id",
  plan_rounds: "select id,group_id,status,group_tier,winner_plan_id from plan_rounds order by id",
  plans: "select id,round_id,title,est_cost_per_person,price_level from plans order by id",
  votes: "select plan_id,user_id,value from votes order by plan_id,user_id",
  payments: "select id,round_id,user_id,amount,status from payments order by id",
};

async function main() {
  const only = process.argv[2];
  for (const [name, sql] of Object.entries(TABLES)) {
    if (only && only !== name) continue;
    const rows = await q(sql);
    console.log(`\n${name} (${rows.length} rows)`);
    if (rows.length) console.table(rows);
  }
  await pool.end();
}
main();
