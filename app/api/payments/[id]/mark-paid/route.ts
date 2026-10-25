import { fail, json, requireUser } from "@/lib/api";
import { payDue } from "@/lib/payments";

// Pay back the person who paid up front, with a real Nessie transfer (see sendPayment). Stays 'owed' unless Nessie accepts it.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await requireUser();
  if (typeof uid !== "number") return uid;
  const r = await payDue(Number((await params).id), uid);
  return "error" in r ? fail(r.error, r.status) : json(r);
}
