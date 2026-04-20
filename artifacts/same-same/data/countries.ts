// Master list of countries the user can pick as "home". Names match the
// labels we use elsewhere in the app, codes are ISO 3166-1 alpha-2.
// Flag emojis are derived from the code so we never go out of sync.

export interface Country {
  code: string;
  name: string;
  flag: string;
}

const NAMES: Record<string, string> = {
  // Europe
  GB: "United Kingdom", IE: "Ireland", FR: "France", DE: "Germany",
  IT: "Italy", ES: "Spain", PT: "Portugal", NL: "Netherlands",
  BE: "Belgium", LU: "Luxembourg", CH: "Switzerland", AT: "Austria",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland",
  IS: "Iceland", PL: "Poland", CZ: "Czechia", SK: "Slovakia",
  HU: "Hungary", RO: "Romania", BG: "Bulgaria", GR: "Greece",
  HR: "Croatia", SI: "Slovenia", BA: "Bosnia and Herzegovina",
  RS: "Serbia", ME: "Montenegro", MK: "North Macedonia", AL: "Albania",
  XK: "Kosovo", LT: "Lithuania", LV: "Latvia", EE: "Estonia",
  BY: "Belarus", UA: "Ukraine", MD: "Moldova", RU: "Russia",
  MT: "Malta", CY: "Cyprus",

  // Asia
  CN: "China", JP: "Japan", KR: "South Korea", KP: "North Korea",
  IN: "India", TH: "Thailand", VN: "Vietnam", ID: "Indonesia",
  PH: "Philippines", MY: "Malaysia", SG: "Singapore", BD: "Bangladesh",
  PK: "Pakistan", NP: "Nepal", LK: "Sri Lanka", MM: "Myanmar",
  KH: "Cambodia", LA: "Laos", MN: "Mongolia", TW: "Taiwan",
  HK: "Hong Kong", BT: "Bhutan", MV: "Maldives", TL: "Timor-Leste",
  BN: "Brunei", AF: "Afghanistan", IR: "Iran", IQ: "Iraq",
  SY: "Syria", SA: "Saudi Arabia", AE: "United Arab Emirates",
  QA: "Qatar", KW: "Kuwait", BH: "Bahrain", OM: "Oman", YE: "Yemen",
  JO: "Jordan", LB: "Lebanon", IL: "Israel", PS: "Palestine",
  TR: "Turkey", AZ: "Azerbaijan", GE: "Georgia", AM: "Armenia",
  KZ: "Kazakhstan", UZ: "Uzbekistan", TM: "Turkmenistan", TJ: "Tajikistan",
  KG: "Kyrgyzstan",

  // Africa
  NG: "Nigeria", ZA: "South Africa", KE: "Kenya", ET: "Ethiopia",
  GH: "Ghana", TZ: "Tanzania", UG: "Uganda", DZ: "Algeria",
  SD: "Sudan", EG: "Egypt", MA: "Morocco", TN: "Tunisia",
  LY: "Libya", CM: "Cameroon", CI: "Côte d'Ivoire", SN: "Senegal",
  ML: "Mali", BF: "Burkina Faso", NE: "Niger", MW: "Malawi",
  ZM: "Zambia", ZW: "Zimbabwe", MZ: "Mozambique", AO: "Angola",
  RW: "Rwanda", SO: "Somalia", MG: "Madagascar", CD: "DR Congo",
  CG: "Republic of the Congo", GA: "Gabon", GN: "Guinea",
  SL: "Sierra Leone", LR: "Liberia", GW: "Guinea-Bissau", GM: "Gambia",
  CV: "Cape Verde", ST: "São Tomé and Príncipe", EH: "Western Sahara",
  MR: "Mauritania", TG: "Togo", BJ: "Benin", GQ: "Equatorial Guinea",
  CF: "Central African Republic", TD: "Chad", SS: "South Sudan",
  BI: "Burundi", DJ: "Djibouti", KM: "Comoros", ER: "Eritrea",
  SC: "Seychelles", MU: "Mauritius", NA: "Namibia", BW: "Botswana",
  LS: "Lesotho", SZ: "Eswatini",

  // North America
  US: "United States", CA: "Canada", MX: "Mexico", GT: "Guatemala",
  BZ: "Belize", SV: "El Salvador", HN: "Honduras", NI: "Nicaragua",
  CR: "Costa Rica", PA: "Panama", CU: "Cuba", DO: "Dominican Republic",
  HT: "Haiti", JM: "Jamaica", BS: "Bahamas", BB: "Barbados",
  TT: "Trinidad and Tobago", LC: "Saint Lucia",
  VC: "Saint Vincent and the Grenadines", GD: "Grenada",
  AG: "Antigua and Barbuda", DM: "Dominica", KN: "Saint Kitts and Nevis",

  // South America
  BR: "Brazil", AR: "Argentina", CL: "Chile", CO: "Colombia",
  PE: "Peru", VE: "Venezuela", EC: "Ecuador", BO: "Bolivia",
  PY: "Paraguay", UY: "Uruguay", GY: "Guyana", SR: "Suriname",

  // Oceania
  AU: "Australia", NZ: "New Zealand", FJ: "Fiji", PG: "Papua New Guinea",
  SB: "Solomon Islands", VU: "Vanuatu", WS: "Samoa", TO: "Tonga",
  KI: "Kiribati", FM: "Micronesia", PW: "Palau",
  MH: "Marshall Islands", NR: "Nauru", TV: "Tuvalu",
};

/** Build a flag emoji from an ISO-3166 alpha-2 code. */
export function flagFor(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length !== 2) return "🌍";
  const A = 0x1f1e6;
  const a = "A".charCodeAt(0);
  return String.fromCodePoint(
    A + upper.charCodeAt(0) - a,
    A + upper.charCodeAt(1) - a,
  );
}

export function nameFor(code: string): string | undefined {
  return NAMES[code.toUpperCase()];
}

/** Sorted list of every country the user can pick. */
export const COUNTRIES: Country[] = Object.entries(NAMES)
  .map(([code, name]) => ({ code, name, flag: flagFor(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));
