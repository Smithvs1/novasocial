import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import ws from 'ws';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync, unlinkSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ─── Validate required env vars ───────────────────────────────────────────────
const REQUIRED_VARS = ['ANTHROPIC_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY'];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ─── Clients ─────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { realtime: { transport: ws } }
);

const PEXELS_KEY    = process.env.PEXELS_API_KEY;
const UNSPLASH_KEY  = process.env.UNSPLASH_ACCESS_KEY;
const PIXABAY_KEY   = process.env.PIXABAY_API_KEY;
const COVERR_KEY    = process.env.COVERR_API_KEY;

let   IG_TOKEN      = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_USER_ID    = process.env.INSTAGRAM_USER_ID;
const DRY_RUN       = process.env.DRY_RUN === 'true';
const META_APP_ID        = process.env.META_APP_ID;
const META_APP_SECRET    = process.env.META_APP_SECRET;
const JAMENDO_CLIENT_ID  = process.env.JAMENDO_CLIENT_ID;
const MEDIA_BUCKET       = process.env.MEDIA_BUCKET || 'reel-videos';
const BRANDED_TEXT_POST_TYPE = 'TEXT_CAROUSEL';

const BRANDED_TEXT_TOPICS = [
  'Why NOVA Collective is a membership, not a traditional suite model',
  'What founding members get first access to at NOVA Collective',
  'How a private suite helps beauty professionals build a premium client experience',
  'The difference between working behind a chair and building your own beauty brand',
  'Why clients remember privacy, comfort, and consistency',
  'How custom finishes make your suite feel like your brand from day one',
  'What beauty professionals should look for before choosing a suite community',
  'How hairstylists can turn loyal clients into a scalable business',
  'How barbers can create a private, appointment-only grooming experience',
  'How estheticians can make treatment-room privacy feel premium',
  'How nail techs can design a studio that photographs beautifully',
  'How massage therapists can create a quiet wellness experience clients rebook',
  'Why lash and brow techs need a clean, private, focused room',
  'Why tattoo artists need a professional studio that matches their work',
  'How Reiki and wellness pros can create a calm dedicated healing space',
  'The amenities clients notice before they ever sit down',
  'How communal shampoo bowls and dryers support a cleaner suite layout',
  'Why a break room with washer and dryer matters for daily operations',
  'How to announce that you are moving into your own private suite',
  'How to build pre-opening demand before your suite is ready',
  'Why your name, your booking link, and your suite should work together',
  'How beauty pros can stop blending in and start building brand recognition',
  'Why luxury does not have to feel cold or unreachable',
  'How NOVA Collective supports professionals who are ready for ownership energy',
  'What to tell clients when you are upgrading into a private suite',
  'How a curated community raises the standard for every member',
  'Why limited founding memberships create urgency for serious professionals',
  'The client-experience details that turn appointments into referrals',
  'How to make your suite content work harder on Instagram',
  'Why your next level needs a space designed around your business',
];

const BRANDED_TEXT_PROMPT = `You are a luxury Instagram creative director for NOVA Collective, a private salon suite membership for elite beauty and wellness professionals in Louisville, KY.

CRITICAL BRAND RULES:
- NOVA Collective is a PRIVATE MEMBERSHIP, not a lease. Members hold a Master Membership Agreement with a revocable, non-exclusive license to use a designated workspace. They pay membership dues, not rent.
- Always say "membership," "private suite," "workspace," or "license to use space" — NEVER say "lease," "rent," "rental," "tenant," or "landlord."
- Position NOVA Collective as an exclusive, curated, high-end community for serious beauty and wellness professionals.
- Mention www.novacollective.vip in the caption.
- Use polished, premium, sales-forward language without sounding generic.

TASK: Create copy for a TEXT-FIRST Instagram carousel graphic post. This post will be rendered as branded NOVA graphics, not stock imagery. It should feel like the examples: a mix of advertising, salon-suite education, bold business tips, and swipeable word slides.

TOPIC: {TOPIC}

OUTPUT FORMAT (return ONLY valid JSON, no markdown, no extra text):
{
  "title": "Internal title",
  "slides": [
    {"index": 1, "kicker": "short category label", "headline": "cover headline, max 7 words", "body": "one supporting sentence, max 16 words"},
    {"index": 2, "kicker": "short label", "headline": "max 7 words", "body": "max 16 words"},
    {"index": 3, "kicker": "short label", "headline": "max 7 words", "body": "max 16 words"},
    {"index": 4, "kicker": "short label", "headline": "max 7 words", "body": "max 16 words"},
    {"index": 5, "kicker": "short label", "headline": "CTA headline, max 7 words", "body": "include www.novacollective.vip, max 16 words"}
  ],
  "caption": "Instagram caption, 120–180 words, selling NOVA Collective membership and asking them to visit www.novacollective.vip",
  "hashtags": "12–18 relevant hashtags"
}`;

// ─── Week / day helpers ───────────────────────────────────────────────────────

function getTodayDayOfWeek() {
  const jsDay = new Date().getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}

function getISOWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86_400_000) + 1) / 7);
}

// 3-way image source rotation: week%3 → 0=pexels, 1=unsplash, 2=pixabay
function getImageSource() {
  const mod = getISOWeekNumber() % 3;
  if (mod === 0) return 'pexels';
  if (mod === 1) return 'unsplash';
  return 'pixabay';
}

