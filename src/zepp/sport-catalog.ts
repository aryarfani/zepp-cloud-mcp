// Zepp sport/workout type catalog keyed by the Zepp cloud `type` field of /v1/sport/run/history.json.
//
// Source: ZeppBridge, src/assets/workouts/catalog.json (catalog version 7, checked 2026-09-10)
//   https://github.com/lingcang728/ZeppBridge (commit 1f41da79a6c35fceebf48fa7e54df56b7a723768)
//   MIT License, Copyright (c) 2026 ZeppBridge contributors. The MIT permission notice of that repository applies to this data.
// Only code -> key / English label / confidence were copied. The `run` key is spelled `outdoor_running` here (existing key style).
//
// Confidence (how sure we are that the cloud type number means this sport):
//   verified   cloud_verified / cloud_and_extended_verified in ZeppBridge, or confirmed on live data in this project
//              (1, 6, 9, 14, 52, 92, 130, 223). Code 7 is downgraded to inferred: ZeppBridge lists it as trail running but its own
//              changelog says Gadgetbridge numbers 7 as open water swimming and the cloud mapping was never confirmed.
//   reference  ZeppBridge cloud_reference / user_reported / extended_catalog. Reported or taken from the Zepp OS device table,
//              not confirmed on this account. Extended entries (codes 40..206) match Gadgetbridge's Zepp OS table 107 of 108 times.
//   inferred   ZeppBridge cloud_inferred / zepp_os_compatible. Treat as a best guess (the Zepp OS device numbering differs from
//              the cloud numbering for low codes, so these may be wrong).
// Entries with no known numeric code (e.g. open water swimming) are not included: never guess a code.
export type SportConfidence = "verified" | "reference" | "inferred";
export type SportCatalogEntry = readonly [key: string, label: string, confidence: SportConfidence];

