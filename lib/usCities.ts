/** Suggestions only: any city name with a valid US state/DC abbreviation is accepted. */
const CITIES_BY_STATE: Record<string, string[]> = {
  AL: ["Birmingham", "Montgomery", "Huntsville", "Mobile"],
  AK: ["Anchorage", "Fairbanks", "Juneau", "Sitka"],
  AZ: ["Phoenix", "Tucson", "Mesa", "Scottsdale", "Tempe", "Chandler"],
  AR: ["Little Rock", "Fort Smith", "Fayetteville", "Springdale"],
  CA: ["Los Angeles", "San Diego", "San Jose", "San Francisco", "Fresno", "Sacramento", "Long Beach", "Oakland", "Bakersfield", "Anaheim", "Santa Ana", "Riverside", "Irvine", "Stockton", "Santa Barbara", "Pasadena"],
  CO: ["Denver", "Colorado Springs", "Aurora", "Fort Collins", "Boulder", "Pueblo"],
  CT: ["Bridgeport", "Stamford", "New Haven", "Hartford"],
  DE: ["Wilmington", "Dover", "Newark", "Middletown"],
  DC: ["Washington"],
  FL: ["Jacksonville", "Miami", "Tampa", "Orlando", "St. Petersburg", "Tallahassee", "Fort Lauderdale", "Gainesville", "Pensacola", "Sarasota"],
  GA: ["Atlanta", "Augusta", "Columbus", "Savannah", "Athens", "Macon"],
  HI: ["Honolulu", "Hilo", "Kailua", "Kahului"],
  ID: ["Boise", "Meridian", "Nampa", "Idaho Falls"],
  IL: ["Chicago", "Aurora", "Naperville", "Joliet", "Rockford", "Springfield", "Champaign", "Peoria"],
  IN: ["Indianapolis", "Fort Wayne", "Evansville", "South Bend", "Bloomington"],
  IA: ["Des Moines", "Cedar Rapids", "Davenport", "Iowa City"],
  KS: ["Wichita", "Overland Park", "Kansas City", "Topeka", "Lawrence"],
  KY: ["Louisville", "Lexington", "Bowling Green", "Owensboro"],
  LA: ["New Orleans", "Baton Rouge", "Shreveport", "Lafayette"],
  ME: ["Portland", "Lewiston", "Bangor", "Augusta"],
  MD: ["Baltimore", "Frederick", "Gaithersburg", "Rockville", "Annapolis"],
  MA: ["Boston", "Worcester", "Springfield", "Cambridge", "Lowell", "Salem"],
  MI: ["Detroit", "Grand Rapids", "Warren", "Sterling Heights", "Ann Arbor", "Lansing"],
  MN: ["Minneapolis", "St. Paul", "Rochester", "Duluth", "Bloomington"],
  MS: ["Jackson", "Gulfport", "Southaven", "Hattiesburg"],
  MO: ["Kansas City", "St. Louis", "Springfield", "Columbia"],
  MT: ["Billings", "Missoula", "Great Falls", "Bozeman"],
  NE: ["Omaha", "Lincoln", "Bellevue", "Grand Island"],
  NV: ["Las Vegas", "Henderson", "Reno", "Carson City"],
  NH: ["Manchester", "Nashua", "Concord", "Portsmouth"],
  NJ: ["Newark", "Jersey City", "Paterson", "Elizabeth", "Trenton", "Princeton"],
  NM: ["Albuquerque", "Las Cruces", "Rio Rancho", "Santa Fe"],
  NY: ["New York", "Buffalo", "Yonkers", "Rochester", "Syracuse", "Albany", "Ithaca", "Saratoga Springs"],
  NC: ["Charlotte", "Raleigh", "Greensboro", "Durham", "Winston-Salem", "Asheville", "Wilmington", "Chapel Hill"],
  ND: ["Fargo", "Bismarck", "Grand Forks", "Minot"],
  OH: ["Columbus", "Cleveland", "Cincinnati", "Toledo", "Akron", "Dayton"],
  OK: ["Oklahoma City", "Tulsa", "Norman", "Broken Arrow"],
  OR: ["Portland", "Eugene", "Salem", "Bend", "Beaverton"],
  PA: ["Philadelphia", "Pittsburgh", "Allentown", "Reading", "Erie", "Harrisburg", "Lancaster", "State College"],
  RI: ["Providence", "Warwick", "Cranston", "Newport"],
  SC: ["Charleston", "Columbia", "North Charleston", "Greenville", "Myrtle Beach"],
  SD: ["Sioux Falls", "Rapid City", "Aberdeen", "Brookings"],
  TN: ["Nashville", "Memphis", "Knoxville", "Chattanooga", "Clarksville"],
  TX: ["Houston", "San Antonio", "Dallas", "Austin", "Fort Worth", "El Paso", "Arlington", "Corpus Christi", "Plano", "Lubbock", "Irving", "Laredo", "Garland", "Frisco", "McKinney", "Denton", "Waco", "College Station"],
  UT: ["Salt Lake City", "West Valley City", "Provo", "Ogden", "St. George"],
  VT: ["Burlington", "South Burlington", "Rutland", "Montpelier"],
  VA: ["Virginia Beach", "Chesapeake", "Norfolk", "Richmond", "Alexandria", "Roanoke", "Charlottesville"],
  WA: ["Seattle", "Spokane", "Tacoma", "Vancouver", "Bellevue", "Olympia", "Bellingham"],
  WV: ["Charleston", "Huntington", "Morgantown", "Parkersburg"],
  WI: ["Milwaukee", "Madison", "Green Bay", "Kenosha", "Racine", "Appleton"],
  WY: ["Cheyenne", "Casper", "Laramie", "Gillette"],
};
export const US_CITIES = Object.entries(CITIES_BY_STATE).flatMap(([state, cities]) => cities.map(city => `${city}, ${state}`)).sort();
export const US_CITY_ERROR = "Enter a US city like Houston, TX";

export function normalizeUSCity(value: string): string | null {
  const match = value.trim().match(/^([\p{L}][\p{L}\p{M} .’'-]*),\s*([a-z]{2})$/iu);
  if (!match) return null;
  const state = match[2].toUpperCase();
  if (!Object.hasOwn(CITIES_BY_STATE, state)) return null;
  return `${match[1].trim().replace(/\s+/g, " ")}, ${state}`;
}
