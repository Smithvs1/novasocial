import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

import { fetchImages } from './lib/image-providers.js';
import { searchVideo } from './lib/video-providers.js';
import { postSingle, postReel, postCarousel } from './lib/instagram.js';
import { mixVideoWithMusic, createVideoFromImage } from './lib/media-processing.js';

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

const IMAGE_KEYS = { pexels: PEXELS_KEY, unsplash: UNSPLASH_KEY, pixabay: PIXABAY_KEY };

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
    console.error(`  \u26A0 Failed to load cycle tracker: ${error.message} \u2014 defaulting to slot 1`);
  }
  if (!data?.cycle_start) return 1;

  const start = new Date(data.cycle_start);
  const today = new Date();
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const elapsed = Math.floor((today - start) / 86_400_000);
  return (elapsed % 30) + 1;
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
  if (error) console.error(`  \u26A0 Failed to save token to store: ${error.message}`);
}

async function refreshInstagramToken(currentToken) {
  if (!META_APP_ID || !META_APP_SECRET) {
    console.log('  \u21B7 META_APP_ID / META_APP_SECRET not set \u2014 skipping IG token refresh');
    return null;
  }

  const url = `https://graph.facebook.com/v25.0/oauth/access_token` +
    `?grant_type=fb_exchange_token` +
    `&client_id=${META_APP_ID}` +
    `&client_secret=${META_APP_SECRET}` +
    `&fb_exchange_token=${currentToken}`;

  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  \u26A0 IG token refresh HTTP error: ${res.status} ${res.statusText}`);
    return null;
  }
  const data = await res.json();

  if (data.error) {
    console.error(`  \u26A0 IG token refresh failed: ${data.error.message}`);
    return null;
  }

  if (data.access_token) {
    const expiresIn = data.expires_in || 5184000;
    console.log(`  \u2713 Instagram token refreshed (expires in ${Math.round(expiresIn / 86400)} days)`);
    await saveTokenToStore('instagram_access_token', data.access_token, expiresIn);
    return data.access_token;
  }

  return null;
}

async function loadAndRefreshTokens() {
  try {
    const stored = await loadTokenFromStore('instagram_access_token');
    if (stored?.value) {
      IG_TOKEN = stored.value;
      const expiresAt = new Date(stored.expires_at);
      const daysLeft = Math.round((expiresAt - new Date()) / 86_400_000);
      console.log(`  \u2713 Loaded IG token from store (expires in ${daysLeft} days)`);

      if (daysLeft < 14) {
        console.log(`  \u21BB Token expires soon \u2014 refreshing...`);
        const newToken = await refreshInstagramToken(IG_TOKEN);
        if (newToken) IG_TOKEN = newToken;
      }
    } else if (IG_TOKEN) {
      console.log('  \u21BB No stored IG token \u2014 seeding from env var and refreshing...');
      const newToken = await refreshInstagramToken(IG_TOKEN);
      if (newToken) IG_TOKEN = newToken;
      else await saveTokenToStore('instagram_access_token', IG_TOKEN, 5184000);
    }
  } catch (e) {
    console.error(`  \u26A0 Token store error: ${e.message} \u2014 using env var`);
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
    console.warn(`  \u26A0 Could not load recent images: ${error.message}`);
    return;
  }

  for (const row of (data || [])) {
    if (Array.isArray(row.image_urls)) {
      for (const url of row.image_urls) recentlyUsedUrls.add(normalizeUrl(url));
    }
    if (row.video_url) recentlyUsedUrls.add(normalizeUrl(row.video_url));
  }
  console.log(`  \u2713 Loaded ${recentlyUsedUrls.size} recently used media URLs (90-day window)`);
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

function filterUnused(urls) {
  const fresh = urls.filter(u => !recentlyUsedUrls.has(normalizeUrl(u)));
  return fresh.length > 0 ? fresh : urls;
}

function isUsed(url) {
  return recentlyUsedUrls.has(normalizeUrl(url));
}

function markUsed(urls) {
  for (const url of urls) recentlyUsedUrls.add(normalizeUrl(url));
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
        console.warn(`  \u26A0 Jamendo API error for "${term}": ${res.status} ${res.statusText}`);
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
      console.warn(`  \u26A0 Jamendo search failed for "${term}": ${e.message}`);
    }
  }

  return null;
}

// ─── Supabase Storage upload ─────────────────────────────────────────────────

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

// ─── Media router — uses shared providers ────────────────────────────────────

async function getImages(query, count, imageSource) {
  return fetchImages(query, count, imageSource, IMAGE_KEYS[imageSource], filterUnused);
}

async function getMedia(query, queries, postType, imageSource) {
  let result;

  if (postType === 'REEL') {
    let videoUrl = await searchVideo(query, 'coverr', COVERR_KEY, isUsed);
    if (!videoUrl) {
      console.warn('  \u26A0 No Coverr video \u2014 trying Pexels video...');
      videoUrl = await searchVideo(query, 'pexels', PEXELS_KEY, isUsed);
    }
    if (videoUrl) {
      result = { urls: [videoUrl], isVideo: true };
    } else {
      console.warn('  \u26A0 No video found \u2014 falling back to static image for Reel');
      const imgs = await getImages(query, 1, imageSource);
      result = { urls: imgs, isVideo: false };
    }
  } else if (postType === 'CAROUSEL') {
    const urls = [];
    for (const q of queries) {
      const imgs = await getImages(q, 1, imageSource);
      urls.push(...imgs);
      markUsed(imgs);
    }
    result = { urls, isVideo: false };
  } else {
    result = { urls: await getImages(query, 1, imageSource), isVideo: false };
  }

  markUsed(result.urls);
  return result;
}

// ─── Reel music pipeline — shared by both video and image-to-video reels ────

async function prepareReelWithMusic(mediaUrl, topicText, savedPostId, isImage) {
  const music = await getBackgroundMusic(topicText);
  if (!music) {
    console.log('  \u21B7 No music found \u2014 posting video without background music');
    return null;
  }

  console.log(`  \u266A Found music: "${music.name}" by ${music.artist}`);

  const buffer = isImage
    ? await createVideoFromImage(mediaUrl, music.url, 10)
    : await mixVideoWithMusic(mediaUrl, music.url);

  const reelUrl = await uploadMixedVideo(buffer);
  const label = isImage ? 'Created Ken Burns video from image' : 'Mixed video + music';
  console.log(`  \u2713 ${label} \u2014 uploaded to Supabase Storage`);

  const updateFields = { music_info: music };
  if (isImage) updateFields.video_url = reelUrl;

  const { error: musicSaveErr } = await supabase
    .from('nc_generated_posts')
    .update(updateFields)
    .eq('id', savedPostId);
  if (musicSaveErr) console.warn(`  \u26A0 Failed to save music/video info: ${musicSaveErr.message}`);

  return reelUrl;
}

// ─── Claude ───────────────────────────────────────────────────────────────────

async function generateContent(promptText, topic) {
  const filledPrompt = promptText.replace('{TOPIC}', topic);

  const message = await anthropic.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages:   [{ role: 'user', content: filledPrompt }],
  });

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
  if (DRY_RUN) console.log('DRY RUN \u2014 content saved to Supabase but NOT posted to Instagram.\n');

  if (!DRY_RUN) await loadAndRefreshTokens();

  await loadRecentlyUsedImages();

  if (!DRY_RUN) {
    if (!IG_TOKEN || !IG_USER_ID) {
      console.warn('\u26A0 Instagram credentials missing \u2014 posting will be skipped');
    } else {
      try {
        const igRes = await fetch(`https://graph.facebook.com/v21.0/${IG_USER_ID}?fields=id,username&access_token=${IG_TOKEN}`);
        const igBody = await igRes.json();
        if (igBody.error) {
          console.error(`\u26A0 Instagram token validation failed: ${igBody.error.message}`);
        } else {
          console.log(`\u2713 Instagram token is valid (account: @${igBody.username || igBody.id})`);
        }
      } catch (e) {
        console.error(`\u26A0 Instagram token check error: ${e.message}`);
      }
    }
  }

  if (!PEXELS_KEY && !UNSPLASH_KEY && !PIXABAY_KEY) console.warn('\u26A0 No image API keys \u2014 media fetching will fail');
  if (!COVERR_KEY) console.warn('\u26A0 Coverr API key missing \u2014 Reels will fall back to Pexels video or static image');

  const { data: schedule, error: schedErr } = await supabase
    .from('nc_day_schedule')
    .select('*')
    .eq('day_of_week', dayOfWeek);

  if (schedErr || !schedule?.length) {
    throw new Error(`Could not load schedule for day_of_week=${dayOfWeek}: ${schedErr?.message}`);
  }

  for (const slot of schedule) {
    console.log(`\n\u2192 ${slot.post_type} (focus: ${slot.focus_type})`);

    try {
      // 1. Topic
      const { data: topic, error: topicErr } = await supabase
        .from('nc_topics')
        .select('*')
        .eq('post_type', slot.post_type)
        .eq('day_slot', daySlot)
        .single();

      if (topicErr || !topic) {
        console.error(`  \u2717 No topic found for ${slot.post_type} slot ${daySlot}`);
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
        console.error(`  \u2717 No prompt for ${slot.post_type}/${promptFocus}`);
        continue;
      }

      // 3. Generate content via Claude
      const generated = await generateContent(prompt.prompt_text, topic.topic);
      console.log(`  \u2713 Claude generated: "${generated.title || topic.topic}"`);

      // 4. Fetch media
      const primaryQuery = generated.image_query || 'luxury salon beauty professional';
      const carouselQueries = slot.post_type === 'CAROUSEL'
        ? (generated.image_queries || Array(6).fill(primaryQuery))
        : [];

      const { urls: mediaUrls, isVideo } = await getMedia(
        primaryQuery,
        carouselQueries,
        slot.post_type,
        imageSource
      );
      console.log(`  \u2713 Media \u2014 ${mediaUrls.length} ${isVideo ? 'video' : 'image'}(s) from ${isVideo ? 'coverr/pexels' : imageSource}`);

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
      console.log(`  \u2713 Saved to Supabase (id: ${savedPost.id})`);

      if (DRY_RUN) {
        console.log('  \u21B7 Dry run \u2014 skipping Instagram posting');
        continue;
      }

      const caption = buildCaption(generated);

      // 6. Post to Instagram
      let igPostId = null;
      try {
        if (isVideo) {
          let reelUrl = mediaUrls[0];
          try {
            const mixedUrl = await prepareReelWithMusic(reelUrl, topic.topic, savedPost.id, false);
            if (mixedUrl) reelUrl = mixedUrl;
          } catch (mixErr) {
            console.warn(`  \u26A0 Music mixing failed: ${mixErr.message} \u2014 posting video without music`);
          }
          igPostId = await postReel(IG_USER_ID, IG_TOKEN, reelUrl, caption.slice(0, 2200));
        } else if (slot.post_type === 'REEL' && !isVideo) {
          let reelUrl = null;
          try {
            reelUrl = await prepareReelWithMusic(mediaUrls[0], topic.topic, savedPost.id, true);
          } catch (imgVidErr) {
            console.warn(`  \u26A0 Image-to-video failed: ${imgVidErr.message}`);
          }

          if (reelUrl) {
            igPostId = await postReel(IG_USER_ID, IG_TOKEN, reelUrl, caption.slice(0, 2200));
          } else {
            console.log('  \u21B7 Falling back to static image post for this Reel slot');
            igPostId = await postSingle(IG_USER_ID, IG_TOKEN, mediaUrls[0], caption.slice(0, 2200));
          }
        } else if (slot.post_type === 'CAROUSEL' && mediaUrls.length > 1) {
          igPostId = await postCarousel(IG_USER_ID, IG_TOKEN, mediaUrls, caption.slice(0, 2200));
        } else {
          igPostId = await postSingle(IG_USER_ID, IG_TOKEN, mediaUrls[0], caption.slice(0, 2200));
        }
        console.log(`  \u2713 Instagram posted (id: ${igPostId})`);
      } catch (err) {
        console.error(`  \u2717 Instagram failed: ${err.message}`);
      }

      // 7. Update Supabase with post ID
      const { error: statusUpdateErr } = await supabase
        .from('nc_generated_posts')
        .update({
          instagram_post_id: igPostId,
          publish_status:    igPostId ? 'PUBLISHED' : 'FAILED',
        })
        .eq('id', savedPost.id);
      if (statusUpdateErr) console.error(`  \u26A0 Failed to update publish status: ${statusUpdateErr.message}`);

    } catch (err) {
      console.error(`  \u2717 Fatal error for ${slot.post_type}: ${err.message}`);
      console.error(err.stack);
    }
  }

  console.log(`\n=== Done ===\n`);
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
