import { q, q1 } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { linkAccount } from "@/lib/nessie";
import { computeTier } from "@/lib/tier";

export async function POST() {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const u = await q1<any>("select name,nessie_account_id from users where id=$1", [uid]);
  let acct = u.nessie_account_id as string | null;
  if (!acct) {
    const l = await linkAccount(u.name);
    acct = l.accountId;
    await q("update users set nessie_customer_id=$1, nessie_account_id=$2 where id=$3", [l.customerId, acct, uid]);
  }
  const { tier } = await computeTier(uid, acct);
  return json({ tier });
}
