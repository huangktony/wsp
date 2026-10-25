import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { fail, json, requireUser } from "@/lib/api";
import { linkAccount, maskKey } from "@/lib/nessie";
import { PROFILES } from "@/lib/profiles";
import { computeTier } from "@/lib/tier";

const Body = z.object({ profile: z.enum(PROFILES) });

export async function POST(req: Request) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  // Validate before touching Nessie, so a bad request never creates a customer.
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("profile must be frugal, average or big");
  const u = await q1<any>("select name,nessie_account_id from users where id=$1", [uid]);
  try {
    let acct = u.nessie_account_id as string | null;
    // Already linked: ignore the profile and just recompute the tier. No switching profiles.
    if (!acct) {
      const l = await linkAccount(u.name, uid, p.data.profile);
      acct = l.accountId;
      await q("update users set nessie_customer_id=$1, nessie_account_id=$2 where id=$3", [l.customerId, acct, uid]);
    }
    const { tier } = await computeTier(uid, acct);
    return json({ tier });
  } catch (e: any) {
    console.error(maskKey(`bank link failed: ${e?.message ?? e}`));
    return fail("Could not reach the bank service", 502);
  }
}