export const SPORT_CATALOG: Readonly<Record<number, SportCatalogEntry>> = {
  1: ["outdoor_running", "Outdoor Running", "verified"],
  2: ["treadmill", "Treadmill", "inferred"],
  3: ["walking", "Walking", "inferred"],
  4: ["ride", "Outdoor Cycling", "inferred"],
  5: ["free_training", "Free Training", "inferred"],
  6: ["walking", "Walking", "verified"],
  7: ["trail_running", "Trail Running", "inferred"],
  8: ["treadmill", "Treadmill", "reference"],
  9: ["ride", "Outdoor Cycling", "verified"],
  10: ["indoor_cycling", "Indoor Cycling", "reference"],
  12: ["elliptical", "Elliptical", "reference"],
  13: ["walking", "Walking", "inferred"],
  14: ["pool_swimming", "Pool Swimming", "verified"],
  15: ["hiking", "Hiking", "inferred"],
  16: ["free_training", "Free Training", "inferred"],
  17: ["tennis", "Tennis", "inferred"],
  21: ["jump_rope", "Jump Rope", "inferred"],
  22: ["hiking", "Hiking", "inferred"],
  23: ["rowing", "Rowing Machine", "reference"],
  24: ["indoor_fitness", "Indoor Fitness", "inferred"],
  40: ["indoor_walking", "Indoor Walking", "reference"],
  41: ["curling", "Curling", "reference"],
  44: ["ice_skating", "Ice Skating", "reference"],
  45: ["indoor_ice_skating", "Indoor Ice Skating", "reference"],
  48: ["bmx", "BMX", "reference"],
  49: ["hiit", "HIIT", "reference"],
  50: ["core_training", "Core Training", "reference"],
  51: ["aerobic_combo", "Aerobic Combo", "reference"],
  52: ["strength", "Strength Training", "verified"],
  53: ["stretching", "Stretching", "reference"],
  54: ["stair_climber", "Stair Climber", "reference"],
  55: ["flexibility", "Flexibility", "reference"],
  57: ["stepper", "Stepper", "reference"],
  59: ["gymnastics", "Gymnastics", "reference"],
  60: ["yoga", "Yoga", "reference"],
  61: ["pilates", "Pilates", "reference"],
  64: ["fishing", "Fishing", "reference"],
  65: ["sailing", "Sailing", "reference"],
  66: ["water_rowing", "Rowing", "reference"],
  67: ["skateboarding", "Skateboarding", "reference"],
  69: ["roller_skating", "Roller Skating", "reference"],
  70: ["rock_climbing", "Rock Climbing", "reference"],
  71: ["ballet", "Ballet", "reference"],
  72: ["belly_dance", "Belly Dance", "reference"],
  73: ["square_dance", "Square Dancing", "reference"],
  74: ["street_dance", "Street Dance", "reference"],
  75: ["ballroom_dance", "Ballroom Dance", "reference"],
  76: ["dance", "Dance", "reference"],
  77: ["zumba", "Zumba", "reference"],
  78: ["cricket", "Cricket", "reference"],
  79: ["baseball", "Baseball", "reference"],
  80: ["bowling", "Bowling", "reference"],
  81: ["squash", "Squash", "reference"],
  85: ["basketball", "Basketball", "reference"],
  86: ["softball", "Softball", "reference"],
  87: ["gateball", "Gateball", "reference"],
  88: ["volleyball", "Volleyball", "reference"],
  89: ["table_tennis", "Table Tennis", "reference"],
  91: ["handball", "Handball", "reference"],
  92: ["badminton", "Badminton", "verified"],
  93: ["archery", "Archery", "reference"],
  94: ["horse_riding", "Horse Riding", "reference"],
  95: ["kendo", "Kendo", "reference"],
  96: ["karate", "Karate", "reference"],
  97: ["boxing", "Boxing", "reference"],
  98: ["judo", "Judo", "reference"],
  99: ["wrestling", "Wrestling", "reference"],
  100: ["tai_chi", "Tai Chi", "reference"],
  101: ["muay_thai", "Muay Thai", "reference"],
  102: ["taekwondo", "Taekwondo", "reference"],
  103: ["martial_arts", "Martial Arts", "reference"],
  104: ["kickboxing", "Kickboxing", "reference"],
  109: ["aerobics", "Aerobics", "reference"],
  111: ["mass_gymnastics", "Group Calisthenics", "reference"],
  112: ["latin_dance", "Latin Dance", "reference"],
  113: ["jazz_dance", "Jazz Dance", "reference"],
  114: ["cardio_combat", "Cardio Combat", "reference"],
  115: ["hula_hoop", "Hula Hoop", "reference"],
  116: ["frisbee", "Frisbee", "reference"],
  117: ["darts", "Darts", "reference"],
  118: ["kite_flying", "Kite Flying", "reference"],
  119: ["tug_of_war", "Tug of War", "reference"],
  122: ["beach_volleyball", "Beach Volleyball", "reference"],
  129: ["parkour", "Parkour", "reference"],
  130: ["cross_training", "Cross Training", "verified"],
  131: ["race_walking", "Race Walking", "reference"],
  132: ["driving", "Driving", "reference"],
  138: ["dragon_boat", "Dragon Boat", "reference"],
  140: ["kayaking", "Kayaking", "reference"],
  143: ["spinning", "Spinning", "reference"],
  144: ["air_walker", "Air Walker", "reference"],
  145: ["wall_ball", "Wall Ball", "reference"],
  146: ["folk_dance", "Folk Dance", "reference"],
  147: ["jujitsu", "Jujitsu", "reference"],
  148: ["fencing", "Fencing", "reference"],
  149: ["horizontal_bar", "Horizontal Bar", "reference"],
  150: ["parallel_bars", "Parallel Bars", "reference"],
  151: ["billiards", "Billiards", "reference"],
  152: ["sepak_takraw", "Sepak Takraw", "reference"],
  153: ["dodgeball", "Dodgeball", "reference"],
  154: ["water_polo", "Water Polo", "reference"],
  155: ["finswimming", "Finswimming", "reference"],
  156: ["artistic_swimming", "Artistic Swimming", "reference"],
  157: ["snorkeling", "Snorkeling", "reference"],
  158: ["ice_hockey", "Ice Hockey", "reference"],
  159: ["swinging", "Swinging", "reference"],
  160: ["shuffleboard", "Shuffleboard", "reference"],
  161: ["table_football", "Table Football", "reference"],
  162: ["shuttlecock", "Shuttlecock Kicking", "reference"],
  163: ["somatosensory_game", "Motion Gaming", "reference"],
  164: ["futsal", "Futsal", "reference"],
  165: ["hip_hop", "Hip Hop", "reference"],
  166: ["pole_dance", "Pole Dance", "reference"],
  167: ["battle_rope", "Battle Rope", "reference"],
  168: ["breaking", "Breaking", "reference"],
  169: ["hacky_sack", "Jianzi", "reference"],
  170: ["bocce", "Bocce", "reference"],
  171: ["jai_alai", "Jai Alai", "reference"],
  172: ["flowriding", "Flowriding", "reference"],
  173: ["chess", "Chess", "reference"],
  174: ["checkers", "Checkers", "reference"],
  175: ["weiqi", "Go", "reference"],
  176: ["bridge", "Bridge", "reference"],
  177: ["board_game", "Board Games", "reference"],
  184: ["bouldering", "Bouldering", "reference"],
  185: ["modern_dance", "Modern Dance", "reference"],
  188: ["floorball", "Floorball", "reference"],
  189: ["esports", "Esports", "reference"],
  191: ["soccer", "Soccer", "reference"],
  192: ["outdoor_running", "Outdoor Running", "inferred"],
  206: ["e_bike", "E-Bike Ride", "reference"],
  211: ["road_cycling", "Road Cycling", "reference"],
  223: ["activity", "AI-Detected Activity", "verified"],
  225: ["rucking", "Rucking", "reference"]
};

const has = (code: number) => Object.prototype.hasOwnProperty.call(SPORT_CATALOG, code);

export function sportKey(code: number): string | undefined {
  return has(code) ? SPORT_CATALOG[code]![0] : undefined;
}

export function sportLabel(code: number): string | undefined {
  return has(code) ? SPORT_CATALOG[code]![1] : undefined;
}

export function sportConfidence(code: number | undefined, activityType?: string): SportConfidence | undefined {
  if (code === undefined || !has(code)) return undefined;
  const [key, , confidence] = SPORT_CATALOG[code]!;
  return activityType === undefined || activityType === key ? confidence : undefined;
}
