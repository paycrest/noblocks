import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js";

export interface Country {
  code: string;
  flag: string; // URL to flag image
  name: string;
  country: string;
}

// Cache for countries data
let countriesCache: Country[] | null = null;

/**
 * Builds the full country list locally from libphonenumber-js metadata (the same
 * library that validates the entered number, so the two can never disagree) plus
 * Intl.DisplayNames for localized country names. No network call — the previous
 * REST Countries endpoint now 301-redirects cross-origin with no CORS header, so
 * the browser fetch always failed and silently fell back to a 15-country list.
 */
function buildCountryList(): Country[] {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });

  return getCountries()
    .map((cc: CountryCode): Country | null => {
      let callingCode: string;
      try {
        callingCode = getCountryCallingCode(cc);
      } catch {
        // Region without a dial code in metadata — skip it.
        return null;
      }
      return {
        code: `+${callingCode}`,
        flag: `https://flagcdn.com/w40/${cc.toLowerCase()}.png`,
        name: displayNames.of(cc) ?? cc,
        country: cc,
      };
    })
    .filter((c): c is Country => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Returns the full list of dialable countries (calling codes, flags, names).
 * Async to preserve the call site's contract; resolves from a local build with
 * no network dependency. Falls back to a small static list only if metadata is
 * somehow unavailable.
 */
export async function fetchCountries(): Promise<Country[]> {
  if (countriesCache) {
    return countriesCache;
  }

  try {
    const countries = buildCountryList();
    if (countries.length === 0) {
      throw new Error("Country metadata produced an empty list");
    }
    countriesCache = countries;
    return countries;
  } catch (error) {
    console.error("Error building country list:", error);
    return getDefaultCountries();
  }
}

/**
 * Fallback country list in case the API is unavailable
 */
function getDefaultCountries(): Country[] {
  return [
    { code: '+234', flag: 'https://flagcdn.com/w40/ng.png', name: 'Nigeria', country: 'NG' },
    { code: '+254', flag: 'https://flagcdn.com/w40/ke.png', name: 'Kenya', country: 'KE' },
    { code: '+233', flag: 'https://flagcdn.com/w40/gh.png', name: 'Ghana', country: 'GH' },
    { code: '+27', flag: 'https://flagcdn.com/w40/za.png', name: 'South Africa', country: 'ZA' },
    { code: '+1', flag: 'https://flagcdn.com/w40/us.png', name: 'United States', country: 'US' },
    { code: '+1', flag: 'https://flagcdn.com/w40/ca.png', name: 'Canada', country: 'CA' },
    { code: '+44', flag: 'https://flagcdn.com/w40/gb.png', name: 'United Kingdom', country: 'GB' },
    { code: '+33', flag: 'https://flagcdn.com/w40/fr.png', name: 'France', country: 'FR' },
    { code: '+49', flag: 'https://flagcdn.com/w40/de.png', name: 'Germany', country: 'DE' },
    { code: '+81', flag: 'https://flagcdn.com/w40/jp.png', name: 'Japan', country: 'JP' },
    { code: '+86', flag: 'https://flagcdn.com/w40/cn.png', name: 'China', country: 'CN' },
    { code: '+91', flag: 'https://flagcdn.com/w40/in.png', name: 'India', country: 'IN' },
    { code: '+61', flag: 'https://flagcdn.com/w40/au.png', name: 'Australia', country: 'AU' },
    { code: '+55', flag: 'https://flagcdn.com/w40/br.png', name: 'Brazil', country: 'BR' },
    { code: '+52', flag: 'https://flagcdn.com/w40/mx.png', name: 'Mexico', country: 'MX' },
    { code: '+7', flag: 'https://flagcdn.com/w40/ru.png', name: 'Russia', country: 'RU' }
  ];
}

/**
 * Get popular countries that should appear at the top of the list
 */
export function getPopularCountries(): string[] {
  return ['NG', 'KE', 'GH', 'ZA', 'US', 'GB', 'CA', 'AU'];
}

/**
 * Search countries by name or calling code
 */
export function searchCountries(countries: Country[], query: string): Country[] {
  if (!query.trim()) return countries;
  
  const searchTerm = query.toLowerCase();
  return countries.filter(country => 
    country.name.toLowerCase().includes(searchTerm) ||
    country.code.includes(searchTerm) ||
    country.country.toLowerCase().includes(searchTerm)
  );
}