import { travelHandler, tripId, readBody, type TripContext } from '@/lib/travel/http';
import { closeComparison } from '@/lib/travel/service';
export const POST = (req: Request, ctx: TripContext) => travelHandler(async uid => closeComparison(await tripId(ctx), uid, await readBody(req)));