async function getDaySlot() {
  const { data, error } = await supabase
    .from('nc_cycle_tracker')
    .select('cycle_start')
    .eq('id', 1)
    .single();

  if (error) {
    console.error(`  ⚠ Failed to load cycle tracker: ${error.message} — defaulting to slot 1`);
  }
  if (!data?.cycle_start) return 1;

  const start = new Date(data.cycle_start);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const elapsed = Math.floor((today - start) / 86_400_000);
  return (elapsed % 30) + 1;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Token store (Supabase) — auto-refresh Instagram tokens ─────────────────

async function loadTokenFromStore(key) {
  const { data, error } = await supabase
    .from('nc_token_store')
    .select('value, refreshed_at, expires_at')
    .eq('key', key)
    .single();
  if (error || !data) return null;
  return data;
}

async function saveTokenToStore(key, value, expiresInSeconds) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInSeconds * 1000);
  const { error } = await supabase
    .from('nc_token_store')
    .upsert({
      key,
      value,
      refreshed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }, { onConflict: 'key' });
  if (error) console.error(`  ⚠ Failed to save token to store: ${error.message}`);
}

async function refreshInstagramToken(currentToken) {
  if (!META_APP_ID || !META_APP_SECRET) {
    console.log('  ↷ META_APP_ID / META_APP_SECRET not set — skipping IG token refresh');
    return null;
  }

  const url = `https://graph.facebook.com/v25.0/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${META_APP_ID}` +
    `&client_secret=${META_APP_SECRET}` +
    `&fb_exchange_token=${currentToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  ⚠ IG token refresh HTTP error: ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json();

  if (data.error) {
    console.error(`  ⚠ IG token refresh failed: ${data.error.message}`);
    return null;
  }

  if (data.access_token) {
    const expiresIn = data.expires_in || 5184000;
    console.log(`  ✓ Instagram token refreshed (expires in ${Math.round(expiresIn / 86400)} days)`);
    await saveTokenToStore('instagram_access_token', data.access_token, expiresIn);
    return data.access_token;
  }

  return null;
}

async function loadAndRefreshTokens() {
  try {
    const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
    if (envToken) {
      IG_TOKEN = envToken;
      console.log('  ✓ Using IG token from environment variable (System User token — never expires)');
      return;
    }
    const stored = await loadTokenFromStore('instagram_access_token');
    if (stored?.value) {
      IG_TOKEN = stored.value;
      const expiresAt = new Date(stored.expires_at);
      const daysLeft = Math.round((expiresAt - new Date()) / 86_400_000);
      console.log(`  ✓ Loaded IG token from store (expires in ${daysLeft} days)`);

      if (daysLeft < 14) {
        console.log(`  ↻ Token expires soon — refreshing...`);
        const newToken = await refreshInstagramToken(IG_TOKEN);
        if (newToken) IG_TOKEN = newToken;
      }
    } else {
      console.warn('  ⚠ No IG token found in env or store');
    }
  } catch (e) {
    console.error(`  ⚠ Token store error: ${e.message} — using env var`);
  }
}

// ─── Image deduplication — no reuse for 90 days ─────────────────────────────

let recentlyUsedUrls = new Set();

async function loadRecentlyUsedImages() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  const { data, error } = await supabase
    .from('nc_generated_posts')
    .select('image_urls, video_url')
    .gte('scheduled_date', cutoff.toISOString().split('T')[0]);

  if (error) {
    console.warn(`  ⚠ Could not load recent images: ${error.message}`);
    return;
  }

  for (const row of (data || [])) {
    if (Array.isArray(row.image_urls)) {
      for (const url of row.image_urls) recentlyUsedUrls.add(normalizeUrl(url));
    }
    if (row.video_url) recentlyUsedUrls.add(normalizeUrl(row.video_url));
  }
  console.log(`  ✓ Loaded ${recentlyUsedUrls.size} recently used media URLs (90-day window)`);
}

function normalizeUrl(url) {
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

function filterUnused(urls, excludeSet) {
  const exclude = excludeSet || new Set();
  const fresh = urls.filter(u => {
    const norm = normalizeUrl(u);
    return !recentlyUsedUrls.has(norm) && !exclude.has(norm);
  });
  if (fresh.length > 0) return fresh;
  // All used globally — at least exclude within-post duplicates
  const deduped = urls.filter(u => !exclude.has(normalizeUrl(u)));
  return deduped.length > 0 ? deduped : urls;
}

function markUsed(urls) {
  for (const url of urls) recentlyUsedUrls.add(normalizeUrl(url));
}

function getBrandedTextTopic(daySlot) {
  return BRANDED_TEXT_TOPICS[(daySlot - 1) % BRANDED_TEXT_TOPICS.length];
}

function withBrandedTextSlot(schedule) {
  if (schedule.some(slot => slot.post_type === BRANDED_TEXT_POST_TYPE)) return schedule;
  return [...schedule, { post_type: BRANDED_TEXT_POST_TYPE, focus_type: 'A' }];
}

function sortDailySchedule(schedule) {
  const order = ['REEL', 'STATIC', 'CAROUSEL', BRANDED_TEXT_POST_TYPE];
  return [...schedule].sort((a, b) => order.indexOf(a.post_type) - order.indexOf(b.post_type));
}

function isCarouselPostType(postType) {
  return postType === 'CAROUSEL' || postType === BRANDED_TEXT_POST_TYPE;
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text, maxChars) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function svgText(text, { x, y, size, weight = 400, fill, maxChars, lineHeight, anchor = 'middle', family = 'Arial, Helvetica, sans-serif', transform = '' }) {
  return wrapText(text, maxChars).map((line, i) => (
    `<text x="${x}" y="${y + (i * lineHeight)}" text-anchor="${anchor}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" ${transform}>${escapeXml(line)}</text>`
  )).join('\n');
}

function normalizeBrandedSlides(generated, topicText) {
  const fallback = [
    { index: 1, kicker: 'NOVA COLLECTIVE', headline: topicText, body: 'A private suite membership designed for serious beauty professionals.' },
    { index: 2, kicker: 'CLIENT EXPERIENCE', headline: 'Make every detail feel premium', body: 'Privacy, comfort, and consistency help clients remember your brand.' },
    { index: 3, kicker: 'BUSINESS MOVE', headline: 'Your suite should sell for you', body: 'A polished space makes your content, referrals, and rebooking easier.' },
    { index: 4, kicker: 'MEMBERSHIP', headline: 'Built for beauty entrepreneurs', body: 'NOVA Collective gives professionals a curated place to grow.' },
    { index: 5, kicker: 'APPLY TODAY', headline: 'Your next level needs a room', body: 'Explore membership at www.novacollective.vip.' },
  ];

  const slides = Array.isArray(generated.slides) && generated.slides.length >= 5
    ? generated.slides.slice(0, 5)
    : fallback;

  return slides.map((slide, idx) => {
    let headline = slide.headline || fallback[idx].headline;
    let body = slide.body || fallback[idx].body;
    const headlineWords = headline.split(/\s+/);
    if (headlineWords.length > 9) headline = headlineWords.slice(0, 9).join(' ');
    const bodyWords = body.split(/\s+/);
    if (bodyWords.length > 20) body = bodyWords.slice(0, 20).join(' ') + '.';
    return {
      index: idx + 1,
      kicker: slide.kicker || fallback[idx].kicker,
      headline,
      body,
    };
  });
}

function brandedSlideSvg(slide, index, total) {
  const dark = index % 3 === 1;
  const blush = index % 3 === 2;
  const bg = dark ? '#071f3f' : (blush ? '#f4e8df' : '#f8f3ea');
  const primary = dark ? '#f8f3ea' : '#071f3f';
  const accent = dark ? '#d8b66a' : '#b6863b';
  const muted = dark ? '#d9e2ef' : '#5f6673';

  const headlineStartY = 470;
  const headlineLineHeight = 96;
  const headlineLines = wrapText(slide.headline, 15);
  const headlineBottomY = headlineStartY + (headlineLines.length - 1) * headlineLineHeight;

  const bodyMaxChars = 28;
  const bodyFontSize = 38;
  const bodyLineHeight = 50;
  const bodyLines = wrapText(slide.body, bodyMaxChars);

  const bodyBoxPad = 44;
  const bodyBoxHeight = bodyBoxPad + bodyLines.length * bodyLineHeight + bodyBoxPad;
  const bodyBoxWidth = 780;
  const bodyBoxX = (1080 - bodyBoxWidth) / 2;
  const maxBodyBoxBottom = 1160;
  const idealBodyBoxTop = headlineBottomY + 80;
  const bodyBoxTop = Math.min(idealBodyBoxTop, maxBodyBoxBottom - bodyBoxHeight);
  const bodyTextY = bodyBoxTop + bodyBoxPad + bodyFontSize * 0.35;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
    <rect width="1080" height="1350" fill="${bg}"/>
    <circle cx="930" cy="170" r="310" fill="none" stroke="${accent}" stroke-width="5" opacity="0.45"/>
    <circle cx="170" cy="1160" r="260" fill="none" stroke="${accent}" stroke-width="3" opacity="0.28"/>
    <path d="M0 0 H1080 V92 H0 Z" fill="${dark ? '#030d1d' : '#ffffff'}" opacity="0.72"/>
    <text x="70" y="58" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" letter-spacing="5" fill="${accent}">NOVA COLLECTIVE</text>
    <text x="1010" y="58" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="${primary}">${index}/${total}</text>
    <text x="540" y="275" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" letter-spacing="6" fill="${accent}">${escapeXml(String(slide.kicker).toUpperCase())}</text>
    <line x1="245" y1="315" x2="835" y2="315" stroke="${accent}" stroke-width="3"/>
    ${svgText(slide.headline, { x: 540, y: headlineStartY, size: 82, weight: 800, fill: primary, maxChars: 15, lineHeight: headlineLineHeight })}
    <rect x="${bodyBoxX}" y="${bodyBoxTop}" width="${bodyBoxWidth}" height="${bodyBoxHeight}" rx="34" fill="${dark ? '#0b2d5c' : '#ffffff'}" opacity="0.84"/>
    ${svgText(slide.body, { x: 540, y: bodyTextY, size: bodyFontSize, weight: 500, fill: dark ? '#f8f3ea' : muted, maxChars: bodyMaxChars, lineHeight: bodyLineHeight })}
    <text x="540" y="1220" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" letter-spacing="4" fill="${accent}">WWW.NOVACOLLECTIVE.VIP</text>
    <text x="540" y="1272" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" letter-spacing="3" fill="${muted}">@NOVA.COLLECTIVEVIP</text>
  </svg>`;
}

