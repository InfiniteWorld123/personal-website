import * as v from 'valibot'

/**
 * The one worldwide country list, shared by Clients and Leads.
 *
 * `docs/v2/clients.md` and `docs/v2/leads.md`: one searchable, normalized
 * list with stable codes, so `Germany` and `Deutschland` can never become two
 * countries. What is stored is the ISO 3166-1 alpha-2 code (plus `XK`, Kosovo,
 * which is in common use though not yet assigned); the names are only how a
 * code is shown and found.
 *
 * Written out rather than asked of `Intl.DisplayNames` at run time: that data
 * differs between a browser, Node and a Worker, and a list that is not the
 * same everywhere is not one list. Each row carries the English name the
 * Dashboard shows and the German one, so a CSV that says `Deutschland` or
 * `Österreich` still finds its country.
 */

export type Country = { code: string; name: string }

const ROWS: ReadonlyArray<readonly [code: string, english: string, german: string]> = [
  ['AD', 'Andorra', 'Andorra'],
  ['AE', 'United Arab Emirates', 'Vereinigte Arabische Emirate'],
  ['AF', 'Afghanistan', 'Afghanistan'],
  ['AG', 'Antigua & Barbuda', 'Antigua und Barbuda'],
  ['AI', 'Anguilla', 'Anguilla'],
  ['AL', 'Albania', 'Albanien'],
  ['AM', 'Armenia', 'Armenien'],
  ['AO', 'Angola', 'Angola'],
  ['AQ', 'Antarctica', 'Antarktis'],
  ['AR', 'Argentina', 'Argentinien'],
  ['AS', 'American Samoa', 'Amerikanisch-Samoa'],
  ['AT', 'Austria', 'Österreich'],
  ['AU', 'Australia', 'Australien'],
  ['AW', 'Aruba', 'Aruba'],
  ['AX', 'Åland Islands', 'Ålandinseln'],
  ['AZ', 'Azerbaijan', 'Aserbaidschan'],
  ['BA', 'Bosnia & Herzegovina', 'Bosnien und Herzegowina'],
  ['BB', 'Barbados', 'Barbados'],
  ['BD', 'Bangladesh', 'Bangladesch'],
  ['BE', 'Belgium', 'Belgien'],
  ['BF', 'Burkina Faso', 'Burkina Faso'],
  ['BG', 'Bulgaria', 'Bulgarien'],
  ['BH', 'Bahrain', 'Bahrain'],
  ['BI', 'Burundi', 'Burundi'],
  ['BJ', 'Benin', 'Benin'],
  ['BL', 'St. Barthélemy', 'St. Barthélemy'],
  ['BM', 'Bermuda', 'Bermuda'],
  ['BN', 'Brunei', 'Brunei Darussalam'],
  ['BO', 'Bolivia', 'Bolivien'],
  ['BQ', 'Caribbean Netherlands', 'Karibische Niederlande'],
  ['BR', 'Brazil', 'Brasilien'],
  ['BS', 'Bahamas', 'Bahamas'],
  ['BT', 'Bhutan', 'Bhutan'],
  ['BV', 'Bouvet Island', 'Bouvetinsel'],
  ['BW', 'Botswana', 'Botsuana'],
  ['BY', 'Belarus', 'Belarus'],
  ['BZ', 'Belize', 'Belize'],
  ['CA', 'Canada', 'Kanada'],
  ['CC', 'Cocos (Keeling) Islands', 'Kokosinseln'],
  ['CD', 'Congo - Kinshasa', 'Kongo-Kinshasa'],
  ['CF', 'Central African Republic', 'Zentralafrikanische Republik'],
  ['CG', 'Congo - Brazzaville', 'Kongo-Brazzaville'],
  ['CH', 'Switzerland', 'Schweiz'],
  ['CI', 'Côte d’Ivoire', 'Côte d’Ivoire'],
  ['CK', 'Cook Islands', 'Cookinseln'],
  ['CL', 'Chile', 'Chile'],
  ['CM', 'Cameroon', 'Kamerun'],
  ['CN', 'China', 'China'],
  ['CO', 'Colombia', 'Kolumbien'],
  ['CR', 'Costa Rica', 'Costa Rica'],
  ['CU', 'Cuba', 'Kuba'],
  ['CV', 'Cape Verde', 'Cabo Verde'],
  ['CW', 'Curaçao', 'Curaçao'],
  ['CX', 'Christmas Island', 'Weihnachtsinsel'],
  ['CY', 'Cyprus', 'Zypern'],
  ['CZ', 'Czechia', 'Tschechien'],
  ['DE', 'Germany', 'Deutschland'],
  ['DJ', 'Djibouti', 'Dschibuti'],
  ['DK', 'Denmark', 'Dänemark'],
  ['DM', 'Dominica', 'Dominica'],
  ['DO', 'Dominican Republic', 'Dominikanische Republik'],
  ['DZ', 'Algeria', 'Algerien'],
  ['EC', 'Ecuador', 'Ecuador'],
  ['EE', 'Estonia', 'Estland'],
  ['EG', 'Egypt', 'Ägypten'],
  ['EH', 'Western Sahara', 'Westsahara'],
  ['ER', 'Eritrea', 'Eritrea'],
  ['ES', 'Spain', 'Spanien'],
  ['ET', 'Ethiopia', 'Äthiopien'],
  ['FI', 'Finland', 'Finnland'],
  ['FJ', 'Fiji', 'Fidschi'],
  ['FK', 'Falkland Islands', 'Falklandinseln'],
  ['FM', 'Micronesia', 'Mikronesien'],
  ['FO', 'Faroe Islands', 'Färöer'],
  ['FR', 'France', 'Frankreich'],
  ['GA', 'Gabon', 'Gabun'],
  ['GB', 'United Kingdom', 'Vereinigtes Königreich'],
  ['GD', 'Grenada', 'Grenada'],
  ['GE', 'Georgia', 'Georgien'],
  ['GF', 'French Guiana', 'Französisch-Guayana'],
  ['GG', 'Guernsey', 'Guernsey'],
  ['GH', 'Ghana', 'Ghana'],
  ['GI', 'Gibraltar', 'Gibraltar'],
  ['GL', 'Greenland', 'Grönland'],
  ['GM', 'Gambia', 'Gambia'],
  ['GN', 'Guinea', 'Guinea'],
  ['GP', 'Guadeloupe', 'Guadeloupe'],
  ['GQ', 'Equatorial Guinea', 'Äquatorialguinea'],
  ['GR', 'Greece', 'Griechenland'],
  ['GS', 'South Georgia & South Sandwich Islands', 'Südgeorgien und die Südlichen Sandwichinseln'],
  ['GT', 'Guatemala', 'Guatemala'],
  ['GU', 'Guam', 'Guam'],
  ['GW', 'Guinea-Bissau', 'Guinea-Bissau'],
  ['GY', 'Guyana', 'Guyana'],
  ['HK', 'Hong Kong SAR China', 'Sonderverwaltungsregion Hongkong'],
  ['HM', 'Heard & McDonald Islands', 'Heard und McDonaldinseln'],
  ['HN', 'Honduras', 'Honduras'],
  ['HR', 'Croatia', 'Kroatien'],
  ['HT', 'Haiti', 'Haiti'],
  ['HU', 'Hungary', 'Ungarn'],
  ['ID', 'Indonesia', 'Indonesien'],
  ['IE', 'Ireland', 'Irland'],
  ['IL', 'Israel', 'Israel'],
  ['IM', 'Isle of Man', 'Isle of Man'],
  ['IN', 'India', 'Indien'],
  ['IO', 'British Indian Ocean Territory', 'Britisches Territorium im Indischen Ozean'],
  ['IQ', 'Iraq', 'Irak'],
  ['IR', 'Iran', 'Iran'],
  ['IS', 'Iceland', 'Island'],
  ['IT', 'Italy', 'Italien'],
  ['JE', 'Jersey', 'Jersey'],
  ['JM', 'Jamaica', 'Jamaika'],
  ['JO', 'Jordan', 'Jordanien'],
  ['JP', 'Japan', 'Japan'],
  ['KE', 'Kenya', 'Kenia'],
  ['KG', 'Kyrgyzstan', 'Kirgisistan'],
  ['KH', 'Cambodia', 'Kambodscha'],
  ['KI', 'Kiribati', 'Kiribati'],
  ['KM', 'Comoros', 'Komoren'],
  ['KN', 'St. Kitts & Nevis', 'St. Kitts und Nevis'],
  ['KP', 'North Korea', 'Nordkorea'],
  ['KR', 'South Korea', 'Südkorea'],
  ['KW', 'Kuwait', 'Kuwait'],
  ['KY', 'Cayman Islands', 'Kaimaninseln'],
  ['KZ', 'Kazakhstan', 'Kasachstan'],
  ['LA', 'Laos', 'Laos'],
  ['LB', 'Lebanon', 'Libanon'],
  ['LC', 'St. Lucia', 'St. Lucia'],
  ['LI', 'Liechtenstein', 'Liechtenstein'],
  ['LK', 'Sri Lanka', 'Sri Lanka'],
  ['LR', 'Liberia', 'Liberia'],
  ['LS', 'Lesotho', 'Lesotho'],
  ['LT', 'Lithuania', 'Litauen'],
  ['LU', 'Luxembourg', 'Luxemburg'],
  ['LV', 'Latvia', 'Lettland'],
  ['LY', 'Libya', 'Libyen'],
  ['MA', 'Morocco', 'Marokko'],
  ['MC', 'Monaco', 'Monaco'],
  ['MD', 'Moldova', 'Republik Moldau'],
  ['ME', 'Montenegro', 'Montenegro'],
  ['MF', 'St. Martin', 'St. Martin'],
  ['MG', 'Madagascar', 'Madagaskar'],
  ['MH', 'Marshall Islands', 'Marshallinseln'],
  ['MK', 'North Macedonia', 'Nordmazedonien'],
  ['ML', 'Mali', 'Mali'],
  ['MM', 'Myanmar (Burma)', 'Myanmar'],
  ['MN', 'Mongolia', 'Mongolei'],
  ['MO', 'Macao SAR China', 'Sonderverwaltungsregion Macau'],
  ['MP', 'Northern Mariana Islands', 'Nördliche Marianen'],
  ['MQ', 'Martinique', 'Martinique'],
  ['MR', 'Mauritania', 'Mauretanien'],
  ['MS', 'Montserrat', 'Montserrat'],
  ['MT', 'Malta', 'Malta'],
  ['MU', 'Mauritius', 'Mauritius'],
  ['MV', 'Maldives', 'Malediven'],
  ['MW', 'Malawi', 'Malawi'],
  ['MX', 'Mexico', 'Mexiko'],
  ['MY', 'Malaysia', 'Malaysia'],
  ['MZ', 'Mozambique', 'Mosambik'],
  ['NA', 'Namibia', 'Namibia'],
  ['NC', 'New Caledonia', 'Neukaledonien'],
  ['NE', 'Niger', 'Niger'],
  ['NF', 'Norfolk Island', 'Norfolkinsel'],
  ['NG', 'Nigeria', 'Nigeria'],
  ['NI', 'Nicaragua', 'Nicaragua'],
  ['NL', 'Netherlands', 'Niederlande'],
  ['NO', 'Norway', 'Norwegen'],
  ['NP', 'Nepal', 'Nepal'],
  ['NR', 'Nauru', 'Nauru'],
  ['NU', 'Niue', 'Niue'],
  ['NZ', 'New Zealand', 'Neuseeland'],
  ['OM', 'Oman', 'Oman'],
  ['PA', 'Panama', 'Panama'],
  ['PE', 'Peru', 'Peru'],
  ['PF', 'French Polynesia', 'Französisch-Polynesien'],
  ['PG', 'Papua New Guinea', 'Papua-Neuguinea'],
  ['PH', 'Philippines', 'Philippinen'],
  ['PK', 'Pakistan', 'Pakistan'],
  ['PL', 'Poland', 'Polen'],
  ['PM', 'St. Pierre & Miquelon', 'St. Pierre und Miquelon'],
  ['PN', 'Pitcairn Islands', 'Pitcairninseln'],
  ['PR', 'Puerto Rico', 'Puerto Rico'],
  ['PS', 'Palestinian Territories', 'Palästinensische Autonomiegebiete'],
  ['PT', 'Portugal', 'Portugal'],
  ['PW', 'Palau', 'Palau'],
  ['PY', 'Paraguay', 'Paraguay'],
  ['QA', 'Qatar', 'Katar'],
  ['RE', 'Réunion', 'Réunion'],
  ['RO', 'Romania', 'Rumänien'],
  ['RS', 'Serbia', 'Serbien'],
  ['RU', 'Russia', 'Russland'],
  ['RW', 'Rwanda', 'Ruanda'],
  ['SA', 'Saudi Arabia', 'Saudi-Arabien'],
  ['SB', 'Solomon Islands', 'Salomonen'],
  ['SC', 'Seychelles', 'Seychellen'],
  ['SD', 'Sudan', 'Sudan'],
  ['SE', 'Sweden', 'Schweden'],
  ['SG', 'Singapore', 'Singapur'],
  ['SH', 'St. Helena', 'St. Helena'],
  ['SI', 'Slovenia', 'Slowenien'],
  ['SJ', 'Svalbard & Jan Mayen', 'Spitzbergen und Jan Mayen'],
  ['SK', 'Slovakia', 'Slowakei'],
  ['SL', 'Sierra Leone', 'Sierra Leone'],
  ['SM', 'San Marino', 'San Marino'],
  ['SN', 'Senegal', 'Senegal'],
  ['SO', 'Somalia', 'Somalia'],
  ['SR', 'Suriname', 'Suriname'],
  ['SS', 'South Sudan', 'Südsudan'],
  ['ST', 'São Tomé & Príncipe', 'São Tomé und Príncipe'],
  ['SV', 'El Salvador', 'El Salvador'],
  ['SX', 'Sint Maarten', 'Sint Maarten'],
  ['SY', 'Syria', 'Syrien'],
  ['SZ', 'Eswatini', 'Eswatini'],
  ['TC', 'Turks & Caicos Islands', 'Turks- und Caicosinseln'],
  ['TD', 'Chad', 'Tschad'],
  ['TF', 'French Southern Territories', 'Französische Süd- und Antarktisgebiete'],
  ['TG', 'Togo', 'Togo'],
  ['TH', 'Thailand', 'Thailand'],
  ['TJ', 'Tajikistan', 'Tadschikistan'],
  ['TK', 'Tokelau', 'Tokelau'],
  ['TL', 'Timor-Leste', 'Timor-Leste'],
  ['TM', 'Turkmenistan', 'Turkmenistan'],
  ['TN', 'Tunisia', 'Tunesien'],
  ['TO', 'Tonga', 'Tonga'],
  ['TR', 'Türkiye', 'Türkei'],
  ['TT', 'Trinidad & Tobago', 'Trinidad und Tobago'],
  ['TV', 'Tuvalu', 'Tuvalu'],
  ['TW', 'Taiwan', 'Taiwan'],
  ['TZ', 'Tanzania', 'Tansania'],
  ['UA', 'Ukraine', 'Ukraine'],
  ['UG', 'Uganda', 'Uganda'],
  ['UM', 'U.S. Outlying Islands', 'Amerikanische Überseeinseln'],
  ['US', 'United States', 'Vereinigte Staaten'],
  ['UY', 'Uruguay', 'Uruguay'],
  ['UZ', 'Uzbekistan', 'Usbekistan'],
  ['VA', 'Vatican City', 'Vatikanstadt'],
  ['VC', 'St. Vincent & Grenadines', 'St. Vincent und die Grenadinen'],
  ['VE', 'Venezuela', 'Venezuela'],
  ['VG', 'British Virgin Islands', 'Britische Jungferninseln'],
  ['VI', 'U.S. Virgin Islands', 'Amerikanische Jungferninseln'],
  ['VN', 'Vietnam', 'Vietnam'],
  ['VU', 'Vanuatu', 'Vanuatu'],
  ['WF', 'Wallis & Futuna', 'Wallis und Futuna'],
  ['WS', 'Samoa', 'Samoa'],
  ['XK', 'Kosovo', 'Kosovo'],
  ['YE', 'Yemen', 'Jemen'],
  ['YT', 'Mayotte', 'Mayotte'],
  ['ZA', 'South Africa', 'Südafrika'],
  ['ZM', 'Zambia', 'Sambia'],
  ['ZW', 'Zimbabwe', 'Simbabwe'],
]

