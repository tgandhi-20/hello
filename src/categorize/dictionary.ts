/**
 * Australian merchant dictionary (CONTRACTS.md §5, §6). Maps a normalised, cleaned
 * merchant string to a small set of candidate category labels, most-preferred first.
 * Candidate lists (rather than a single hardcoded id) exist because `Category` ids are
 * assigned at runtime by the store (Agent 2) — we match by label text against whatever
 * categories actually exist, and fall back gracefully down the list, and ultimately to
 * an "Other"/"Uncategorised" bucket, if a preferred label isn't present.
 *
 * Coffee vs Lunch vs Dining Out are kept distinct on purpose — the user tracks these
 * separately and cares about them most (CONTRACTS.md §5).
 */

export interface DictionaryEntry {
  /** Lowercase substrings matched against the cleaned, lowercased merchant string. */
  patterns: string[];
  /** Candidate category labels, most preferred first. */
  categoryLabels: string[];
  /** Canonical display name to use instead of the cleaned raw text, if matched. */
  canonicalName: string;
}

// Order matters where substrings could collide (e.g. "kfc" vs generic "chicken") — more
// specific / branded entries are listed before generic catch-alls.
export const MERCHANT_DICTIONARY: DictionaryEntry[] = [
  // --- Groceries ---
  { patterns: ['woolworths', 'woolies'], categoryLabels: ['Groceries', 'Shopping', 'Other'], canonicalName: 'Woolworths' },
  { patterns: ['coles'], categoryLabels: ['Groceries', 'Shopping', 'Other'], canonicalName: 'Coles' },
  { patterns: ['aldi'], categoryLabels: ['Groceries', 'Shopping', 'Other'], canonicalName: 'ALDI' },
  { patterns: ['harris farm'], categoryLabels: ['Groceries', 'Shopping', 'Other'], canonicalName: 'Harris Farm' },
  { patterns: ['iga'], categoryLabels: ['Groceries', 'Shopping', 'Other'], canonicalName: 'IGA' },

  // --- Coffee (kept distinct from Lunch / Dining Out) ---
  { patterns: ["gloria jean"], categoryLabels: ['Coffee', 'Dining Out', 'Other'], canonicalName: "Gloria Jean's" },
  { patterns: ['boost juice'], categoryLabels: ['Coffee', 'Dining Out', 'Other'], canonicalName: 'Boost Juice' },

  // --- Lunch (sandwiches / salads / quick weekday food) ---
  { patterns: ['soul origin'], categoryLabels: ['Lunch', 'Dining Out', 'Other'], canonicalName: 'Soul Origin' },
  { patterns: ['zambrero'], categoryLabels: ['Lunch', 'Dining Out', 'Other'], canonicalName: 'Zambrero' },
  { patterns: ['mad mex'], categoryLabels: ['Lunch', 'Dining Out', 'Other'], canonicalName: 'Mad Mex' },
  { patterns: ['guzman y gomez', 'guzman & gomez', 'gyg'], categoryLabels: ['Lunch', 'Dining Out', 'Other'], canonicalName: 'Guzman y Gomez' },
  { patterns: ['subway'], categoryLabels: ['Lunch', 'Dining Out', 'Other'], canonicalName: 'Subway' },
  { patterns: ["grill'd", 'grilld'], categoryLabels: ['Lunch', 'Dining Out', 'Other'], canonicalName: "Grill'd" },

  // --- Dining Out / takeaway ---
  { patterns: ["nando's", 'nandos'], categoryLabels: ['Dining Out', 'Other'], canonicalName: "Nando's" },
  { patterns: ["mcdonald's", 'mcdonalds', 'macca', "maccas"], categoryLabels: ['Dining Out', 'Other'], canonicalName: "McDonald's" },
  { patterns: ['kfc'], categoryLabels: ['Dining Out', 'Other'], canonicalName: 'KFC' },
  { patterns: ["domino's", 'dominos'], categoryLabels: ['Dining Out', 'Other'], canonicalName: "Domino's" },
  { patterns: ['uber eats', 'ubereats'], categoryLabels: ['Dining Out', 'Other'], canonicalName: 'Uber Eats' },
  { patterns: ['doordash'], categoryLabels: ['Dining Out', 'Other'], canonicalName: 'DoorDash' },
  { patterns: ['menulog'], categoryLabels: ['Dining Out', 'Other'], canonicalName: 'Menulog' },

  // --- Transport ---
  { patterns: ['uber'], categoryLabels: ['Transport', 'Other'], canonicalName: 'Uber' }, // after "uber eats" so ride-hail doesn't shadow it
  { patterns: ['opal'], categoryLabels: ['Transport', 'Other'], canonicalName: 'Opal' },
  { patterns: ['myki'], categoryLabels: ['Transport', 'Other'], canonicalName: 'Myki' },
  { patterns: ['go card', 'gocard'], categoryLabels: ['Transport', 'Other'], canonicalName: 'Go Card' },
  { patterns: ['translink'], categoryLabels: ['Transport', 'Other'], canonicalName: 'Translink' },

  // --- Fuel ---
  { patterns: ['ampol'], categoryLabels: ['Fuel', 'Transport', 'Other'], canonicalName: 'Ampol' },
  { patterns: ['caltex'], categoryLabels: ['Fuel', 'Transport', 'Other'], canonicalName: 'Caltex' },
  { patterns: ['shell'], categoryLabels: ['Fuel', 'Transport', 'Other'], canonicalName: 'Shell' },
  { patterns: [' bp ', 'bp service'], categoryLabels: ['Fuel', 'Transport', 'Other'], canonicalName: 'BP' },
  { patterns: ['united petroleum', 'united fuel'], categoryLabels: ['Fuel', 'Transport', 'Other'], canonicalName: 'United' },
  { patterns: ['7-eleven', '7 eleven', 'seven eleven'], categoryLabels: ['Fuel', 'Shopping', 'Other'], canonicalName: '7-Eleven' },

  // --- Alcohol ---
  { patterns: ["dan murphy", 'danmurphy'], categoryLabels: ['Alcohol', 'Shopping', 'Other'], canonicalName: "Dan Murphy's" },
  { patterns: ['bws'], categoryLabels: ['Alcohol', 'Shopping', 'Other'], canonicalName: 'BWS' },
  { patterns: ['liquorland'], categoryLabels: ['Alcohol', 'Shopping', 'Other'], canonicalName: 'Liquorland' },

  // --- Shopping ---
  { patterns: ['bunnings'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'Bunnings' },
  { patterns: ['kmart'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'Kmart' },
  { patterns: ['target'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'Target' },
  { patterns: ['big w', 'bigw'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'Big W' },
  { patterns: ['officeworks'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'Officeworks' },
  { patterns: ['jb hi-fi', 'jb hifi', 'jbhifi'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'JB Hi-Fi' },
  { patterns: ['harvey norman'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'Harvey Norman' },
  { patterns: ['amazon'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'Amazon' },
  { patterns: ['ebay'], categoryLabels: ['Shopping', 'Other'], canonicalName: 'eBay' },

  // --- Health / pharmacy ---
  { patterns: ['chemist warehouse'], categoryLabels: ['Health', 'Other'], canonicalName: 'Chemist Warehouse' },
  { patterns: ['priceline'], categoryLabels: ['Health', 'Other'], canonicalName: 'Priceline' },

  // --- Bills / utilities ---
  { patterns: ['telstra'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'Telstra' },
  { patterns: ['optus'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'Optus' },
  { patterns: ['vodafone'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'Vodafone' },
  { patterns: ['tpg'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'TPG' },
  { patterns: ['origin energy'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'Origin Energy' },
  { patterns: ['agl'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'AGL' },
  { patterns: ['energyaustralia', 'energy australia'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'EnergyAustralia' },
  { patterns: ['sydney water'], categoryLabels: ['Bills', 'Utilities', 'Other'], canonicalName: 'Sydney Water' },

  // --- Subscriptions ---
  { patterns: ['netflix'], categoryLabels: ['Subscriptions', 'Bills', 'Other'], canonicalName: 'Netflix' },
  { patterns: ['spotify'], categoryLabels: ['Subscriptions', 'Bills', 'Other'], canonicalName: 'Spotify' },
  { patterns: ['disney'], categoryLabels: ['Subscriptions', 'Bills', 'Other'], canonicalName: 'Disney+' },
  { patterns: ['binge'], categoryLabels: ['Subscriptions', 'Bills', 'Other'], canonicalName: 'Binge' },
  { patterns: ['stan'], categoryLabels: ['Subscriptions', 'Bills', 'Other'], canonicalName: 'Stan' },
  { patterns: ['kayo'], categoryLabels: ['Subscriptions', 'Bills', 'Other'], canonicalName: 'Kayo' },
];

/** Generic, non-branded catch-all patterns applied after the branded dictionary above. */
export const GENERIC_PATTERNS: DictionaryEntry[] = [
  { patterns: ['coffee', 'cafe', 'espresso', 'roaster', 'roasters', 'roastery'], categoryLabels: ['Coffee', 'Dining Out', 'Other'], canonicalName: '' },
  { patterns: ['bakery', 'sandwich', 'sushi', 'salad'], categoryLabels: ['Lunch', 'Dining Out', 'Other'], canonicalName: '' },
  { patterns: ['restaurant', 'pizza', 'takeaway', 'take away', 'thai', 'indian', 'kebab', 'noodle', 'ramen', 'diner', 'bar & grill', 'pub'], categoryLabels: ['Dining Out', 'Other'], canonicalName: '' },
  { patterns: ['pharmacy', 'chemist', 'medical', 'dental', 'doctor', 'clinic', 'physio'], categoryLabels: ['Health', 'Other'], canonicalName: '' },
  { patterns: ['gym', 'fitness', 'anytime fitness', 'f45', 'crossfit', 'pilates', 'yoga'], categoryLabels: ['Fitness', 'Health', 'Other'], canonicalName: '' },
  { patterns: ['insurance', 'nrma', 'aami', 'budget direct', 'youi', 'allianz', 'bupa', 'medibank', 'hcf'], categoryLabels: ['Insurance', 'Bills', 'Other'], canonicalName: '' },
  { patterns: ['rent', 'mortgage', 'landlord', 'real estate', 'property management', 'realty'], categoryLabels: ['Rent', 'Housing', 'Bills', 'Other'], canonicalName: '' },
  { patterns: ['petrol', 'fuel', 'service station'], categoryLabels: ['Fuel', 'Transport', 'Other'], canonicalName: '' },
  { patterns: ['parking', 'toll', 'linkt', 'eastlink', 'citylink'], categoryLabels: ['Transport', 'Other'], canonicalName: '' },
  { patterns: ['salary', 'payroll', 'pay run', 'wages'], categoryLabels: ['Income', 'Other'], canonicalName: '' },
];
