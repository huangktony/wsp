// Apply only the additive Travel schema; never seed or rewrite Hangout data.
import { readFileSync } from 'node:fs';
import { pool } from '../lib/db';

async function main() {
  const client = await pool.connect();
  let transaction = false;
  const existingSchema = async () => (await client.query(`
    select table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default
    from information_schema.columns
    where table_schema=current_schema() and left(table_name,7)<>'travel_'
    order by table_name,ordinal_position
  `)).rows;
  try {
    await client.query('begin');
    transaction = true;
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='30s'");
    await client.query('select pg_advisory_xact_lock(7171,0)');
    const before = await existingSchema();
    if (!before.some((c: any) => c.table_name === 'users' && c.column_name === 'id')) {
      throw new Error('Existing WSP users table is missing. Select the intended WSP database.');
    }
    await client.query(readFileSync(new URL('../db/migrations/travel.sql', import.meta.url), 'utf8'));
    // Resolve all required columns and joins without reading private values or inserting test data.
    await client.query(`explain select t.id,t.name,t.organizer_id,t.invite_code,t.candidates,t.revision,t.created_at,
      m.user_id,m.airport,m.flight_budget,m.joined_at,
      c.id,c.revision,c.status,c.options,c.member_ids,c.winner_id,c.error,c.created_at,c.checked_at,c.expires_at,
      v.user_id,v.option_id,v.value
      from travel_trips t
      left join travel_members m on m.trip_id=t.id
      left join users u on u.id=m.user_id
      left join travel_comparisons c on c.trip_id=t.id
      left join travel_votes v on v.comparison_id=c.id
      where false`);
    const after = await existingSchema();
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Unexpected change to existing WSP columns; migration rolled back.');
    await client.query('commit');
    transaction = false;
    console.log('Travel migration applied. All four Travel tables verified; existing WSP columns unchanged. No seed data inserted.');
  } catch (error) {
    if (transaction) await client.query('rollback').catch(() => {});
    throw error;
  } finally { client.release(); }
}
main().catch((error: any) => {
  // Connection strings and provider error details must never be logged.
  console.error('Travel migration failed; no partial migration committed.', error?.code ?? error?.name ?? 'Unknown error');
  process.exitCode = 1;
}).finally(() => pool.end());
