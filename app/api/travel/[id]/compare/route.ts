import { travelHandler, tripId, type TripContext } from '@/lib/travel/http';
import { startComparison } from '@/lib/travel/service';
export const maxDuration = 150;
export const POST = (_: Request, ctx: TripContext) => travelHandler(async uid => startComparison(await tripId(ctx), uid));