async function uploadGeneratedImage(buffer, prefix) {
  const fileName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: false });
  if (uploadErr) throw new Error(`Supabase image upload: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage
    .from(MEDIA_BUCKET)
    .getPublicUrl(fileName);
  if (!urlData?.publicUrl) throw new Error(`Failed to get public URL for uploaded image: ${fileName}`);
  return urlData.publicUrl;
}

async function createBrandedTextCarousel(generated, topicText) {
  const slides = normalizeBrandedSlides(generated, topicText);
  const urls = [];
  for (let i = 0; i < slides.length; i++) {
    const svg = brandedSlideSvg(slides[i], i + 1, slides.length);
    const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
    urls.push(await uploadGeneratedImage(jpeg, 'branded-text-carousel'));
  }
  return urls;
}

// ─── Pexels ───────────────────────────────────────────────────────────────────

async function getPexelsImages(query, count = 1, excludeSet) {
  if (!PEXELS_KEY) return [];
  try {
    const fetchCount = Math.max(count * 5, 10);
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${fetchCount}&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    if (!res.ok) {
      console.error(`  ⚠ Pexels API error: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();

    if (!data.photos?.length) {
      const fb = await fetch(
        `https://api.pexels.com/v1/search?query=luxury+salon+beauty+professional&per_page=${fetchCount}&orientation=landscape`,
        { headers: { Authorization: PEXELS_KEY } }
      );
      if (!fb.ok) {
        console.error(`  ⚠ Pexels fallback API error: ${fb.status} ${fb.statusText}`);
        return [];
      }
      const fbData = await fb.json();
      const allUrls = (fbData.photos || []).map(p => p.src.large2x || p.src.large);
      return filterUnused(allUrls, excludeSet).slice(0, count);
    }

    const allUrls = data.photos.map(p => p.src.large2x || p.src.large);
    return filterUnused(allUrls, excludeSet).slice(0, count);
  } catch (e) {
    console.error(`  ⚠ Pexels image fetch failed: ${e.message}`);
    return [];
  }
}

