// Job location → countries: a compact place dictionary for the pre-screen's location gate.
// Pure; no Electron imports. Ambiguous 2-letter codes (IN, CA, WA…) are left out on purpose.
// ponytail: hand-kept dictionary, swap for a gazetteer if misses pile up.

/** Canonical country → aliases and job-hub cities (all lowercase). */
const PLACES: Record<string, string[]> = {
  India: ['india', 'bengaluru', 'bangalore', 'mumbai', 'bombay', 'pune', 'hyderabad', 'chennai', 'madras', 'delhi', 'new delhi', 'ncr', 'delhi ncr',
    'gurugram', 'gurgaon', 'noida', 'greater noida', 'kolkata', 'calcutta', 'ahmedabad', 'kochi', 'cochin', 'jaipur', 'chandigarh', 'mohali', 'indore',
    'coimbatore', 'thiruvananthapuram', 'trivandrum', 'bhubaneswar', 'nagpur', 'vadodara', 'surat', 'visakhapatnam', 'mysuru', 'mysore', 'lucknow',
    'karnataka', 'maharashtra', 'telangana', 'tamil nadu', 'kerala', 'haryana', 'uttar pradesh', 'gujarat', 'west bengal', 'rajasthan'],
  'United States': ['united states', 'united states of america', 'usa', 'us', 'u.s.', 'u.s.a.', 'america', 'san francisco', 'sf', 'bay area', 'new york', 'nyc',
    'seattle', 'austin', 'boston', 'chicago', 'los angeles', 'denver', 'atlanta', 'washington dc', 'dc', 'san jose', 'palo alto', 'mountain view',
    'sunnyvale', 'menlo park', 'miami', 'dallas', 'houston', 'portland', 'pittsburgh', 'philadelphia', 'raleigh', 'salt lake city',
    'california', 'ny', 'texas', 'tx', 'washington', 'massachusetts', 'colorado', 'illinois', 'florida'],
  Canada: ['canada', 'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'waterloo', 'ontario', 'british columbia', 'quebec'],
  'United Kingdom': ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'england', 'scotland', 'wales', 'london', 'manchester', 'edinburgh', 'cambridge', 'oxford', 'bristol'],
  Ireland: ['ireland', 'dublin', 'cork'],
  Germany: ['germany', 'deutschland', 'berlin', 'munich', 'münchen', 'hamburg', 'frankfurt', 'cologne', 'stuttgart'],
  France: ['france', 'paris', 'lyon'],
  Netherlands: ['netherlands', 'the netherlands', 'holland', 'amsterdam', 'rotterdam', 'utrecht', 'eindhoven'],
  Spain: ['spain', 'madrid', 'barcelona'],
  Portugal: ['portugal', 'lisbon', 'porto'],
  Italy: ['italy', 'milan', 'rome'],
  Switzerland: ['switzerland', 'zurich', 'zürich', 'geneva'],
  Austria: ['austria', 'vienna'],
  Belgium: ['belgium', 'brussels'],
  Sweden: ['sweden', 'stockholm'],
  Denmark: ['denmark', 'copenhagen'],
  Norway: ['norway', 'oslo'],
  Finland: ['finland', 'helsinki'],
  Poland: ['poland', 'warsaw', 'krakow', 'kraków', 'wroclaw', 'wrocław'],
  Romania: ['romania', 'bucharest'],
  'Czech Republic': ['czech republic', 'czechia', 'prague'],
  Israel: ['israel', 'tel aviv', 'tel aviv-yafo', 'jerusalem', 'haifa'],
  'United Arab Emirates': ['united arab emirates', 'uae', 'dubai', 'abu dhabi'],
  'Saudi Arabia': ['saudi arabia', 'ksa', 'riyadh', 'jeddah'],
  Singapore: ['singapore'],
  Japan: ['japan', 'tokyo', 'osaka'],
  'South Korea': ['south korea', 'korea', 'seoul'],
  China: ['china', 'beijing', 'shanghai', 'shenzhen', 'hangzhou'],
  'Hong Kong': ['hong kong'],
  Taiwan: ['taiwan', 'taipei'],
  Philippines: ['philippines', 'manila'],
  Indonesia: ['indonesia', 'jakarta'],
  Malaysia: ['malaysia', 'kuala lumpur'],
  Vietnam: ['vietnam', 'ho chi minh city', 'hanoi'],
  Thailand: ['thailand', 'bangkok'],
  Australia: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth'],
  'New Zealand': ['new zealand', 'auckland', 'wellington'],
  Brazil: ['brazil', 'são paulo', 'sao paulo', 'rio de janeiro'],
  Mexico: ['mexico', 'mexico city', 'guadalajara'],
  Argentina: ['argentina', 'buenos aires'],
  Colombia: ['colombia', 'bogota', 'bogotá', 'medellin', 'medellín'],
  Chile: ['chile', 'santiago'],
  'South Africa': ['south africa', 'cape town', 'johannesburg'],
  Nigeria: ['nigeria', 'lagos'],
  Kenya: ['kenya', 'nairobi'],
  Egypt: ['egypt', 'cairo'],
  Turkey: ['turkey', 'türkiye', 'istanbul'],
  Pakistan: ['pakistan', 'karachi', 'lahore'],
  Bangladesh: ['bangladesh', 'dhaka'],
  'Sri Lanka': ['sri lanka', 'colombo'],
  Nepal: ['nepal', 'kathmandu'],
}

