/**
 * Country dialling data for the auth flow's phone field.
 *
 * Hand-held rather than pulled from a package on purpose: the only thing the
 * phone input needs is (ISO 3166-1 alpha-2, display name, E.164 calling code),
 * and every off-the-shelf option either ships a metadata blob measured in
 * hundreds of kilobytes or needs a native module and therefore a custom dev
 * build. See lib/phoneNumber.ts for the normalisation that consumes this.
 */

export type Country = {
  /** ISO 3166-1 alpha-2, uppercase. Also the visible abbreviation. */
  code: string;
  name: string;
  /** E.164 country calling code, digits only, no leading '+'. */
  dial: string;
};

/** The default selection everywhere in the auth flow. */
export const DEFAULT_COUNTRY_CODE = 'US';

// [ISO 3166-1 alpha-2, name, calling code]. Sorted by name, except that the
// United States is pinned first so the +1 default is also the first row a user
// sees when the picker opens.
const DATA: ReadonlyArray<readonly [string, string, string]> = [
  ['US', 'United States', '1'],
  ['AF', 'Afghanistan', '93'],
  ['AL', 'Albania', '355'],
  ['DZ', 'Algeria', '213'],
  ['AD', 'Andorra', '376'],
  ['AO', 'Angola', '244'],
  ['AG', 'Antigua and Barbuda', '1268'],
  ['AR', 'Argentina', '54'],
  ['AM', 'Armenia', '374'],
  ['AW', 'Aruba', '297'],
  ['AU', 'Australia', '61'],
  ['AT', 'Austria', '43'],
  ['AZ', 'Azerbaijan', '994'],
  ['BS', 'Bahamas', '1242'],
  ['BH', 'Bahrain', '973'],
  ['BD', 'Bangladesh', '880'],
  ['BB', 'Barbados', '1246'],
  ['BY', 'Belarus', '375'],
  ['BE', 'Belgium', '32'],
  ['BZ', 'Belize', '501'],
  ['BJ', 'Benin', '229'],
  ['BM', 'Bermuda', '1441'],
  ['BT', 'Bhutan', '975'],
  ['BO', 'Bolivia', '591'],
  ['BA', 'Bosnia and Herzegovina', '387'],
  ['BW', 'Botswana', '267'],
  ['BR', 'Brazil', '55'],
  ['BN', 'Brunei', '673'],
  ['BG', 'Bulgaria', '359'],
  ['BF', 'Burkina Faso', '226'],
  ['BI', 'Burundi', '257'],
  ['KH', 'Cambodia', '855'],
  ['CM', 'Cameroon', '237'],
  ['CA', 'Canada', '1'],
  ['CV', 'Cape Verde', '238'],
  ['KY', 'Cayman Islands', '1345'],
  ['CF', 'Central African Republic', '236'],
  ['TD', 'Chad', '235'],
  ['CL', 'Chile', '56'],
  ['CN', 'China', '86'],
  ['CO', 'Colombia', '57'],
  ['KM', 'Comoros', '269'],
  ['CG', 'Congo - Brazzaville', '242'],
  ['CD', 'Congo - Kinshasa', '243'],
  ['CR', 'Costa Rica', '506'],
  ['CI', "Côte d'Ivoire", '225'],
  ['HR', 'Croatia', '385'],
  ['CU', 'Cuba', '53'],
  ['CW', 'Curaçao', '599'],
  ['CY', 'Cyprus', '357'],
  ['CZ', 'Czechia', '420'],
  ['DK', 'Denmark', '45'],
  ['DJ', 'Djibouti', '253'],
  ['DM', 'Dominica', '1767'],
  ['DO', 'Dominican Republic', '1809'],
  ['EC', 'Ecuador', '593'],
  ['EG', 'Egypt', '20'],
  ['SV', 'El Salvador', '503'],
  ['GQ', 'Equatorial Guinea', '240'],
  ['ER', 'Eritrea', '291'],
  ['EE', 'Estonia', '372'],
  ['SZ', 'Eswatini', '268'],
  ['ET', 'Ethiopia', '251'],
  ['FJ', 'Fiji', '679'],
  ['FI', 'Finland', '358'],
  ['FR', 'France', '33'],
  ['GF', 'French Guiana', '594'],
  ['PF', 'French Polynesia', '689'],
  ['GA', 'Gabon', '241'],
  ['GM', 'Gambia', '220'],
  ['GE', 'Georgia', '995'],
  ['DE', 'Germany', '49'],
  ['GH', 'Ghana', '233'],
  ['GI', 'Gibraltar', '350'],
  ['GR', 'Greece', '30'],
  ['GL', 'Greenland', '299'],
  ['GD', 'Grenada', '1473'],
  ['GP', 'Guadeloupe', '590'],
  ['GU', 'Guam', '1671'],
  ['GT', 'Guatemala', '502'],
  ['GN', 'Guinea', '224'],
  ['GW', 'Guinea-Bissau', '245'],
  ['GY', 'Guyana', '592'],
  ['HT', 'Haiti', '509'],
  ['HN', 'Honduras', '504'],
  ['HK', 'Hong Kong SAR China', '852'],
  ['HU', 'Hungary', '36'],
  ['IS', 'Iceland', '354'],
  ['IN', 'India', '91'],
  ['ID', 'Indonesia', '62'],
  ['IR', 'Iran', '98'],
  ['IQ', 'Iraq', '964'],
  ['IE', 'Ireland', '353'],
  ['IL', 'Israel', '972'],
  ['IT', 'Italy', '39'],
  ['JM', 'Jamaica', '1876'],
  ['JP', 'Japan', '81'],
  ['JO', 'Jordan', '962'],
  ['KZ', 'Kazakhstan', '7'],
  ['KE', 'Kenya', '254'],
  ['KI', 'Kiribati', '686'],
  ['KW', 'Kuwait', '965'],
  ['KG', 'Kyrgyzstan', '996'],
  ['LA', 'Laos', '856'],
  ['LV', 'Latvia', '371'],
  ['LB', 'Lebanon', '961'],
  ['LS', 'Lesotho', '266'],
  ['LR', 'Liberia', '231'],
  ['LY', 'Libya', '218'],
  ['LI', 'Liechtenstein', '423'],
  ['LT', 'Lithuania', '370'],
  ['LU', 'Luxembourg', '352'],
  ['MO', 'Macao SAR China', '853'],
  ['MG', 'Madagascar', '261'],
  ['MW', 'Malawi', '265'],
  ['MY', 'Malaysia', '60'],
  ['MV', 'Maldives', '960'],
  ['ML', 'Mali', '223'],
  ['MT', 'Malta', '356'],
  ['MH', 'Marshall Islands', '692'],
  ['MQ', 'Martinique', '596'],
  ['MR', 'Mauritania', '222'],
  ['MU', 'Mauritius', '230'],
  ['MX', 'Mexico', '52'],
  ['FM', 'Micronesia', '691'],
  ['MD', 'Moldova', '373'],
  ['MC', 'Monaco', '377'],
  ['MN', 'Mongolia', '976'],
  ['ME', 'Montenegro', '382'],
  ['MA', 'Morocco', '212'],
  ['MZ', 'Mozambique', '258'],
  ['MM', 'Myanmar', '95'],
  ['NA', 'Namibia', '264'],
  ['NR', 'Nauru', '674'],
  ['NP', 'Nepal', '977'],
  ['NL', 'Netherlands', '31'],
  ['NC', 'New Caledonia', '687'],
  ['NZ', 'New Zealand', '64'],
  ['NI', 'Nicaragua', '505'],
  ['NE', 'Niger', '227'],
  ['NG', 'Nigeria', '234'],
  ['KP', 'North Korea', '850'],
  ['MK', 'North Macedonia', '389'],
  ['NO', 'Norway', '47'],
  ['OM', 'Oman', '968'],
  ['PK', 'Pakistan', '92'],
  ['PW', 'Palau', '680'],
  ['PS', 'Palestinian Territories', '970'],
  ['PA', 'Panama', '507'],
  ['PG', 'Papua New Guinea', '675'],
  ['PY', 'Paraguay', '595'],
  ['PE', 'Peru', '51'],
  ['PH', 'Philippines', '63'],
  ['PL', 'Poland', '48'],
  ['PT', 'Portugal', '351'],
  ['PR', 'Puerto Rico', '1787'],
  ['QA', 'Qatar', '974'],
  ['RE', 'Réunion', '262'],
  ['RO', 'Romania', '40'],
  ['RU', 'Russia', '7'],
  ['RW', 'Rwanda', '250'],
  ['WS', 'Samoa', '685'],
  ['SM', 'San Marino', '378'],
  ['ST', 'São Tomé and Príncipe', '239'],
  ['SA', 'Saudi Arabia', '966'],
  ['SN', 'Senegal', '221'],
  ['RS', 'Serbia', '381'],
  ['SC', 'Seychelles', '248'],
  ['SL', 'Sierra Leone', '232'],
  ['SG', 'Singapore', '65'],
  ['SX', 'Sint Maarten', '1721'],
  ['SK', 'Slovakia', '421'],
  ['SI', 'Slovenia', '386'],
  ['SB', 'Solomon Islands', '677'],
  ['SO', 'Somalia', '252'],
  ['ZA', 'South Africa', '27'],
  ['KR', 'South Korea', '82'],
  ['SS', 'South Sudan', '211'],
  ['ES', 'Spain', '34'],
  ['LK', 'Sri Lanka', '94'],
  ['KN', 'St. Kitts and Nevis', '1869'],
  ['LC', 'St. Lucia', '1758'],
  ['VC', 'St. Vincent and Grenadines', '1784'],
  ['SD', 'Sudan', '249'],
  ['SR', 'Suriname', '597'],
  ['SE', 'Sweden', '46'],
  ['CH', 'Switzerland', '41'],
  ['SY', 'Syria', '963'],
  ['TW', 'Taiwan', '886'],
  ['TJ', 'Tajikistan', '992'],
  ['TZ', 'Tanzania', '255'],
  ['TH', 'Thailand', '66'],
  ['TL', 'Timor-Leste', '670'],
  ['TG', 'Togo', '228'],
  ['TO', 'Tonga', '676'],
  ['TT', 'Trinidad and Tobago', '1868'],
  ['TN', 'Tunisia', '216'],
  ['TR', 'Türkiye', '90'],
  ['TM', 'Turkmenistan', '993'],
  ['TC', 'Turks and Caicos Islands', '1649'],
  ['TV', 'Tuvalu', '688'],
  ['UG', 'Uganda', '256'],
  ['UA', 'Ukraine', '380'],
  ['AE', 'United Arab Emirates', '971'],
  ['GB', 'United Kingdom', '44'],
  ['UY', 'Uruguay', '598'],
  ['UZ', 'Uzbekistan', '998'],
  ['VU', 'Vanuatu', '678'],
  ['VA', 'Vatican City', '379'],
  ['VE', 'Venezuela', '58'],
  ['VN', 'Vietnam', '84'],
  ['VG', 'British Virgin Islands', '1284'],
  ['VI', 'U.S. Virgin Islands', '1340'],
  ['YE', 'Yemen', '967'],
  ['ZM', 'Zambia', '260'],
  ['ZW', 'Zimbabwe', '263'],
];

export const COUNTRIES: readonly Country[] = DATA.map(([code, name, dial]) => ({
  code,
  name,
  dial,
}));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

export const DEFAULT_COUNTRY = BY_CODE.get(DEFAULT_COUNTRY_CODE) as Country;

export function findCountry(code: string): Country | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/**
 * Regional-indicator flag for an ISO alpha-2 code. Rendered next to the
 * abbreviation, never instead of it — Android's emoji font has historically
 * shipped without flag glyphs, and the letters have to stay readable there.
 */
export function flagEmoji(code: string): string {
  const base = 0x1f1e6;
  const a = 'A'.charCodeAt(0);
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split('')
      .map((ch) => base + (ch.charCodeAt(0) - a))
  );
}

/** Case-insensitive match on country name, ISO code, or calling code. */
export function searchCountries(query: string): readonly Country[] {
  const q = query.trim().toLowerCase().replace(/^\+/, '');
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().startsWith(q) ||
      c.dial.startsWith(q)
  );
}
