import { travelHandler, tripId, readBody, type TripContext } from '@/lib/travel/http';
import { ownSetup, saveSetup } from '@/lib/travel/service';
export const dynamic = 'force-dynamic';
export const GET = (_: Request, ctx: TripContext) => travelHandler(async uid => ownSetup(await tripId(ctx), uid));
export const PUT = (req: Request, ctx: TripContext) => travelHandler(async uid => saveSetup(await tripId(ctx), uid, await readBody(req)));
