import { travelHandler, tripId, readBody, type TripContext } from '@/lib/travel/http';
import { readTrip, saveDates } from '@/lib/travel/service';
export const dynamic = 'force-dynamic';
export const GET = (_: Request, ctx: TripContext) => travelHandler(async uid => readTrip(await tripId(ctx), uid));
export const PUT = (req: Request, ctx: TripContext) => travelHandler(async uid => saveDates(await tripId(ctx), uid, await readBody(req)));
