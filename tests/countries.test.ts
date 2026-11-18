import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  countries,
  countryName,
  isCountryCode,
  normalizeCountryText,
  otherCountries,
  pinnedCountries,
  searchCountries,
} from "../lib/countries";
import { profileUpdateSchema } from "../lib/validations/profile";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const legacyEleven = [
  ["PH", "Philippines"],
  ["ID", "Indonesia"],
  ["MY", "Malaysia"],
  ["SG", "Singapore"],
  ["TH", "Thailand"],
  ["VN", "Vietnam"],
  ["US", "United States"],
  ["GB", "United Kingdom"],
  ["BR", "Brazil"],
  ["JP", "Japan"],
  ["KR", "South Korea"],
] as const;

test("the list holds all 249 ISO 3166-1 entries, each once, as alpha-2 codes", () => {
  assert.equal(countries.length, 249);
  assert.equal(pinnedCountries.length + otherCountries.length, 249);
  assert.equal(new Set(countries.map((country) => country.code)).size, 249);
  assert.equal(new Set(countries.map((country) => country.label)).size, 249);
  for (const country of countries) assert.match(country.code, /^[A-Z]{2}$/, country.code);
  // Countries and territories alike, including ones MLBB is not offered in. Kosovo is not an ISO 3166-1 entry.
  for (const code of ["AQ", "AX", "HK", "TW", "PS", "GL", "PR", "KP", "IR", "RU", "CU", "ZW"]) assert.ok(isCountryCode(code), code);
  assert.equal(isCountryCode("XK"), false);
  // Every code resolves to a real region name in the runtime's own ICU data, so none is a typo or an unassigned code.
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (const country of countries) assert.notEqual(names.of(country.code), country.code, country.code);
});

test("the 11 popular countries come first, in their exact old order and with their old names", () => {
  assert.deepEqual(
    countries.slice(0, 11).map((country) => [country.code, country.label]),
    legacyEleven.map((pair) => [...pair]),
  );
  assert.deepEqual(pinnedCountries.map((country) => country.code), legacyEleven.map(([code]) => code));
  // They are not repeated in the alphabetical part.
  const pinnedCodes = new Set(pinnedCountries.map((country) => country.code));
  assert.equal(otherCountries.some((country) => pinnedCodes.has(country.code)), false);
  assert.equal(otherCountries.length, 238);
});

test("the remaining countries are sorted A-Z, ignoring accents", () => {
  const key = (country: { label: string }) => normalizeCountryText(country.label);
  for (let i = 1; i < otherCountries.length; i += 1) {
    assert.ok(key(otherCountries[i - 1]) <= key(otherCountries[i]), `${otherCountries[i - 1].label} before ${otherCountries[i].label}`);
  }
  // The same order a locale-aware sort gives.
  const collator = new Intl.Collator("en");
  for (let i = 1; i < otherCountries.length; i += 1) {
    assert.ok(collator.compare(otherCountries[i - 1].label, otherCountries[i].label) <= 0, `${otherCountries[i - 1].label} / ${otherCountries[i].label}`);
  }
  assert.equal(otherCountries[0].label, "Afghanistan");
  assert.equal(otherCountries.at(-1)?.label, "Zimbabwe");
});

test("names for stored codes: every code has one, an unknown code is shown as it is", () => {
  for (const [code, label] of legacyEleven) assert.equal(countryName(code), label);
  assert.equal(countryName("DE"), "Germany");
  assert.equal(countryName("ZW"), "Zimbabwe");
  assert.equal(countryName("XK"), "XK");
});