/** Every country, in English alphabetical order, as the Dashboard offers them. */
export const COUNTRIES: readonly Country[] = ROWS.map(([code, name]) => ({
  code,
  name,
})).sort((a, b) => a.name.localeCompare(b.name, 'en'))

const BY_CODE = new Map(ROWS.map(([code, name]) => [code, name]))

export const COUNTRY_CODES: readonly string[] = ROWS.map(([code]) => code)

export const isCountryCode = (value: string): boolean => BY_CODE.has(value)

/** The readable name for a stored code. An unknown code reads as itself. */
export const countryName = (code: string): string => BY_CODE.get(code) ?? code

export const toCountry = (code: string): Country => ({
  code,
  name: countryName(code),
})

/** Lower-case, without accents or punctuation, so `Türkiye` and `turkiye` meet. */
const fold = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/gu, 'and')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()

/** Names a person commonly writes that neither table spells that way. */
const EXTRA_NAMES: Record<string, string> = {
  usa: 'US',
  'united states of america': 'US',
  america: 'US',
  uk: 'GB',
  'great britain': 'GB',
  england: 'GB',
  brd: 'DE',
  uae: 'AE',
  turkey: 'TR',
  tuerkei: 'TR',
  holland: 'NL',
  'czech republic': 'CZ',
  russia: 'RU',
  'south korea': 'KR',
  korea: 'KR',
}

