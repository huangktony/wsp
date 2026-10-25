import { travelHandler, readBody } from '@/lib/travel/http';
import { joinTrip } from '@/lib/travel/service';
export const POST = (req: Request) => travelHandler(async uid => joinTrip(uid, await readBody(req)));