// ─── Unsplash ─────────────────────────────────────────────────────────────────

async function getUnsplashImages(query, count = 1, excludeSet) {
  if (!UNSPLASH_KEY) return [];
  try {
    const fetchCount = Math.max(count * 5, 10);
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${fetchCount}&orientation=landscape`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    if (!res.ok) {
      console.error(`  ⚠ Unsplash API error: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();

    if (!data.results?.length) {
      const fb = await fetch(
        `https://api.unsplash.com/search/photos?query=luxury+salon+beauty+professional&per_page=${fetchCount}&orientation=landscape`,
        { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
      );
      if (!fb.ok) {
        console.error(`  ⚠ Unsplash fallback API error: ${fb.status} ${fb.statusText}`);
        return [];
      }
      const fbData = await fb.json();
      const allUrls = (fbData.results || []).map(p => p.urls.regular);
      return filterUnused(allUrls, excludeSet).slice(0, count);
    }

    const allUrls = data.results.map(p => p.urls.regular);
    return filterUnused(allUrls, excludeSet).slice(0, count);
  } catch (e) {
    console.error(`  ⚠ Unsplash image fetch failed: ${e.message}`);
    return [];
  }
}

// ─── Pixabay ──────────────────────────────────────────────────────────────────

async function getPixabayImages(query, count = 1, excludeSet) {
  if (!PIXABAY_KEY) return [];
  try {
    const fetchCount = Math.max(count * 5, 10);
    const res = await fetch(
      `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=${fetchCount}&image_type=photo&orientation=horizontal&min_width=1080`
    );
    if (!res.ok) {
      console.error(`  ⚠ Pixabay API error: ${res.status} ${res.statusText}`);
      return [];
    }
    const data = await res.json();

    if (!data.hits?.length) {
      const fb = await fetch(
        `https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent('luxury salon beauty professional')}&per_page=${fetchCount}&image_type=photo&orientation=horizontal&min_width=1080`
      );
      if (!fb.ok) {
        console.error(`  ⚠ Pixabay fallback API error: ${fb.status} ${fb.statusText}`);
        return [];
      }
      const fbData = await fb.json();
      const allUrls = (fbData.hits || []).map(h => h.largeImageURL || h.webformatURL);
      return filterUnused(allUrls, excludeSet).slice(0, count);
    }

    const allUrls = data.hits.map(h => h.largeImageURL || h.webformatURL);
    return filterUnused(allUrls, excludeSet).slice(0, count);
  } catch (e) {
    console.error(`  ⚠ Pixabay image fetch failed: ${e.message}`);
    return [];
  }
}

// ─── Coverr (video for Reels) ─────────────────────────────────────────────────

async function getCoverrVideo(query) {
  if (!COVERR_KEY) return null;

  const queries = [
    query,
    'beauty salon professional',
    'luxury spa wellness',
    'barber hairstylist salon',
    'modern workspace studio',
  ];

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.coverr.co/videos?query=${encodeURIComponent(q)}&page_size=5`,
        { headers: { Authorization: `Bearer ${COVERR_KEY}` } }
      );
      if (!res.ok) {
        console.warn(`  ⚠ Coverr API error for "${q}": ${res.status} ${res.statusText}`);
        continue;
      }
      const data = await res.json();

      if (data.hits?.length) {
        for (const vid of data.hits) {
          const url = vid.video_files?.[0]?.url || vid.urls?.mp4;
          if (url && !recentlyUsedUrls.has(normalizeUrl(url))) return url;
        }
        // All used — return first available
        const fallback = data.hits[0].video_files?.[0]?.url || data.hits[0].urls?.mp4;
        if (fallback) return fallback;
      }
    } catch (e) {
      console.warn(`  ⚠ Coverr search failed for "${q}": ${e.message}`);
    }
  }

  return null;
}

// ─── Pexels Video (fallback for Reels when Coverr has no results) ─────────────

async function getPexelsVideo(query) {
  if (!PEXELS_KEY) return null;

  const queries = [
    query,
    'beauty salon professional',
    'luxury spa treatment',
    'barber haircut modern',
    'wellness studio interior',
  ];

  for (const q of queries) {
    try {
      const res = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=5&size=medium`,
        { headers: { Authorization: PEXELS_KEY } }
      );
      if (!res.ok) {
        console.warn(`  ⚠ Pexels video API error for "${q}": ${res.status} ${res.statusText}`);
        continue;
      }
      const data = await res.json();
      if (data.videos?.length) {
        for (const vid of data.videos) {
          const url = getBestVideoFile(vid.video_files);
          if (url && !recentlyUsedUrls.has(normalizeUrl(url))) return url;
        }
        const fallbackUrl = getBestVideoFile(data.videos[0].video_files);
        if (fallbackUrl) return fallbackUrl;
      }
    } catch (e) {
      console.warn(`  ⚠ Pexels video search failed for "${q}": ${e.message}`);
    }
  }

  return null;
}

