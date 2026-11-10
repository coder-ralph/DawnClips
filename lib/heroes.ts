export type HeroRole = "tank" | "fighter" | "assassin" | "mage" | "marksman" | "support";

export type Hero = {
  id: string;
  name: string;
  role: HeroRole;
};

export const heroes: Hero[] = [
  { id: "tigreal", name: "Tigreal", role: "tank" },
  { id: "akai", name: "Akai", role: "tank" },
  { id: "franco", name: "Franco", role: "tank" },
  { id: "minotaur", name: "Minotaur", role: "tank" },
  { id: "lolita", name: "Lolita", role: "tank" },
  { id: "johnson", name: "Johnson", role: "tank" },
  { id: "grock", name: "Grock", role: "tank" },
  { id: "hylos", name: "Hylos", role: "tank" },
  { id: "uranus", name: "Uranus", role: "tank" },
  { id: "belerick", name: "Belerick", role: "tank" },
  { id: "khufra", name: "Khufra", role: "tank" },
  { id: "baxia", name: "Baxia", role: "tank" },
  { id: "atlas", name: "Atlas", role: "tank" },
  { id: "gloo", name: "Gloo", role: "tank" },
  { id: "edith", name: "Edith", role: "tank" },
  { id: "fredrinn", name: "Fredrinn", role: "tank" },
  { id: "chip", name: "Chip", role: "tank" },
  { id: "balmond", name: "Balmond", role: "fighter" },
  { id: "alucard", name: "Alucard", role: "fighter" },
  { id: "bane", name: "Bane", role: "fighter" },
  { id: "zilong", name: "Zilong", role: "fighter" },
  { id: "freya", name: "Freya", role: "fighter" },
  { id: "chou", name: "Chou", role: "fighter" },
  { id: "sun", name: "Sun", role: "fighter" },
  { id: "alpha", name: "Alpha", role: "fighter" },
  { id: "ruby", name: "Ruby", role: "fighter" },
  { id: "hilda", name: "Hilda", role: "fighter" },
  { id: "lapu-lapu", name: "Lapu-Lapu", role: "fighter" },
  { id: "jawhead", name: "Jawhead", role: "fighter" },
  { id: "martis", name: "Martis", role: "fighter" },
  { id: "aldous", name: "Aldous", role: "fighter" },
  { id: "leomord", name: "Leomord", role: "fighter" },
  { id: "thamuz", name: "Thamuz", role: "fighter" },
  { id: "minsitthar", name: "Minsitthar", role: "fighter" },
  { id: "badang", name: "Badang", role: "fighter" },
  { id: "guinevere", name: "Guinevere", role: "fighter" },
  { id: "terizla", name: "Terizla", role: "fighter" },
  { id: "x-borg", name: "X.Borg", role: "fighter" },
  { id: "dyroth", name: "Dyroth", role: "fighter" },
  { id: "silvanna", name: "Silvanna", role: "fighter" },
  { id: "yu-zhong", name: "Yu Zhong", role: "fighter" },
  { id: "khaleed", name: "Khaleed", role: "fighter" },
  { id: "paquito", name: "Paquito", role: "fighter" },
  { id: "phoveus", name: "Phoveus", role: "fighter" },
  { id: "aulus", name: "Aulus", role: "fighter" },
  { id: "yin", name: "Yin", role: "fighter" },
  { id: "julian", name: "Julian", role: "fighter" },
  { id: "arlott", name: "Arlott", role: "fighter" },
  { id: "cici", name: "Cici", role: "fighter" },
  { id: "saber", name: "Saber", role: "assassin" },
  { id: "karina", name: "Karina", role: "assassin" },
  { id: "fanny", name: "Fanny", role: "assassin" },
  { id: "hayabusa", name: "Hayabusa", role: "assassin" },
  { id: "natalia", name: "Natalia", role: "assassin" },
  { id: "lancelot", name: "Lancelot", role: "assassin" },
  { id: "gusion", name: "Gusion", role: "assassin" },
  { id: "helcurt", name: "Helcurt", role: "assassin" },
  { id: "selena", name: "Selena", role: "assassin" },
  { id: "hanzo", name: "Hanzo", role: "assassin" },
  { id: "kadita", name: "Kadita", role: "assassin" },
  { id: "ling", name: "Ling", role: "assassin" },
  { id: "benedetta", name: "Benedetta", role: "assassin" },
  { id: "aamon", name: "Aamon", role: "assassin" },
  { id: "joy", name: "Joy", role: "assassin" },
  { id: "nolan", name: "Nolan", role: "assassin" },
  { id: "alice", name: "Alice", role: "mage" },
  { id: "nana", name: "Nana", role: "mage" },
  { id: "eudora", name: "Eudora", role: "mage" },
  { id: "gord", name: "Gord", role: "mage" },
  { id: "kagura", name: "Kagura", role: "mage" },
  { id: "cyclops", name: "Cyclops", role: "mage" },
  { id: "vexana", name: "Vexana", role: "mage" },
  { id: "aurora", name: "Aurora", role: "mage" },
  { id: "harley", name: "Harley", role: "mage" },
  { id: "odette", name: "Odette", role: "mage" },
  { id: "zhask", name: "Zhask", role: "mage" },
  { id: "pharsa", name: "Pharsa", role: "mage" },
  { id: "valir", name: "Valir", role: "mage" },
  { id: "change", name: "Chang'e", role: "mage" },
  { id: "lunox", name: "Lunox", role: "mage" },
  { id: "harith", name: "Harith", role: "mage" },
  { id: "esmeralda", name: "Esmeralda", role: "mage" },
  { id: "lylia", name: "Lylia", role: "mage" },
  { id: "cecilion", name: "Cecilion", role: "mage" },
  { id: "luo-yi", name: "Luo Yi", role: "mage" },
  { id: "yve", name: "Yve", role: "mage" },
  { id: "xavier", name: "Xavier", role: "mage" },
  { id: "novaria", name: "Novaria", role: "mage" },
  { id: "miya", name: "Miya", role: "marksman" },
  { id: "bruno", name: "Bruno", role: "marksman" },
  { id: "clint", name: "Clint", role: "marksman" },
  { id: "layla", name: "Layla", role: "marksman" },
  { id: "moskov", name: "Moskov", role: "marksman" },
  { id: "yi-sun-shin", name: "Yi Sun-shin", role: "marksman" },
  { id: "lesley", name: "Lesley", role: "marksman" },
  { id: "karrie", name: "Karrie", role: "marksman" },
  { id: "irithel", name: "Irithel", role: "marksman" },
  { id: "hanabi", name: "Hanabi", role: "marksman" },
  { id: "claude", name: "Claude", role: "marksman" },
  { id: "granger", name: "Granger", role: "marksman" },
  { id: "wanwan", name: "Wanwan", role: "marksman" },
  { id: "brody", name: "Brody", role: "marksman" },
  { id: "beatrix", name: "Beatrix", role: "marksman" },
  { id: "natan", name: "Natan", role: "marksman" },
  { id: "melissa", name: "Melissa", role: "marksman" },
  { id: "ixia", name: "Ixia", role: "marksman" },
  { id: "rafaela", name: "Rafaela", role: "support" },
  { id: "diggie", name: "Diggie", role: "support" },
  { id: "estes", name: "Estes", role: "support" },
  { id: "angela", name: "Angela", role: "support" },
  { id: "faramis", name: "Faramis", role: "support" },
  { id: "mathilda", name: "Mathilda", role: "support" },
  { id: "floryn", name: "Floryn", role: "support" },
  { id: "carmilla", name: "Carmilla", role: "support" },
  { id: "kaja", name: "Kaja", role: "support" },
];

