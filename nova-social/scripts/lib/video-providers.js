/**
 * Unified video search -- replaces getCoverrVideo and getPexelsVideo
 * with a single function driven by provider config objects.
 *
 * Includes HTTP status validation from the error-handling improvements.
 */

const VIDEO_PROVIDERS = {
  coverr: {
    buildUrl: (query) =>
      `https://api.coverr.co/videos?query=${encodeURIComponent(query)}&page_size=5`,
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
    extractVideos: (data) =>
      (data.hits || []).map(vid => vid.video_files?.[0]?.url || vid.urls?.mp4).filter(Boolean),
    fallbackQueries: [
      'beauty salon professional',
      'luxury spa wellness',
      'barber hairstylist salon',
      'modern workspace studio',
    ],
  },
  pexels: {
    buildUrl: (query) =>
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&size=medium`,
    headers: (key) => ({ Authorization: key }),
    extractVideos: (data) => {
      if (!data.videos?.length) return [];
      return data.videos.map(vid => {
        const hd = vid.video_files.find(f => f.quality === 'hd');
        return (hd || vid.video_files[0])?.link || null;
      }).filter(Boolean);
    },
    fallbackQueries: [
      'beauty salon professional',
      'luxury spa treatment',
      'barber haircut modern',
      'wellness studio interior',
    ],
  },
};

/**
 * Search for a video across fallback queries, preferring unused URLs.
 * Validates HTTP responses before parsing.
 *
 * @param {string} query - Primary search query
 * @param {string} providerName - 'coverr' | 'pexels'
 * @param {string} apiKey - API key for the provider
 * @param {function} isUsed - (url) => boolean, checks dedup set
 */
export async function searchVideo(query, providerName, apiKey, isUsed) {
  if (!apiKey) return null;

  const provider = VIDEO_PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown video provider: ${providerName}`);

  const queries = [query, ...provider.fallbackQueries];

  for (const q of queries) {
    try {
      const res = await fetch(
        provider.buildUrl(q),
        { headers: provider.headers(apiKey) }
      );
      if (!res.ok) {
        console.warn(`  \u26A0 ${providerName} API error for "${q}": ${res.status} ${res.statusText}`);
        continue;
      }
      const data = await res.json();
      const urls = provider.extractVideos(data);

      // Prefer an unused URL
      const fresh = urls.find(u => !isUsed(u));
      if (fresh) return fresh;

      // All used -- return first available
      if (urls.length) return urls[0];
    } catch (e) {
      console.warn(`  \u26A0 ${providerName} video search failed for "${q}": ${e.message}`);
    }
  }

  return null;
}