function getBestVideoFile(files) {
  const hd = files.find(f => f.quality === 'hd');
  return (hd || files[0])?.link || null;
}

// ─── Jamendo Music ────────────────────────────────────────────────────────────

async function getBackgroundMusic(query) {
  if (!JAMENDO_CLIENT_ID) return null;

  const searchTerms = [
    query.replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 3).join('+'),
    'chill lounge beauty',
    'upbeat inspirational',
    'smooth jazz relaxing',
    'positive background',
  ];

  for (const term of searchTerms) {
    try {
      const url = `https://api.jamendo.com/v3.0/tracks/?client_id=${JAMENDO_CLIENT_ID}`
        + `&format=json&limit=15&order=popularity_total`
        + `&search=${encodeURIComponent(term)}`
        + `&vocalinstrumental=instrumental&include=musicinfo`
        + `&audioformat=mp32`;
      const res  = await fetch(url);
      if (!res.ok) {
        console.warn(`  ⚠ Jamendo API error for "${term}": ${res.status} ${res.statusText}`);
        continue;
      }
      const data = await res.json();
      if (data.results?.length) {
        const downloadable = data.results.filter(t => t.audiodownload_allowed !== false);
        if (!downloadable.length) continue;

        const track = downloadable[Math.floor(Math.random() * Math.min(downloadable.length, 5))];
        const trackUrl = track.audiodownload || track.audio;
        if (trackUrl) {
          const dlUrl = trackUrl.includes('client_id=')
            ? trackUrl
            : `${trackUrl}${trackUrl.includes('?') ? '&' : '?'}client_id=${JAMENDO_CLIENT_ID}`;
          return {
            url:    dlUrl,
            name:   track.name,
            artist: track.artist_name,
          };
        }
      }
    } catch (e) {
      console.warn(`  ⚠ Jamendo search failed for "${term}": ${e.message}`);
    }
  }

  return null;
}

// ─── FFmpeg: mix video with music ─────────────────────────────────────────────

async function uploadMixedVideo(buffer) {
  const fileName = `reel-${Date.now()}.mp4`;
  const { error: uploadErr } = await supabase.storage
    .from('reel-videos')
    .upload(fileName, buffer, { contentType: 'video/mp4', upsert: false });
  if (uploadErr) throw new Error(`Supabase upload: ${uploadErr.message}`);

  const { data: urlData } = supabase.storage
    .from('reel-videos')
    .getPublicUrl(fileName);
  if (!urlData?.publicUrl) throw new Error(`Failed to get public URL for uploaded file: ${fileName}`);
  return urlData.publicUrl;
}

