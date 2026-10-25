import { travelHandler, tripId, readBody, type TripContext } from '@/lib/travel/http';
import { requestRedraw } from '@/lib/travel/service';
export const POST = (req: Request, ctx: TripContext) => travelHandler(async uid => requestRedraw(await tripId(ctx), uid, await readBody(req)));
