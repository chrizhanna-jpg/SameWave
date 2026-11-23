/**
 * Countries the user can pick as home, grouped by continent.
 * Codes are ISO 3166-1 alpha-2. Flags are derived from the code.
 */

export type Continent =
  | "europe"
  | "asia"
  | "africa"
  | "northAmerica"
  | "southAmerica"
  | "oceania";

export interface Country {
  code: string;
  name: string;
  flag: string;
  continent: Continent;
}

const BY_CONTINENT: Record<Continent, Record<string, string>> = {
  europe: {
    GB: "United Kingdom",
    IE: "Ireland",
    FR: "France",
    DE: "Germany",
    IT: "Italy",
    ES: "Spain",
    PT: "Portugal",
    NL: "Netherlands",
    BE: "Belgium",
    LU: "Luxembourg",
    CH: "Switzerland",
    AT: "Austria",
    SE: "Sweden",
    NO: "Norway",
    DK: "Denmark",
    FI: "Finland",
    IS: "Iceland",
    PL: "Poland",
    CZ: "Czechia",
    SK: "Slovakia",
    HU: "Hungary",
    RO: "Romania",
    BG: "Bulgaria",
    GR: "Greece",
    HR: "Croatia",
    SI: "Slovenia",
    BA: "Bosnia and Herzegovina",
    RS: "Serbia",
    ME: "Montenegro",
    MK: "North Macedonia",
    AL: "Albania",
    XK: "Kosovo",
    LT: "Lithuania",
    LV: "Latvia",
    EE: "Estonia",
    BY: "Belarus",
    UA: "Ukraine",
    MD: "Moldova",
    RU: "Russia",
    MT: "Malta",
    CY: "Cyprus",
  },
  asia: {
    CN: "China",
    JP: "Japan",
    KR: "South Korea",
    KP: "North Korea",
    IN: "India",
    TH: "Thailand",
    VN: "Vietnam",
    ID: "Indonesia",
    PH: "Philippines",
    MY: "Malaysia",
    SG: "Singapore",
    BD: "Bangladesh",
    PK: "Pakistan",
    NP: "Nepal",
    LK: "Sri Lanka",
    MM: "Myanmar",
    KH: "Cambodia",
    LA: "Laos",
    MN: "Mongolia",
    TW: "Taiwan",
    HK: "Hong Kong",
    BT: "Bhutan",
    MV: "Maldives",
    TL: "Timor-Leste",
    BN: "Brunei",
    AF: "Afghanistan",
    IR: "Iran",
    IQ: "Iraq",
    SY: "Syria",
    SA: "Saudi Arabia",
    AE: "United Arab Emirates",
    QA: "Qatar",
    KW: "Kuwait",
    BH: "Bahrain",
    OM: "Oman",
    YE: "Yemen",
    JO: "Jordan",
    LB: "Lebanon",
    IL: "Israel",
    PS: "Palestine",
    TR: "Turkey",
    AZ: "Azerbaijan",
    GE: "Georgia",
    AM: "Armenia",
    KZ: "Kazakhstan",
    UZ: "Uzbekistan",
    TM: "Turkmenistan",
    TJ: "Tajikistan",
    KG: "Kyrgyzstan",
  },
  africa: {
    NG: "Nigeria",
    ZA: "South Africa",
    KE: "Kenya",
    ET: "Ethiopia",
    GH: "Ghana",
    TZ: "Tanzania",
    UG: "Uganda",
    DZ: "Algeria",
    SD: "Sudan",
    EG: "Egypt",
    MA: "Morocco",
    TN: "Tunisia",
    LY: "Libya",
    CM: "Cameroon",
    CI: "Côte d'Ivoire",
    SN: "Senegal",
    ML: "Mali",
    BF: "Burkina Faso",
    NE: "Niger",
    MW: "Malawi",
    ZM: "Zambia",
    ZW: "Zimbabwe",
    MZ: "Mozambique",
    AO: "Angola",
    RW: "Rwanda",
    SO: "Somalia",
    MG: "Madagascar",
    CD: "DR Congo",
    CG: "Republic of the Congo",
    GA: "Gabon",
    GN: "Guinea",
    SL: "Sierra Leone",
    LR: "Liberia",
    GW: "Guinea-Bissau",
    GM: "Gambia",
    CV: "Cape Verde",
    ST: "São Tomé and Príncipe",
    EH: "Western Sahara",
    MR: "Mauritania",
    TG: "Togo",
    BJ: "Benin",
    GQ: "Equatorial Guinea",
    CF: "Central African Republic",
    TD: "Chad",
    SS: "South Sudan",
    BI: "Burundi",
    DJ: "Djibouti",
    KM: "Comoros",
    ER: "Eritrea",
    SC: "Seychelles",
    MU: "Mauritius",
    NA: "Namibia",
    BW: "Botswana",
    LS: "Lesotho",
    SZ: "Eswatini",
  },
  northAmerica: {
    US: "United States",
    CA: "Canada",
    MX: "Mexico",
    GT: "Guatemala",
    BZ: "Belize",
    SV: "El Salvador",
    HN: "Honduras",
    NI: "Nicaragua",
    CR: "Costa Rica",
    PA: "Panama",
    CU: "Cuba",
    DO: "Dominican Republic",
    HT: "Haiti",
    JM: "Jamaica",
    BS: "Bahamas",
    BB: "Barbados",
    TT: "Trinidad and Tobago",
    LC: "Saint Lucia",
    VC: "Saint Vincent and the Grenadines",
    GD: "Grenada",
    AG: "Antigua and Barbuda",
    DM: "Dominica",
    KN: "Saint Kitts and Nevis",
  },
  southAmerica: {
    BR: "Brazil",
    AR: "Argentina",
    CL: "Chile",
    CO: "Colombia",
    PE: "Peru",
    VE: "Venezuela",
    EC: "Ecuador",
    BO: "Bolivia",
    PY: "Paraguay",
    UY: "Uruguay",
    GY: "Guyana",
    SR: "Suriname",
  },
  oceania: {
    AU: "Australia",
    NZ: "New Zealand",
    FJ: "Fiji",
    PG: "Papua New Guinea",
    SB: "Solomon Islands",
    VU: "Vanuatu",
    WS: "Samoa",
    TO: "Tonga",
    KI: "Kiribati",
    FM: "Micronesia",
    PW: "Palau",
    MH: "Marshall Islands",
    NR: "Nauru",
    TV: "Tuvalu",
  },
};

