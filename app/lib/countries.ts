export interface Country {
  code: string;
  flag: string; // URL to flag image
  name: string;
  country: string;
}

// Cache for countries data
let countriesCache: Country[] | null = null;

/**
 * Fetches country data from REST Countries API
 * Returns countries with calling codes, flags, and names
 */
export async function fetchCountries(): Promise<Country[]> {
  // Return cached data if available
  if (countriesCache) {
    return countriesCache;
  }

  try {
    const response = await fetch(
      'https://restcountries.com/v3.1/all?fields=name,cca2,idd,flag'
    );
    
    if (!response.ok) {
      throw new Error('Failed to fetch countries');
    }

    const data = await response.json();
    
    // Transform the API response to our format
    const countries: Country[] = data
      .filter((country: any) => {
        // Only include countries with valid calling codes
        return country.idd?.root && country.idd?.suffixes?.length > 0;
      })
      .map((country: any) => {
        // Get the first calling code (some countries have multiple)
        const callingCode = country.idd.root + (country.idd.suffixes[0] || '');
        
        return {
          code: callingCode,
          flag: `https://flagcdn.com/w40/${country.cca2.toLowerCase()}.png`,
          name: country.name.common,
          country: country.cca2
        };
      })
      .sort((a: Country, b: Country) => a.name.localeCompare(b.name)); // Sort alphabetically

    // Cache the results
    countriesCache = countries;
    return countries;
  } catch (error) {
    console.error('Error fetching countries:', error);
    
    // Fallback to a basic list if API fails
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