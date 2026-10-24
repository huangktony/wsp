import { readFileSync } from "fs";
import { pool } from "../lib/db";

async function main() {
  await pool.query(readFileSync("db/schema.sql", "utf8"));
  console.log("schema applied");
  await pool.end();
}
main();
