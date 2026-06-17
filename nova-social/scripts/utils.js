// ─── Date / time helpers ──────────────────────────────────────────────────────

export function getTodayDayOfWeek(date = new Date()) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function getISOWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86_400_000) + 1) / 7);
}

export function getImageSource(date = new Date()) {
  const mod = getISOWeekNumber(date) % 3;
  if (mod === 0) return 'pexels';
  if (mod === 1) return 'unsplash';
  return 'pixabay';
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── URL normalization & deduplication ────────────────────────────────────────

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('unsplash.com')) return u.origin + u.pathname;
    if (u.hostname.includes('pexels.com')) return u.origin + u.pathname;
    if (u.hostname.includes('pixabay.com')) return u.origin + u.pathname;
    if (u.hostname.includes('coverr.co')) return u.origin + u.pathname;
    return url;
  } catch {
    return url;
  }
}

export function filterUnused(urls, recentlyUsedUrls) {
  const fresh = urls.filter(u => !recentlyUsedUrls.has(normalizeUrl(u)));
  return fresh.length > 0 ? fresh : urls;
}

export function markUsed(urls, recentlyUsedUrls) {
  for (const url of urls) recentlyUsedUrls.add(normalizeUrl(url));
}

// ─── Video helpers ────────────────────────────────────────────────────────────

export function getBestVideoFile(files) {
  const hd = files.find(f => f.quality === 'hd');
  return (hd || files[0])?.link || null;
}

// ─── Caption builder ──────────────────────────────────────────────────────────

export function buildCaption(generated) {
  return `${generated.caption || ''}\n\n${generated.hashtags || ''}`.trim();
}

// ─── Day slot calculation ─────────────────────────────────────────────────────

export function calculateDaySlot(cycleStart, today = new Date()) {
  if (!cycleStart) return 1;

  const start = new Date(cycleStart);
  const t = new Date(today);
  start.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);

  const elapsed = Math.floor((t - start) / 86_400_000);
  return (elapsed % 30) + 1;
}

// ─── Content parsing ──────────────────────────────────────────────────────────

export function parseGeneratedContent(rawText) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ─── Prompt filling ───────────────────────────────────────────────────────────

export function fillPrompt(promptText, topic) {
  return promptText.replace('{TOPIC}', topic);
}

// ─── Focus type resolution ────────────────────────────────────────────────────

export function resolveFocusType(focusType, randomValue = Math.random()) {
  if (focusType === 'A') return randomValue < 0.5 ? 'N' : 'C';
  return focusType;
}

// ─── Token expiry helpers ─────────────────────────────────────────────────────

export function calculateExpiresAt(now, expiresInSeconds) {
  return new Date(now.getTime() + expiresInSeconds * 1000);
}

export function getDaysUntilExpiry(expiresAt, now = new Date()) {
  return Math.round((new Date(expiresAt) - now) / 86_400_000);
}

export function shouldRefreshToken(daysLeft, threshold = 14) {
  return daysLeft < threshold;
}

// ─── Media routing ────────────────────────────────────────────────────────────

export function getMediaSourceForPostType(postType, imageSource) {
  if (postType === 'REEL') return 'coverr';
  return imageSource;
}

// ─── Jamendo URL builder ──────────────────────────────────────────────────────

export function buildJamendoDownloadUrl(trackUrl, clientId) {
  if (!trackUrl) return null;
  if (trackUrl.includes('client_id=')) return trackUrl;
  return `${trackUrl}${trackUrl.includes('?') ? '&' : '?'}client_id=${clientId}`;
}

// ─── Search term sanitization ─────────────────────────────────────────────────

export function sanitizeSearchTerms(query, maxWords = 3) {
  return query.replace(/[^\w\s]/g, '').split(/\s+/).slice(0, maxWords).join('+');
}