async function mixVideoWithMusic(videoUrl, musicInfo) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'reel-'));
  const videoPath  = join(tmpDir, 'video.mp4');
  const audioPath  = join(tmpDir, 'music.mp3');
  const outputPath = join(tmpDir, 'output.mp4');

  try {
    const vidRes = await fetch(videoUrl);
    if (!vidRes.ok) throw new Error(`Failed to download video: ${vidRes.status} ${vidRes.statusText}`);
    const vidBuf = Buffer.from(await vidRes.arrayBuffer());
    writeFileSync(videoPath, vidBuf);

    const musRes = await fetch(musicInfo.url);
    if (!musRes.ok) throw new Error(`Failed to download music: ${musRes.status} ${musRes.statusText}`);
    const musBuf = Buffer.from(await musRes.arrayBuffer());
    writeFileSync(audioPath, musBuf);

    const durationStr = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf8' }
    ).trim();
    const duration = parseFloat(durationStr) || 15;

    let mixed = false;
    try {
      execSync(
        `ffmpeg -y -i "${videoPath}" -i "${audioPath}" `
        + `-filter_complex "[1:a]volume=0.20,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[music];`
        + `[0:a]volume=1.0[orig];`
        + `[orig][music]amix=inputs=2:duration=shortest[aout]" `
        + `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${outputPath}"`,
        { timeout: 120_000, stdio: 'pipe' }
      );
      mixed = true;
    } catch (ffmpegErr) {
      console.warn(`  ⚠ FFmpeg mix with original audio failed: ${ffmpegErr.message} — retrying without original audio`);
      execSync(
        `ffmpeg -y -i "${videoPath}" -i "${audioPath}" `
        + `-filter_complex "[1:a]volume=0.25,afade=t=out:st=${Math.max(0, duration - 2)}:d=2[aout]" `
        + `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 128k -shortest "${outputPath}"`,
        { timeout: 120_000, stdio: 'pipe' }
      );
      mixed = true;
    }

    if (!mixed) throw new Error('FFmpeg mixing failed');

    const outputBuf = readFileSync(outputPath);
    return await uploadMixedVideo(outputBuf);
  } finally {
    try { unlinkSync(videoPath); } catch {}
    try { unlinkSync(audioPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
  }
}

async function createVideoFromImage(imageUrl, musicInfo, durationSec = 10) {
  const tmpDir = mkdtempSync(join(tmpdir(), 'img2vid-'));
  const imgPath    = join(tmpDir, 'image.jpg');
  const audioPath  = join(tmpDir, 'music.mp3');
  const outputPath = join(tmpDir, 'output.mp4');

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status} ${imgRes.statusText}`);
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());
    writeFileSync(imgPath, imgBuf);

    const musRes = await fetch(musicInfo.url);
    if (!musRes.ok) throw new Error(`Failed to download music: ${musRes.status} ${musRes.statusText}`);
    const musBuf = Buffer.from(await musRes.arrayBuffer());
    writeFileSync(audioPath, musBuf);

    const fps = 30;
    const totalFrames = durationSec * fps;
    try {
      execSync(
        `ffmpeg -y -loop 1 -i "${imgPath}" -i "${audioPath}" `
        + `-filter_complex "`
        + `[0:v]scale=1920:1920:force_original_aspect_ratio=increase,`
        + `crop=1080:1920,`
        + `zoompan=z='min(zoom+0.0005,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1080x1920:fps=${fps},`
        + `fade=t=in:st=0:d=0.5,fade=t=out:st=${durationSec - 0.5}:d=0.5[v];`
        + `[1:a]volume=0.30,afade=t=in:st=0:d=1,afade=t=out:st=${durationSec - 2}:d=2[a]`
        + `" `
        + `-map "[v]" -map "[a]" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k `
        + `-t ${durationSec} -pix_fmt yuv420p -shortest "${outputPath}"`,
        { timeout: 180_000, stdio: 'pipe' }
      );
    } catch (ffmpegErr) {
      throw new Error(`FFmpeg Ken Burns video creation failed: ${ffmpegErr.message}`);
    }

    const outputBuf = readFileSync(outputPath);
    return await uploadMixedVideo(outputBuf);
  } finally {
    try { unlinkSync(imgPath); } catch {}
    try { unlinkSync(audioPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
  }
}

// ─── Media router — picks source based on week + post type ───────────────────

async function getImages(query, count, imageSource, excludeSet) {
  if (imageSource === 'pexels') return getPexelsImages(query, count, excludeSet);
  if (imageSource === 'unsplash') return getUnsplashImages(query, count, excludeSet);
  return getPixabayImages(query, count, excludeSet);
}

async function getMedia(query, queries, postType, imageSource, generated, topicText) {
  let result;

  if (postType === BRANDED_TEXT_POST_TYPE) {
    const urls = await createBrandedTextCarousel(generated, topicText);
    result = { urls, isVideo: false, source: 'generated-graphic' };
  } else if (postType === 'REEL') {
    // Try Coverr first, then Pexels video, then fall back to static image
    let videoUrl = await getCoverrVideo(query);
    if (!videoUrl) {
      console.warn('  ⚠ No Coverr video — trying Pexels video...');
      videoUrl = await getPexelsVideo(query);
    }
    if (videoUrl) {
      result = { urls: [videoUrl], isVideo: true };
    } else {
      console.warn('  ⚠ No video found — falling back to static image for Reel');
      const imgs = await getImages(query, 1, imageSource);
      result = { urls: imgs, isVideo: false };
    }
  } else if (postType === 'CAROUSEL') {
    const urls = [];
    const carouselExclude = new Set();
    for (const q of queries) {
      const imgs = await getImages(q, 1, imageSource, carouselExclude);
      for (const img of imgs) {
        if (!carouselExclude.has(normalizeUrl(img))) {
          urls.push(img);
          carouselExclude.add(normalizeUrl(img));
        }
      }
      markUsed(imgs);
    }
    if (urls.length < 2) {
      console.warn(`  ⚠ Carousel only got ${urls.length} unique image(s) — skipping to avoid duplicates`);
    }
    result = { urls, isVideo: false };
  } else {
    // STATIC
    result = { urls: await getImages(query, 1, imageSource), isVideo: false };
  }

  markUsed(result.urls);
  return result;
}

// ─── Claude ───────────────────────────────────────────────────────────────────

const CLAUDE_MODELS = [
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20250929',
  'claude-haiku-4-5-20251001',
];

async function generateContent(promptText, topic) {
  const filledPrompt = promptText.replace('{TOPIC}', topic);

  let message;
  let usedModel;
  for (const model of CLAUDE_MODELS) {
    try {
      message = await anthropic.messages.create({
        model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: filledPrompt }],
      });
      usedModel = model;
      break;
    } catch (err) {
      if (err.status === 404) {
        console.warn(`  ⚠ Model ${model} not available, trying next...`);
        continue;
      }
      throw err;
    }
  }

  if (!message) throw new Error(`No Claude model available. Tried: ${CLAUDE_MODELS.join(', ')}`);
  console.log(`  ✓ Generated content using ${usedModel}`);

  if (!message.content?.length || !message.content[0]?.text) {
    throw new Error('Claude returned an empty or unexpected response');
  }
  const raw       = message.content[0].text;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Claude did not return valid JSON.\nRaw: ${raw.slice(0, 300)}`);
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error(`Failed to parse Claude JSON: ${parseErr.message}\nExtracted: ${jsonMatch[0].slice(0, 300)}`);
  }
}

// ─── Instagram ────────────────────────────────────────────────────────────────

async function waitForIgContainer(creationId, maxAttempts = 90) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res  = await fetch(
        `https://graph.facebook.com/v21.0/${creationId}?fields=status_code&access_token=${IG_TOKEN}`
      );
      if (!res.ok) {
        console.warn(`  ⚠ IG container status check HTTP error: ${res.status} (attempt ${i + 1}/${maxAttempts})`);
        await sleep(2000);
        continue;
      }
      const data = await res.json();
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR') throw new Error(`Instagram container error: ${JSON.stringify(data)}`);
    } catch (e) {
      if (e.message.startsWith('Instagram container error')) throw e;
      console.warn(`  ⚠ IG container status check failed: ${e.message} (attempt ${i + 1}/${maxAttempts})`);
    }
    await sleep(2000);
  }
  throw new Error(`Instagram container timed out after ${maxAttempts * 2} seconds`);
}

