import { requireUser, fail, json } from '../api';
import { TravelError, positiveId } from './service';
import { TravelInputError } from './core';
export async function travelHandler(fn: (uid: number) => Promise<unknown>) {
  try {
    const uid = await requireUser();
    if (typeof uid !== 'number') return uid;
    return json(await fn(uid));
  } catch (e: any) {
    if (e instanceof TravelError) return fail(e.message, e.status);
    if (e instanceof TravelInputError) return fail(e.message, 400);
    if (e?.code === '42P01' || e?.code === '42703') return fail('Travel setup is unavailable. The administrator needs to apply the Travel migration. You can still try the sample demo.', 503);
    return fail('Travel is temporarily unavailable. Try again, or explore the sample demo.', 503);
  }
}
export type TripContext = { params: Promise<{ id: string }> };
export async function tripId(ctx: TripContext) { return positiveId((await ctx.params).id); }
export const readBody = (req: Request) => req.json().catch(() => null);
