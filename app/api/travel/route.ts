import { travelHandler, readBody } from '@/lib/travel/http';
import { listTrips, createTrip } from '@/lib/travel/service';
export const dynamic = 'force-dynamic';
export const GET = () => travelHandler(uid => listTrips(uid));
export const POST = (req: Request) => travelHandler(async uid => createTrip(uid, await readBody(req)));