async function postToInstagramSingle(imageUrl, caption) {
  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ image_url: imageUrl, media_type: 'IMAGE', caption, access_token: IG_TOKEN }),
    }
  );
  const createData = await createRes.json();
  if (createData.error) throw new Error(`IG create container: ${createData.error.message}`);

  await waitForIgContainer(createData.id);

  const pubRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creation_id: createData.id, access_token: IG_TOKEN }),
    }
  );
  const pubData = await pubRes.json();
  if (pubData.error) throw new Error(`IG publish: ${pubData.error.message}`);
  return pubData.id;
}

async function postToInstagramReel(videoUrl, caption) {
  const createRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        video_url:    videoUrl,
        media_type:   'REELS',
        caption,
        share_to_feed: true,
        access_token: IG_TOKEN,
      }),
    }
  );
  const createData = await createRes.json();
  if (createData.error) throw new Error(`IG Reel container: ${createData.error.message}`);

  await waitForIgContainer(createData.id, 30);

  const pubRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creation_id: createData.id, access_token: IG_TOKEN }),
    }
  );
  const pubData = await pubRes.json();
  if (pubData.error) throw new Error(`IG Reel publish: ${pubData.error.message}`);
  return pubData.id;
}

async function postToInstagramCarousel(imageUrls, caption) {
  const childIds = [];
  for (const url of imageUrls) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image_url: url, is_carousel_item: true, access_token: IG_TOKEN }),
      }
    );
    const data = await res.json();
    if (data.error) throw new Error(`IG child container: ${data.error.message}`);
    childIds.push(data.id);
    await sleep(1000);
  }

  const carouselRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        media_type:  'CAROUSEL',
        children:     childIds.join(','),
        caption,
        access_token: IG_TOKEN,
      }),
    }
  );
  const carouselData = await carouselRes.json();
  if (carouselData.error) throw new Error(`IG carousel container: ${carouselData.error.message}`);

  await waitForIgContainer(carouselData.id);

  const pubRes = await fetch(
    `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ creation_id: carouselData.id, access_token: IG_TOKEN }),
    }
  );
  const pubData = await pubRes.json();
  if (pubData.error) throw new Error(`IG carousel publish: ${pubData.error.message}`);
  return pubData.id;
}

// ─── Caption builder ──────────────────────────────────────────────────────────

function buildCaption(generated) {
  return `${generated.caption || ''}\n\n${generated.hashtags || ''}`.trim();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const today       = new Date().toISOString().split('T')[0];
  const dayOfWeek   = getTodayDayOfWeek();
  const daySlot     = await getDaySlot();
  const imageSource = getImageSource();
  const weekNum     = getISOWeekNumber();

  console.log(`\n=== NOVA Collective Daily Content | ${today} | week=${weekNum} (images: ${imageSource}, video: coverr) | day_of_week=${dayOfWeek} | slot=${daySlot} ===`);
  if (DRY_RUN) console.log('DRY RUN — content saved to Supabase but NOT posted to Instagram.\n');

  if (!DRY_RUN) await loadAndRefreshTokens();

  await loadRecentlyUsedImages();

  if (!DRY_RUN) {
    if (!IG_TOKEN || !IG_USER_ID) {
      console.warn('⚠ Instagram credentials missing — posting will be skipped');
    } else {
      try {
        const igRes = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}?fields=id,username&access_token=${IG_TOKEN}`);
        const igBody = await igRes.json();
        if (igBody.error) {
          console.error(`⚠ Instagram token validation failed: ${igBody.error.message}`);
        } else {
          console.log(`✓ Instagram token is valid (account: @${igBody.username || igBody.id})`);
        }
      } catch (e) {
        console.error(`⚠ Instagram token check error: ${e.message}`);
      }
    }
  }

  if (!PEXELS_KEY && !UNSPLASH_KEY && !PIXABAY_KEY) console.warn('⚠ No image API keys — stock media fetching will fail');
  if (!COVERR_KEY) console.warn('⚠ Coverr API key missing — Reels will fall back to Pexels video or static image post');

  const { data: schedule, error: schedErr } = await supabase
    .from('nc_day_schedule')
    .select('*')
    .eq('day_of_week', dayOfWeek);

  if (schedErr || !schedule?.length) {
    throw new Error(`Could not load schedule for day_of_week=${dayOfWeek}: ${schedErr?.message}`);
  }

  const dailySchedule = sortDailySchedule(withBrandedTextSlot(schedule));
  console.log(`✓ Daily schedule loaded: ${dailySchedule.map(slot => slot.post_type).join(', ')}`);

  for (const slot of dailySchedule) {
    console.log(`\n→ ${slot.post_type} (focus: ${slot.focus_type})`);

    try {
      // 1. Topic + prompt
      let topic;
      let prompt;
      if (slot.post_type === BRANDED_TEXT_POST_TYPE) {
        topic = {
          id: null,
          topic: getBrandedTextTopic(daySlot),
        };
        prompt = {
          id: null,
          prompt_text: BRANDED_TEXT_PROMPT,
        };
      } else {
        const { data: dbTopic, error: topicErr } = await supabase
          .from('nc_topics')
          .select('*')
          .eq('post_type', slot.post_type)
          .eq('day_slot', daySlot)
          .single();

        if (topicErr || !dbTopic) {
          console.error(`  ✗ No topic found for ${slot.post_type} slot ${daySlot}`);
          continue;
        }
        topic = dbTopic;

        const promptFocus = slot.focus_type === 'A'
          ? (Math.random() < 0.5 ? 'N' : 'C')
          : slot.focus_type;

        const { data: dbPrompt, error: promptErr } = await supabase
          .from('nc_prompts')
          .select('*')
          .eq('post_type', slot.post_type)
          .eq('focus_type', promptFocus)
          .eq('active', true)
          .single();

        if (promptErr || !dbPrompt) {
          console.error(`  ✗ No prompt for ${slot.post_type}/${promptFocus}`);
          continue;
        }
        prompt = dbPrompt;
      }
      console.log(`  Topic: "${topic.topic}"`);

      // 2. Generate content via Claude
      const generated = await generateContent(prompt.prompt_text, topic.topic);
      console.log(`  ✓ Claude generated: "${generated.title || topic.topic}"`);

      // 3. Fetch media
      const primaryQuery = generated.image_query || 'luxury salon beauty professional';
      let carouselQueries = [];
      if (slot.post_type === 'CAROUSEL') {
        if (Array.isArray(generated.image_queries) && generated.image_queries.length >= 2) {
          carouselQueries = generated.image_queries;
        } else {
          // Generate varied queries to avoid duplicate images
          const variations = [
            primaryQuery,
            `${primaryQuery} interior`,
            `${primaryQuery} workspace`,
            `beauty professional luxury studio`,
            `salon suite modern design`,
            `independent beauty business`,
          ];
          carouselQueries = variations.slice(0, 6);
          console.log('  ℹ Claude did not return image_queries — using varied fallback queries');
        }
      }

      const { urls: mediaUrls, isVideo, source } = await getMedia(
        primaryQuery,
        carouselQueries,
        slot.post_type,
        imageSource,
        generated,
        topic.topic
      );
      const mediaSource = source || (isVideo ? 'coverr/pexels' : imageSource);
      console.log(`  ✓ Media — ${mediaUrls.length} ${isVideo ? 'video' : 'image'}(s) from ${mediaSource}`);

      // 5. Save to Supabase
      const { data: savedPost, error: saveErr } = await supabase
        .from('nc_generated_posts')
        .insert({
          scheduled_date: today,
          post_type:      slot.post_type,
          focus_type:     slot.focus_type,
          topic_id:       topic.id || null,
          prompt_id:      prompt.id || null,
          topic_text:     topic.topic,
          generated_json: generated,
          image_urls:     isVideo ? null : mediaUrls,
          video_url:      isVideo ? mediaUrls[0] : null,
          media_source:   mediaSource,
          safety_status:  'SAFE',
          publish_status: 'DRAFT',
        })
        .select()
        .single();

      if (saveErr) throw new Error(`Supabase insert failed: ${saveErr.message}`);
      console.log(`  ✓ Saved to Supabase (id: ${savedPost.id})`);

      if (DRY_RUN) {
        console.log('  ↷ Dry run — skipping Instagram posting');
        continue;
      }

      const caption = buildCaption(generated);

      // 6. Post to Instagram
      let igPostId = null;
      try {
        if (isVideo) {
          let reelUrl = mediaUrls[0];
          try {
            const music = await getBackgroundMusic(topic.topic);
            if (music) {
              console.log(`  ♪ Found music: "${music.name}" by ${music.artist}`);
              const mixedUrl = await mixVideoWithMusic(reelUrl, music);
              console.log(`  ✓ Mixed video + music — uploaded to Supabase Storage`);
              reelUrl = mixedUrl;

              // Save music info
              const { error: musicSaveErr } = await supabase
                .from('nc_generated_posts')
                .update({ music_info: music })
                .eq('id', savedPost.id);
              if (musicSaveErr) console.warn(`  ⚠ Failed to save music info: ${musicSaveErr.message}`);
            } else {
              console.log('  ↷ No music found — posting video without background music');
            }
          } catch (mixErr) {
            console.warn(`  ⚠ Music mixing failed: ${mixErr.message} — posting video without music`);
          }
          igPostId = await postToInstagramReel(reelUrl, caption.slice(0, 2200));
        } else if (slot.post_type === 'REEL' && !isVideo) {
          console.log('  ↷ Reel slot has a still image — publishing as a regular image post to avoid distorted image-to-reel crops');
          igPostId = await postToInstagramSingle(mediaUrls[0], caption.slice(0, 2200));
        } else if (isCarouselPostType(slot.post_type) && mediaUrls.length > 1) {
          igPostId = await postToInstagramCarousel(mediaUrls, caption.slice(0, 2200));
        } else {
          igPostId = await postToInstagramSingle(mediaUrls[0], caption.slice(0, 2200));
        }
        console.log(`  ✓ Instagram posted (id: ${igPostId})`);
      } catch (err) {
        console.error(`  ✗ Instagram failed: ${err.message}`);
      }

      // 7. Update Supabase with post ID
      const { error: statusUpdateErr } = await supabase
        .from('nc_generated_posts')
        .update({
          instagram_post_id: igPostId,
          publish_status:    igPostId ? 'PUBLISHED' : 'FAILED',
        })
        .eq('id', savedPost.id);
      if (statusUpdateErr) console.error(`  ⚠ Failed to update publish status: ${statusUpdateErr.message}`);

    } catch (err) {
      console.error(`  ✗ Fatal error for ${slot.post_type}: ${err.message}`);
      console.error(err.stack);
    }
  }

  console.log(`\n=== Done ===\n`);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