const BY_NAME = (() => {
  const names = new Map<string, string>()

  for (const [code, english, german] of ROWS) {
    names.set(fold(english), code)
    names.set(fold(german), code)
  }

  for (const [name, code] of Object.entries(EXTRA_NAMES)) names.set(name, code)

  return names
})()

const SEARCH_NAMES = new Map(
  ROWS.map(([code, english, german]) => [code, [fold(english), fold(german)]]),
)

/**
 * How well a country answers a search box, lower is better, or null for no
 * match: its exact code first, then a name that starts with the text, then a
 * name that merely contains it. So `de` offers Germany before Bangladesh.
 */
export const countryRank = (code: string, text: string): number | null => {
  const q = fold(text)

  if (q === '') return 2
  if (code.toLowerCase() === q) return 0

  const names = SEARCH_NAMES.get(code) ?? []

  if (names.some((name) => name.startsWith(q))) return 1
  if (names.some((name) => name.includes(q))) return 2

  return null
}

/**
 * The code a piece of free text means, or null.
 *
 * Accepts a code (`de`, `DE`) or a name in English or German. Never a guess:
 * text that matches nothing is null, and the caller reports the row, because
 * `docs/v2/leads.md` forbids silently inventing a country.
 */
export const findCountryCode = (text: string): string | null => {
  const trimmed = text.trim()

  if (trimmed === '') return null

  const upper = trimmed.toUpperCase()

  if (upper.length === 2 && BY_CODE.has(upper)) return upper

  return BY_NAME.get(fold(trimmed)) ?? null
}

/** A stored country: a known code, and nothing else. */
export const CountryCodeSchema = v.pipe(
  v.string('Choose a country'),
  v.trim(),
  v.toUpperCase(),
  v.nonEmpty('Choose a country'),
  v.check(isCountryCode, 'Choose a country from the list'),
)
