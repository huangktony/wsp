// Pure post-search filtering. Applies equally to Gemini and the deterministic builder.
import type { Place } from "./serpapi";
import { GROUP_INTERESTS, interestLabel, type Interest } from "./setupPreferences";
const aliases: Record<string, Interest> = { creative: "art & museums", "indoor games": "games" };
const venueTypes: Record<Interest, RegExp> = {
  food: /\b(restaurant|diner|food court|eatery|pizzeria|bakery|taqueria)\b/i,
  coffee: /\b(coffee|cafe|café|espresso|tea house)\b/i,
  outdoors: /\b(park|garden|trail|hiking|beach|campground|nature reserve)\b/i,
  entertainment: /\b(entertainment|amusement|arcade|bowling|cinema|movie|theat(?:er|re)|concert|comedy|escape room)\b/i,
  music: /\b(music|concert|jazz|karaoke|opera|symphony)\b/i,
  games: /\b(arcade|bowling|board game|escape room|billiards|laser tag|mini(?:ature)? golf)\b/i,
  sports: /\b(sport|sports|stadium|arena|golf|tennis|basketball|baseball|soccer|skating)\b/i,
  "art & museums": /\b(art|museum|gallery|galleries|pottery|sculpture)\b/i,
  nightlife: /\b(bar|bars|pub|nightclub|night club|cocktail|brewery|taproom|lounge|beer garden)\b/i,
  shopping: /\b(shop|shopping|mall|store|boutique|market)\b/i,
  movies: /\b(cinema|movie|drive-in)\b/i,
  fitness: /\b(fitness|gym|yoga|pilates|workout|exercise|health club)\b/i,
};
export function matchesAvoid(place: Place, interest: Interest) {
  const category = aliases[place.category] ?? place.category;
  const types = [place.type ?? "", ...(place.types ?? [])].join(" ").replace(/[_-]/g, " ");
  return category === interest || venueTypes[interest].test(types);
}
/** Keep at least three fresh candidates if possible. Relax the least-shared avoid
 * first; ties prefer recovering more venues, then the stable chip order. Never changes
 * the candidate pool's already-enforced price, distance or earlier-round exclusions. */
export function filterAvoidedPlaces(places: Place[], memberAvoids: readonly string[][], minimum = 3) {
  const counts = new Map<Interest, number>();
  for (const avoids of memberAvoids) for (const tag of GROUP_INTERESTS) {
    if (avoids.includes(tag)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  let active = GROUP_INTERESTS.filter(tag => counts.has(tag));
  const relaxed: Interest[] = [];
  const keep = (tags: Interest[]) => places.filter(p => !tags.some(tag => matchesAvoid(p, tag)));
  const target = Math.min(minimum, places.length);
  let filtered = keep(active);
  while (filtered.length < target && active.length) {
    const tag = [...active].sort((a, b) => counts.get(a)! - counts.get(b)!
      || keep(active.filter(t => t !== b)).length - keep(active.filter(t => t !== a)).length
      || GROUP_INTERESTS.indexOf(a) - GROUP_INTERESTS.indexOf(b))[0];
    active = active.filter(t => t !== tag);
    relaxed.push(tag);
    filtered = keep(active);
  }
  const note = relaxed.length
    ? `Too few venues matched all preferences; ${relaxed.map(interestLabel).join(", ")} avoid ${relaxed.length === 1 ? "was" : "were"} relaxed for this round. Budget and distance limits still apply.`
    : "";
  return { places: filtered, active, relaxed, note };
}
