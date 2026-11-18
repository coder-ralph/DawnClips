/**
 * Countries for the profile form.
 *
 * Source: ISO 3166-1 (alpha-2 code + English short name), all 249 officially assigned entries (countries and
 * territories), from the Debian iso-codes data as published in the `pycountry` 26.2.16 package. Kosovo (XK) is
 * left out because it is not an ISO 3166-1 entry. Names are the "common" ISO names where iso-codes has one
 * ("South Korea", "Vietnam"), and ISO's inverted names ("Virgin Islands, British") are written the usual way round
 * for CD, FM, PS, VG and VI. The data is static, so every browser and the server show identical names and order.
 *
 * Order: the 11 countries below stay pinned first, in this exact order, then the remaining 238 follow A-Z
 * (accents ignored). `search` holds extra words people type for a country ("usa", "ivory coast").
 * The database stores only the alpha-2 code (`profiles.country`, checked as two capital letters).
 */
export type Country = { code: string; label: string; search?: string };

/** MLBB's most popular countries, shown first in this order. */
export const pinnedCountries: readonly Country[] = [
  { code: "PH", label: "Philippines" },
  { code: "ID", label: "Indonesia" },
  { code: "MY", label: "Malaysia" },
  { code: "SG", label: "Singapore" },
  { code: "TH", label: "Thailand" },
  { code: "VN", label: "Vietnam", search: "viet nam" },
  { code: "US", label: "United States", search: "usa america united states of america" },
  { code: "GB", label: "United Kingdom", search: "uk great britain britain england scotland wales northern ireland" },
  { code: "BR", label: "Brazil" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
];

/** Every other ISO 3166-1 entry, A-Z by name. */
export const otherCountries: readonly Country[] = [
  { code: "AF", label: "Afghanistan" },
  { code: "AX", label: "Åland Islands" },
  { code: "AL", label: "Albania" },
  { code: "DZ", label: "Algeria" },
  { code: "AS", label: "American Samoa" },
  { code: "AD", label: "Andorra" },
  { code: "AO", label: "Angola" },
  { code: "AI", label: "Anguilla" },
  { code: "AQ", label: "Antarctica" },
  { code: "AG", label: "Antigua and Barbuda" },
  { code: "AR", label: "Argentina" },
  { code: "AM", label: "Armenia" },
  { code: "AW", label: "Aruba" },
  { code: "AU", label: "Australia" },
  { code: "AT", label: "Austria" },
  { code: "AZ", label: "Azerbaijan" },
  { code: "BS", label: "Bahamas" },
  { code: "BH", label: "Bahrain" },
  { code: "BD", label: "Bangladesh" },
  { code: "BB", label: "Barbados" },
  { code: "BY", label: "Belarus" },
  { code: "BE", label: "Belgium" },
  { code: "BZ", label: "Belize" },
  { code: "BJ", label: "Benin" },
  { code: "BM", label: "Bermuda" },
  { code: "BT", label: "Bhutan" },
  { code: "BO", label: "Bolivia" },
  { code: "BQ", label: "Bonaire, Sint Eustatius and Saba" },
  { code: "BA", label: "Bosnia and Herzegovina" },
  { code: "BW", label: "Botswana" },
  { code: "BV", label: "Bouvet Island" },
  { code: "IO", label: "British Indian Ocean Territory" },
  { code: "VG", label: "British Virgin Islands" },
  { code: "BN", label: "Brunei Darussalam" },
  { code: "BG", label: "Bulgaria" },
  { code: "BF", label: "Burkina Faso" },
  { code: "BI", label: "Burundi" },
  { code: "CV", label: "Cabo Verde", search: "cape verde" },
  { code: "KH", label: "Cambodia" },
  { code: "CM", label: "Cameroon" },
  { code: "CA", label: "Canada" },
  { code: "KY", label: "Cayman Islands" },
  { code: "CF", label: "Central African Republic" },
  { code: "TD", label: "Chad" },
  { code: "CL", label: "Chile" },
  { code: "CN", label: "China" },
  { code: "CX", label: "Christmas Island" },
  { code: "CC", label: "Cocos (Keeling) Islands" },
  { code: "CO", label: "Colombia" },
  { code: "KM", label: "Comoros" },
  { code: "CG", label: "Congo", search: "congo brazzaville" },
  { code: "CK", label: "Cook Islands" },
  { code: "CR", label: "Costa Rica" },
  { code: "CI", label: "Côte d'Ivoire", search: "ivory coast" },
  { code: "HR", label: "Croatia" },
  { code: "CU", label: "Cuba" },
  { code: "CW", label: "Curaçao" },
  { code: "CY", label: "Cyprus" },
  { code: "CZ", label: "Czechia", search: "czech republic" },
  { code: "CD", label: "Democratic Republic of the Congo", search: "drc congo kinshasa" },
  { code: "DK", label: "Denmark" },
  { code: "DJ", label: "Djibouti" },
  { code: "DM", label: "Dominica" },
  { code: "DO", label: "Dominican Republic" },
  { code: "EC", label: "Ecuador" },
  { code: "EG", label: "Egypt" },
  { code: "SV", label: "El Salvador" },
  { code: "GQ", label: "Equatorial Guinea" },
  { code: "ER", label: "Eritrea" },
  { code: "EE", label: "Estonia" },
  { code: "SZ", label: "Eswatini", search: "swaziland" },
  { code: "ET", label: "Ethiopia" },
  { code: "FK", label: "Falkland Islands (Malvinas)" },
  { code: "FO", label: "Faroe Islands" },
  { code: "FJ", label: "Fiji" },
  { code: "FI", label: "Finland" },
  { code: "FR", label: "France" },
  { code: "GF", label: "French Guiana" },
  { code: "PF", label: "French Polynesia" },
  { code: "TF", label: "French Southern Territories" },
  { code: "GA", label: "Gabon" },
  { code: "GM", label: "Gambia" },
  { code: "GE", label: "Georgia" },
  { code: "DE", label: "Germany" },
  { code: "GH", label: "Ghana" },
  { code: "GI", label: "Gibraltar" },
  { code: "GR", label: "Greece" },
  { code: "GL", label: "Greenland" },
  { code: "GD", label: "Grenada" },
  { code: "GP", label: "Guadeloupe" },
  { code: "GU", label: "Guam" },
  { code: "GT", label: "Guatemala" },
  { code: "GG", label: "Guernsey" },
  { code: "GN", label: "Guinea" },
  { code: "GW", label: "Guinea-Bissau" },
  { code: "GY", label: "Guyana" },
  { code: "HT", label: "Haiti" },
  { code: "HM", label: "Heard Island and McDonald Islands" },
  { code: "VA", label: "Holy See (Vatican City State)" },
  { code: "HN", label: "Honduras" },
  { code: "HK", label: "Hong Kong" },
  { code: "HU", label: "Hungary" },
  { code: "IS", label: "Iceland" },
  { code: "IN", label: "India" },
  { code: "IR", label: "Iran" },
  { code: "IQ", label: "Iraq" },
  { code: "IE", label: "Ireland" },
  { code: "IM", label: "Isle of Man" },
  { code: "IL", label: "Israel" },
  { code: "IT", label: "Italy" },
  { code: "JM", label: "Jamaica" },
  { code: "JE", label: "Jersey" },
  { code: "JO", label: "Jordan" },
  { code: "KZ", label: "Kazakhstan" },
  { code: "KE", label: "Kenya" },
  { code: "KI", label: "Kiribati" },
  { code: "KW", label: "Kuwait" },
  { code: "KG", label: "Kyrgyzstan" },
  { code: "LA", label: "Laos" },
  { code: "LV", label: "Latvia" },
  { code: "LB", label: "Lebanon" },
  { code: "LS", label: "Lesotho" },
  { code: "LR", label: "Liberia" },
  { code: "LY", label: "Libya" },
  { code: "LI", label: "Liechtenstein" },
  { code: "LT", label: "Lithuania" },
  { code: "LU", label: "Luxembourg" },
  { code: "MO", label: "Macao", search: "macau" },
  { code: "MG", label: "Madagascar" },
  { code: "MW", label: "Malawi" },
  { code: "MV", label: "Maldives" },
  { code: "ML", label: "Mali" },
  { code: "MT", label: "Malta" },
  { code: "MH", label: "Marshall Islands" },
  { code: "MQ", label: "Martinique" },
  { code: "MR", label: "Mauritania" },
  { code: "MU", label: "Mauritius" },
  { code: "YT", label: "Mayotte" },
  { code: "MX", label: "Mexico" },
  { code: "FM", label: "Micronesia", search: "federated states of micronesia" },
  { code: "MD", label: "Moldova" },
  { code: "MC", label: "Monaco" },
  { code: "MN", label: "Mongolia" },
  { code: "ME", label: "Montenegro" },
  { code: "MS", label: "Montserrat" },
  { code: "MA", label: "Morocco" },
  { code: "MZ", label: "Mozambique" },
  { code: "MM", label: "Myanmar", search: "burma" },
  { code: "NA", label: "Namibia" },
  { code: "NR", label: "Nauru" },
  { code: "NP", label: "Nepal" },
  { code: "NL", label: "Netherlands", search: "holland" },
  { code: "NC", label: "New Caledonia" },
  { code: "NZ", label: "New Zealand" },
  { code: "NI", label: "Nicaragua" },
  { code: "NE", label: "Niger" },
  { code: "NG", label: "Nigeria" },
  { code: "NU", label: "Niue" },
  { code: "NF", label: "Norfolk Island" },
  { code: "KP", label: "North Korea" },
  { code: "MK", label: "North Macedonia" },
  { code: "MP", label: "Northern Mariana Islands" },
  { code: "NO", label: "Norway" },
  { code: "OM", label: "Oman" },
  { code: "PK", label: "Pakistan" },
  { code: "PW", label: "Palau" },
  { code: "PS", label: "Palestine", search: "palestinian territories gaza west bank" },
  { code: "PA", label: "Panama" },
  { code: "PG", label: "Papua New Guinea" },
  { code: "PY", label: "Paraguay" },
  { code: "PE", label: "Peru" },
  { code: "PN", label: "Pitcairn" },
  { code: "PL", label: "Poland" },
  { code: "PT", label: "Portugal" },
  { code: "PR", label: "Puerto Rico" },
  { code: "QA", label: "Qatar" },
  { code: "RE", label: "Réunion" },
  { code: "RO", label: "Romania" },
  { code: "RU", label: "Russian Federation" },
  { code: "RW", label: "Rwanda" },
  { code: "BL", label: "Saint Barthélemy" },
  { code: "SH", label: "Saint Helena, Ascension and Tristan da Cunha" },
  { code: "KN", label: "Saint Kitts and Nevis" },
  { code: "LC", label: "Saint Lucia" },
  { code: "MF", label: "Saint Martin (French part)" },
  { code: "PM", label: "Saint Pierre and Miquelon" },
  { code: "VC", label: "Saint Vincent and the Grenadines" },
  { code: "WS", label: "Samoa" },
  { code: "SM", label: "San Marino" },
  { code: "ST", label: "Sao Tome and Principe" },
  { code: "SA", label: "Saudi Arabia" },
  { code: "SN", label: "Senegal" },
  { code: "RS", label: "Serbia" },
  { code: "SC", label: "Seychelles" },
  { code: "SL", label: "Sierra Leone" },
  { code: "SX", label: "Sint Maarten (Dutch part)" },
  { code: "SK", label: "Slovakia" },
  { code: "SI", label: "Slovenia" },
  { code: "SB", label: "Solomon Islands" },
  { code: "SO", label: "Somalia" },
  { code: "ZA", label: "South Africa" },
  { code: "GS", label: "South Georgia and the South Sandwich Islands" },
  { code: "SS", label: "South Sudan" },
  { code: "ES", label: "Spain" },
  { code: "LK", label: "Sri Lanka" },
  { code: "SD", label: "Sudan" },
  { code: "SR", label: "Suriname" },
  { code: "SJ", label: "Svalbard and Jan Mayen" },
  { code: "SE", label: "Sweden" },
  { code: "CH", label: "Switzerland" },
  { code: "SY", label: "Syria" },
  { code: "TW", label: "Taiwan" },
  { code: "TJ", label: "Tajikistan" },
  { code: "TZ", label: "Tanzania" },
  { code: "TL", label: "Timor-Leste", search: "east timor" },
  { code: "TG", label: "Togo" },
  { code: "TK", label: "Tokelau" },
  { code: "TO", label: "Tonga" },
  { code: "TT", label: "Trinidad and Tobago" },
  { code: "TN", label: "Tunisia" },
  { code: "TR", label: "Türkiye", search: "turkey" },
  { code: "TM", label: "Turkmenistan" },
  { code: "TC", label: "Turks and Caicos Islands" },
  { code: "TV", label: "Tuvalu" },
  { code: "VI", label: "U.S. Virgin Islands" },
  { code: "UG", label: "Uganda" },
  { code: "UA", label: "Ukraine" },
  { code: "AE", label: "United Arab Emirates", search: "uae" },
  { code: "UM", label: "United States Minor Outlying Islands" },
  { code: "UY", label: "Uruguay" },
  { code: "UZ", label: "Uzbekistan" },
  { code: "VU", label: "Vanuatu" },
  { code: "VE", label: "Venezuela" },
  { code: "WF", label: "Wallis and Futuna" },
  { code: "EH", label: "Western Sahara" },
  { code: "YE", label: "Yemen" },
  { code: "ZM", label: "Zambia" },
  { code: "ZW", label: "Zimbabwe" },
];

/** Pinned countries first, then the rest. */
export const countries: readonly Country[] = [...pinnedCountries, ...otherCountries];

const byCode = new Map(countries.map((country) => [country.code, country]));

export function isCountryCode(code: string): boolean {
  return byCode.has(code);
}

/** Display name for a stored code. An unknown code is shown as it is rather than hidden. */
export function countryName(code: string): string {
  return byCode.get(code)?.label ?? code;
}

/** Lower case with accents removed, so "turkiye" finds "Türkiye". */
export function normalizeCountryText(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/**
 * Countries matching what was typed, best match first: the code itself ("ph") or an extra search word that is
 * exactly what was typed ("uk"), a name that starts with it, a word of the name that starts with it, a name that
 * contains it, then the extra search words that contain it. Ties keep the list order
 * (pinned first, then A-Z). An empty query returns the whole list.
 */
export function searchCountries(query: string): readonly Country[] {
  const q = normalizeCountryText(query);
  if (!q) return countries;
  const ranked: { country: Country; rank: number; index: number }[] = [];
  countries.forEach((country, index) => {
    const name = normalizeCountryText(country.label);
    let rank = -1;
    if (country.code.toLowerCase() === q || country.search?.split(" ").includes(q)) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.split(/[\s(),'.-]+/).some((word) => word.startsWith(q))) rank = 2;
    else if (name.includes(q)) rank = 3;
    else if (country.search?.includes(q)) rank = 4;
    if (rank >= 0) ranked.push({ country, rank, index });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((item) => item.country);
}
