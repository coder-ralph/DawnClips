/**
 * Mobile Legends rank and role options for the profile, and the rules for them. Used by the Edit profile form, the
 * server action and the public profile, so all three agree. The database enforces the same rules with CHECK
 * constraints (supabase/schema-phase13.sql); keep the two in step.
 */

export type RankValue =
  | "warrior"
  | "elite"
  | "master"
  | "grandmaster"
  | "epic"
  | "legend"
  | "mythic"
  | "mythical_honor"
  | "mythical_glory"
  | "mythical_immortal";

export type Rank = {
  value: RankValue;
  label: string;
  /**
   * Cumulative stars, which MLBB only counts from Mythic up. Below Mythic a rank is split into divisions with a few
   * stars each, so there is no running total to show.
   */
  stars?: { min: number; max: number };
};

/** The most stars a profile can show. Mythical Immortal has no cap in the game, so this is only a sanity limit. */
export const maxRankStars = 9999;

/** Lowest to highest, in the order they are listed in the form. */
export const ranks: readonly Rank[] = [
  { value: "warrior", label: "Warrior" },
  { value: "elite", label: "Elite" },
  { value: "master", label: "Master" },
  { value: "grandmaster", label: "Grandmaster" },
  { value: "epic", label: "Epic" },
  { value: "legend", label: "Legend" },
  { value: "mythic", label: "Mythic", stars: { min: 0, max: 24 } },
  { value: "mythical_honor", label: "Mythical Honor", stars: { min: 25, max: 49 } },
  { value: "mythical_glory", label: "Mythical Glory", stars: { min: 50, max: 99 } },
  { value: "mythical_immortal", label: "Mythical Immortal", stars: { min: 100, max: maxRankStars } },
];

export function isRank(value: unknown): value is RankValue {
  return typeof value === "string" && ranks.some((rank) => rank.value === value);
}

export function rankInfo(value: string | null | undefined): Rank | null {
  return ranks.find((rank) => rank.value === value) ?? null;
}

export function rankLabel(value: string | null | undefined): string {
  return rankInfo(value)?.label ?? "";
}

/** "0–24 stars", "100 or more stars", or null for a rank that has no star count. */
export function starRangeText(value: string | null | undefined): string | null {
  const range = rankInfo(value)?.stars;
  if (!range) return null;
  return range.max === maxRankStars ? `${range.min} or more stars` : `${range.min}–${range.max} stars`;
}

export function formatStars(stars: number): string {
  return `${stars} ${stars === 1 ? "star" : "stars"}`;
}

/**
 * Why a star count does not fit the chosen rank, or null when it does (an empty count is always fine: stars are
 * optional). `stars` is the raw text from the form.
 */
export function starsError(rank: string, stars: string): string | null {
  const text = stars.trim();
  if (text === "") return null;
  if (!/^[0-9]{1,4}$/.test(text)) return "Stars must be a whole number.";
  const info = rankInfo(rank);
  if (!info) return "Choose a rank before adding stars.";
  if (!info.stars) return `Stars are not counted for ${info.label}.`;
  const value = Number(text);
  if (value < info.stars.min || value > info.stars.max) {
    return `${info.label} is ${starRangeText(info.value)?.replace(/ stars$/, "")} stars.`;
  }
  return null;
}

export type RoleValue = "tank" | "fighter" | "assassin" | "mage" | "marksman" | "support" | "all_rounder";

export const roles: readonly { value: RoleValue; label: string }[] = [
  { value: "tank", label: "Tank" },
  { value: "fighter", label: "Fighter" },
  { value: "assassin", label: "Assassin" },
  { value: "mage", label: "Mage" },
  { value: "marksman", label: "Marksman" },
  { value: "support", label: "Support" },
  { value: "all_rounder", label: "All-Rounder" },
];

export const maxFavoriteRoles = 2;
export const allRounder: RoleValue = "all_rounder";

export function isRole(value: unknown): value is RoleValue {
  return typeof value === "string" && roles.some((role) => role.value === value);
}

export function roleLabel(value: string): string {
  return roles.find((role) => role.value === value)?.label ?? value;
}

/** Valid roles only, each once, in the order of the list above (so "Tank / Mage" never shows as "Mage / Tank"). */
export function normalizeRoles(values: readonly unknown[]): RoleValue[] {
  return roles.map((role) => role.value).filter((value) => values.includes(value));
}

/** "Tank / Mage". Empty when there are none. */
export function formatRoles(values: readonly string[]): string {
  return normalizeRoles(values).map(roleLabel).join(" / ");
}

/** Why a set of roles is not allowed, or null when it is. */
export function rolesError(values: readonly string[]): string | null {
  if (values.some((value) => !isRole(value))) return "Choose roles from the list.";
  if (new Set(values).size !== values.length) return "Choose each role once.";
  if (values.length > maxFavoriteRoles) return "Choose up to two roles.";
  if (values.includes(allRounder) && values.length > 1) return "All-Rounder can't be combined with other roles.";
  return null;
}

/** Whether `role` can be added to `current` right now. Removing is always possible. */
export function canSelectRole(current: readonly RoleValue[], role: RoleValue): boolean {
  if (current.includes(role)) return true;
  // All-Rounder replaces whatever is chosen, and any other role replaces All-Rounder.
  if (role === allRounder || current.includes(allRounder)) return true;
  return current.length < maxFavoriteRoles;
}

/** The selection after clicking `role`: toggles it, keeping All-Rounder on its own and at most two roles. */
export function toggleRole(current: readonly RoleValue[], role: RoleValue): RoleValue[] {
  if (current.includes(role)) return current.filter((value) => value !== role);
  if (!canSelectRole(current, role)) return [...current];
  if (role === allRounder) return [allRounder];
  return normalizeRoles([...current.filter((value) => value !== allRounder), role]);
}