const EUROPE = ['United Kingdom', 'Ireland', 'Germany', 'France', 'Netherlands', 'Spain', 'Portugal', 'Italy', 'Switzerland', 'Austria', 'Belgium', 'Sweden',
  'Denmark', 'Norway', 'Finland', 'Poland', 'Romania', 'Czech Republic']
const APAC = ['India', 'Singapore', 'Japan', 'South Korea', 'China', 'Hong Kong', 'Taiwan', 'Philippines', 'Indonesia', 'Malaysia', 'Vietnam', 'Thailand',
  'Australia', 'New Zealand', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal']
const LATAM = ['Mexico', 'Brazil', 'Argentina', 'Colombia', 'Chile']
const NORTH_AMERICA = ['United States', 'Canada']
const MIDDLE_EAST = ['Israel', 'United Arab Emirates', 'Saudi Arabia', 'Egypt', 'Turkey']
const AFRICA = ['South Africa', 'Nigeria', 'Kenya', 'Egypt']

const REGIONS: Record<string, string[]> = {
  apac: APAC, 'asia pacific': APAC, 'asia-pacific': APAC, asia: APAC, 'south asia': ['India', 'Pakistan', 'Bangladesh', 'Sri Lanka', 'Nepal'],
  emea: [...EUROPE, ...MIDDLE_EAST, ...AFRICA], europe: EUROPE, eu: EUROPE, 'middle east': MIDDLE_EAST, mena: MIDDLE_EAST, africa: AFRICA,
  americas: [...NORTH_AMERICA, ...LATAM], 'north america': NORTH_AMERICA, na: NORTH_AMERICA, amer: [...NORTH_AMERICA, ...LATAM], latam: LATAM,
  'latin america': LATAM, 'south america': ['Brazil', 'Argentina', 'Colombia', 'Chile'], anz: ['Australia', 'New Zealand'],
}
const ANYWHERE = new Set(['remote', 'anywhere', 'worldwide', 'global', 'remote first', 'remote-first', 'work from home', 'wfh', 'distributed', 'fully remote'])

const LOOKUP = new Map(Object.entries(PLACES).flatMap(([country, names]) => [[country.toLowerCase(), country] as const, ...names.map(n => [n, country] as const)]))

/** One posting site, resolved. `countries` for a region is the region's members. */
export type Site = { kind: 'country'; country: string } | { kind: 'region'; name: string; countries: string[] } | { kind: 'anywhere' } | { kind: 'unknown'; text: string }

/** A known country name/alias → its canonical name, else null (for the settings chips). */
export const canonicalCountry = (s: string): string | null => LOOKUP.get(s.trim().toLowerCase()) ?? null

function site(raw: string): Site {
  // "Remote, Bangalore" / "Remote · EMEA" / "Remote Ireland" / "Bengaluru, Karnataka, India"
  const bare = raw.toLowerCase().replace(/[()]/g, ',').split(/,|·|:|\s[-–—]\s/).map(p => p.trim().replace(/\s+/g, ' ')).filter(Boolean)
  if (bare.length && bare.every(p => ANYWHERE.has(p))) return { kind: 'anywhere' }
  const parts = bare.map(p => p.replace(/^(remote|hybrid|on-?site|office)\s+/, ''))
  for (const p of [...parts].reverse()) { const c = LOOKUP.get(p); if (c) return { kind: 'country', country: c } } // most specific last: "…, India"
  for (const p of parts) { const r = REGIONS[p]; if (r) return { kind: 'region', name: p.length <= 4 ? p.toUpperCase() : p.replace(/\b\w/g, x => x.toUpperCase()), countries: r } }
  return { kind: 'unknown', text: raw.trim() }
}

/** Split a location field into sites on ; | " / " " or " and resolve each. Empty → []. */
export function parseLocation(location: string | null | undefined): Site[] {
  if (!location?.trim()) return []
  return location.split(/;|\||\s\/\s|\sor\s|\n/i).map(s => s.trim()).filter(Boolean).map(site)
}
