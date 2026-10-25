import { travelHandler, tripId, readBody, type TripContext } from '@/lib/travel/http';
import { confirmBallot } from '@/lib/travel/service';
export const POST = (req: Request, ctx: TripContext) => travelHandler(async uid => confirmBallot(await tripId(ctx), uid, await readBody(req)));