const NAMES: Record<string, string> = {};
const CONTINENTS: Record<string, Continent> = {};
for (const continent of Object.keys(BY_CONTINENT) as Continent[]) {
  for (const [code, name] of Object.entries(BY_CONTINENT[continent])) {
    NAMES[code] = name;
    CONTINENTS[code] = continent;
  }
}

/** Uppercase two-letter code, or null when the input is not one. */
export function normalizeCountryCode(code: string | null | undefined): string | null {
  if (typeof code !== "string") return null;
  const upper = code.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

export function flagFor(code: string | null | undefined): string {
  const upper = normalizeCountryCode(code);
  if (!upper) return "";
  const base = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(base + upper.charCodeAt(0), base + upper.charCodeAt(1));
}

export function nameFor(code: string | null | undefined): string | null {
  const upper = normalizeCountryCode(code);
  return upper ? (NAMES[upper] ?? null) : null;
}

export function continentFor(code: string | null | undefined): Continent | null {
  const upper = normalizeCountryCode(code);
  return upper ? (CONTINENTS[upper] ?? null) : null;
}

export const COUNTRIES: Country[] = Object.keys(NAMES)
  .map((code) => ({
    code,
    name: NAMES[code] as string,
    flag: flagFor(code),
    continent: CONTINENTS[code] as Continent,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