const byId = new Map(heroes.map((hero) => [hero.id, hero]));

export function heroById(id: string) {
  return byId.get(id) ?? null;
}

export const heroRoles: HeroRole[] = ["tank", "fighter", "assassin", "mage", "marksman", "support"];

export type HeroLane = "gold" | "exp" | "mid" | "jungle" | "roam";

export const laneLabels: Record<HeroLane, string> = {
  gold: "Gold lane",
  exp: "EXP lane",
  mid: "Mid lane",
  jungle: "Jungle",
  roam: "Roam",
};

/**
 * Default lane for each role. Many heroes are flexible, so this is the
 * conventional lane for the role and is used for search suggestions only.
 */
const roleLane: Record<HeroRole, HeroLane> = {
  marksman: "gold",
  fighter: "exp",
  mage: "mid",
  assassin: "jungle",
  tank: "roam",
  support: "roam",
};

export function heroLane(hero: Hero): HeroLane {
  return roleLane[hero.role];
}

export function roleLabel(role: HeroRole) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function laneMatches(needle: string, lane: HeroLane) {
  const stripped = needle.replace(/\s*lane$/, "").trim();
  if (stripped.length < 2) return false;
  return lane.startsWith(stripped) || laneLabels[lane].toLowerCase().split(" ").some((word) => word !== "lane" && word.startsWith(stripped));
}

function score(hero: Hero, needle: string) {
  const name = hero.name.toLowerCase();
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (name.split(/[\s.-]+/).some((word) => word.startsWith(needle))) return 2;
  if (name.includes(needle)) return 3;
  if (hero.role.startsWith(needle)) return 4;
  if (laneMatches(needle, heroLane(hero))) return 5;
  return -1;
}

/** Local, instant hero search by name, role or lane. Best matches first. */
export function searchHeroes(query: string, limit = Infinity) {
  const needle = normalize(query);
  if (!needle) return heroes.slice(0, limit);
  return heroes
    .map((hero) => ({ hero, rank: score(hero, needle) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.hero.name.localeCompare(b.hero.name))
    .slice(0, limit)
    .map((entry) => entry.hero);
}

/** Hero ids that a free-text query refers to (name, role or lane). Used to filter clips by their hero tags. */
export function resolveHeroQuery(query: string, limit = 60) {
  const needle = normalize(query);
  if (needle.length < 2) return [];
  return searchHeroes(needle, limit).map((hero) => hero.id);
}

/** Tags are stored as lowercase slugs: letters, numbers and dashes (max 40). */
const TAG_PATTERN = /^[a-z0-9-]{1,40}$/;

export function isValidTag(tag: string) {
  return TAG_PATTERN.test(tag);
}

/** "Exp lane" → "exp-lane". Returns "" when nothing usable is left. */
export function slugifyTag(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

/** Display name for a stored tag: the hero name, or the custom tag title-cased ("exp-lane" → "Exp Lane"). */
export function tagLabel(tag: string) {
  const hero = heroById(tag);
  if (hero) return hero.name;
  return tag
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