test("search finds countries by name, word, code, accent-free spelling and common alternative names", () => {
  assert.equal(searchCountries("").length, 249);
  assert.equal(searchCountries("   ").length, 249);
  const first = (query: string) => searchCountries(query)[0]?.label;
  assert.equal(first("phil"), "Philippines");
  assert.equal(first("ph"), "Philippines");
  assert.equal(first("id"), "Indonesia");
  assert.equal(first("uk"), "United Kingdom");
  assert.equal(first("usa"), "United States");
  assert.equal(first("america"), "United States");
  assert.equal(first("turkey"), "Türkiye");
  assert.equal(first("turkiye"), "Türkiye");
  assert.equal(first("cote"), "Côte d'Ivoire");
  assert.equal(first("ivory coast"), "Côte d'Ivoire");
  assert.equal(first("czech republic"), "Czechia");
  assert.equal(first("viet nam"), "Vietnam");
  assert.equal(first("burma"), "Myanmar");
  assert.equal(first("zimb"), "Zimbabwe");
  // A name that starts with the text beats one that only contains it; pinned countries lead among equals.
  assert.deepEqual(searchCountries("ind").slice(0, 2).map((country) => country.label), ["Indonesia", "India"]);
  assert.deepEqual(searchCountries("congo").map((country) => country.label), ["Congo", "Democratic Republic of the Congo"]);
  assert.equal(searchCountries("zzzz").length, 0);
});

test("profile validation accepts every listed code and rejects anything else, including the old display names", () => {
  const base = { displayName: "Ralph", username: "ralph", bio: "", roleId: "", zoneId: "" };
  for (const country of countries) assert.equal(profileUpdateSchema.safeParse({ ...base, country: country.code }).success, true, country.code);
  for (const bad of ["", "ph", "Philippines", "ZZ", "XX", "XK", "P", "PHL", "P1"]) {
    const result = profileUpdateSchema.safeParse({ ...base, country: bad });
    assert.equal(result.success, false, bad);
    if (!result.success) assert.equal(result.error.issues[0].message, "Choose a country.");
  }
});

test("the database already stores alpha-2 codes, so no migration is needed", () => {
  const schema = read("supabase/schema.sql");
  assert.match(schema, /country text not null default 'PH'/);
  assert.match(schema, /constraint profiles_country_format check \(country ~ '\^\[A-Z\]\{2\}\$'\)/);
  // Every code in the list passes that check, and every value the old dropdown could save is still in the list.
  for (const country of countries) assert.match(country.code, /^[A-Z]{2}$/);
  for (const [code] of legacyEleven) assert.ok(isCountryCode(code));
  // This change adds no SQL file.
  assert.equal(existsSync(new URL("../supabase/schema-phase13.sql", import.meta.url)), false);
});

test("the edit-profile form uses the searchable picker and posts the code; the profile shows the name", () => {
  const modal = strip(read("components/profile/edit-profile-modal.tsx"));
  assert.match(modal, /<CountrySelect id=\{countryId\} name="country" defaultValue=\{profile\.country\} \/>/);
  assert.doesNotMatch(modal, /<select/);
  assert.match(modal, /<label htmlFor=\{countryId\}[^>]*>Country<\/label>/);

  const picker = strip(read("components/ui/country-select.tsx"));
  assert.match(picker, /role="combobox"/);
  assert.match(picker, /aria-controls=\{listId\}/);
  assert.match(picker, /aria-activedescendant=/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /role="option"/);
  // The value that is submitted is the code, in a hidden field; the visible text box has no name.
  assert.match(picker, /<input type="hidden" name=\{name\} value=\{value\} \/>/);
  assert.equal((picker.match(/name=\{name\}/g) ?? []).length, 1);
  // Enter picks without submitting the form; Escape closes only the list.
  assert.match(picker, /event\.key === "Enter" && open[\s\S]*?event\.preventDefault\(\)/);
  assert.match(picker, /event\.key === "Escape" && open[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)/);
  // Pinned countries, a divider, then the rest.
  assert.match(picker, /pinnedCountries\.map[\s\S]*?border-t[\s\S]*?otherCountries\.map/);

  const view = strip(read("components/profile/profile-view.tsx"));
  assert.match(view, /countryName\(profile\.country\)/);
});
