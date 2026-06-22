import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
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

async function getMedia(query, queries, postType, imageSource) {
  let result;

  if (postType === 'REEL') {
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

  if (!PEXELS_KEY && !UNSPLASH_KEY && !PIXABAY_KEY) console.warn('⚠ No image API keys — media fetching will fail');
  if (!COVERR_KEY) console.warn('⚠ Coverr API key missing — Reels will fall back to Pexels video or static image');

  const { data: schedule, error: schedErr } = await supabase
    .from('nc_day_schedule')
    .select('*')
    .eq('day_of_week', dayOfWeek);

  if (schedErr || !schedule?.length) {
    throw new Error(`Could not load schedule for day_of_week=${dayOfWeek}: ${schedErr?.message}`);
  }

  for (const slot of schedule) {
    console.log(`\n→ ${slot.post_type} (focus: ${slot.focus_type})`);

    try {
      // 1. Topic
      const { data: topic, error: topicErr } = await supabase
        .from('nc_topics')
        .select('*')
        .eq('post_type', slot.post_type)
        .eq('day_slot', daySlot)
        .single();

      if (topicErr || !topic) {
        console.error(`  ✗ No topic found for ${slot.post_type} slot ${daySlot}`);
        continue;
      }
      console.log(`  Topic: "${topic.topic}"`);

      // 2. Prompt (A days randomly choose N or C)
      const promptFocus = slot.focus_type === 'A'
        ? (Math.random() < 0.5 ? 'N' : 'C')
        : slot.focus_type;

      const { data: prompt, error: promptErr } = await supabase
        .from('nc_prompts')
        .select('*')
        .eq('post_type', slot.post_type)
        .eq('focus_type', promptFocus)
        .eq('active', true)
        .single();

      if (promptErr || !prompt) {
        console.error(`  ✗ No prompt for ${slot.post_type}/${promptFocus}`);
        continue;
      }

      // 3. Generate content via Claude
      const generated = await generateContent(prompt.prompt_text, topic.topic);
      console.log(`  ✓ Claude generated: "${generated.title || topic.topic}"`);

      // 4. Fetch media
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

      const { urls: mediaUrls, isVideo } = await getMedia(
        primaryQuery,
        carouselQueries,
        slot.post_type,
        imageSource
      );
      console.log(`  ✓ Media — ${mediaUrls.length} ${isVideo ? 'video' : 'image'}(s) from ${isVideo ? 'coverr/pexels' : imageSource}`);

      // 5. Save to Supabase
      const { data: savedPost, error: saveErr } = await supabase
        .from('nc_generated_posts')
        .insert({
          scheduled_date: today,
          post_type:      slot.post_type,
          focus_type:     slot.focus_type,
          topic_id:       topic.id,
          prompt_id:      prompt.id,
          topic_text:     topic.topic,
          generated_json: generated,
          image_urls:     isVideo ? null : mediaUrls,
          video_url:      isVideo ? mediaUrls[0] : null,
          media_source:   isVideo ? 'coverr' : imageSource,
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
          // Static image Reel — create video from image with Ken Burns + music
          let reelUrl = null;
          try {
            const music = await getBackgroundMusic(topic.topic);
            if (music) {
              console.log(`  ♪ Found music: "${music.name}" by ${music.artist}`);
              reelUrl = await createVideoFromImage(mediaUrls[0], music, 10);
              console.log(`  ✓ Created Ken Burns video from image — uploaded to Supabase Storage`);

              const { error: imgVidSaveErr } = await supabase
                .from('nc_generated_posts')
                .update({ music_info: music, video_url: reelUrl })
                .eq('id', savedPost.id);
              if (imgVidSaveErr) console.warn(`  ⚠ Failed to save video info: ${imgVidSaveErr.message}`);
            }
          } catch (imgVidErr) {
            console.warn(`  ⚠ Image-to-video failed: ${imgVidErr.message}`);
          }

          if (reelUrl) {
            igPostId = await postToInstagramReel(reelUrl, caption.slice(0, 2200));
          } else {
            console.log('  ↷ Falling back to static image post for this Reel slot');
            igPostId = await postToInstagramSingle(mediaUrls[0], caption.slice(0, 2200));
          }
        } else if (slot.post_type === 'CAROUSEL' && mediaUrls.length > 1) {
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
