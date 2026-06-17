/**
 * Unified image provider -- replaces three near-identical functions
 * (getPexelsImages, getUnsplashImages, getPixabayImages) with one
 * parameterized implementation driven by provider configs.
 *
 * Includes HTTP status validation and try/catch error handling
 * from the error-handling improvements.
 */

const FALLBACK_QUERY = 'luxury salon beauty professional';

const PROVIDERS = {
  pexels: {
    buildUrl: (query, count) =>
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
    headers: (key) => ({ Authorization: key }),
    extractUrls: (data) => (data.photos || []).map(p => p.src.large2x || p.src.large),
    hasResults: (data) => !!data.photos?.length,
  },
  unsplash: {
    buildUrl: (query, count) =>
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
    headers: (key) => ({ Authorization: `Client-ID ${key}` }),
    extractUrls: (data) => (data.results || []).map(p => p.urls.regular),
    hasResults: (data) => !!data.results?.length,
  },
  pixabay: {
    buildUrl: (query, count, key) =>
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=${count}&image_type=photo&orientation=horizontal&min_width=1080`,
    headers: () => ({}),
    extractUrls: (data) => (data.hits || []).map(h => h.largeImageURL || h.webformatURL),
    hasResults: (data) => !!data.hits?.length,
  },
};

/**
 * Fetch images from a named provider, with automatic fallback query,
 * HTTP status validation, and deduplication filtering.
 *
 * @param {string} query - Search query
 * @param {number} count - Number of images needed
 * @param {string} providerName - 'pexels' | 'unsplash' | 'pixabay'
 * @param {string} apiKey - API key for the provider
 * @param {function} filterUnused - dedup filter function
 */
export async function fetchImages(query, count, providerName, apiKey, filterUnused) {
  if (!apiKey) return [];

  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown image provider: ${providerName}`);

  const fetchCount = Math.max(count * 5, 10);

  try {
    const res = await fetch(
      provider.buildUrl(query, fetchCount, apiKey),
      { headers: provider.headers(apiKey) }
    );
    if (!res.ok) {
      console.error(`  \u26A0 ${providerName} API error: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();

    if (provider.hasResults(data)) {
      return filterUnused(provider.extractUrls(data)).slice(0, count);
    }

    // Fallback query
    const fb = await fetch(
      provider.buildUrl(FALLBACK_QUERY, fetchCount, apiKey),
      { headers: provider.headers(apiKey) }
    );
    if (!fb.ok) {
      console.error(`  \u26A0 ${providerName} fallback API error: ${fb.status} ${fb.statusText}`);
      return [];
    }
    const fbData = await fb.json();
    return filterUnused(provider.extractUrls(fbData)).slice(0, count);
  } catch (e) {
    console.error(`  \u26A0 ${providerName} image fetch failed: ${e.message}`);
    return [];
  }
}
