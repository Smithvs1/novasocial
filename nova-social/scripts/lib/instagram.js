/**
 * Instagram Graph API helpers -- replaces three near-identical
 * posting functions with a shared create -> wait -> publish pipeline.
 *
 * Includes HTTP status validation and resilient container polling
 * from the error-handling improvements.
 */

const IG_API = 'https://graph.facebook.com/v21.0';

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Create an Instagram media container.
 */
async function createContainer(userId, body, token) {
  const res = await fetch(`${IG_API}/${userId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`IG create container: ${data.error.message}`);
  return data.id;
}

/**
 * Wait for a container to finish processing, with resilient polling
 * that handles transient HTTP errors gracefully.
 */
async function waitForContainer(containerId, token, maxAttempts = 90) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(
        `${IG_API}/${containerId}?fields=status_code&access_token=${token}`
      );
      if (!res.ok) {
        console.warn(`  \u26A0 IG container status check HTTP error: ${res.status} (attempt ${i + 1}/${maxAttempts})`);
        await sleep(2000);
        continue;
      }
      const data = await res.json();
      if (data.status_code === 'FINISHED') return;
      if (data.status_code === 'ERROR') {
        throw new Error(`Instagram container error: ${JSON.stringify(data)}`);
      }
    } catch (e) {
      if (e.message.startsWith('Instagram container error')) throw e;
      console.warn(`  \u26A0 IG container status check failed: ${e.message} (attempt ${i + 1}/${maxAttempts})`);
    }
    await sleep(2000);
  }
  throw new Error(`Instagram container timed out after ${maxAttempts * 2} seconds`);
}

/**
 * Publish a processed container.
 */
async function publishContainer(userId, containerId, token) {
  const res = await fetch(`${IG_API}/${userId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`IG publish: ${data.error.message}`);
  return data.id;
}

/**
 * Full create -> wait -> publish pipeline. Used by all three post types.
 */
async function createAndPublish(userId, token, containerBody, waitAttempts = 90) {
  const containerId = await createContainer(userId, containerBody, token);
  await waitForContainer(containerId, token, waitAttempts);
  return publishContainer(userId, containerId, token);
}

export async function postSingle(userId, token, imageUrl, caption) {
  return createAndPublish(userId, token, {
    image_url: imageUrl,
    media_type: 'IMAGE',
    caption,
  });
}

export async function postReel(userId, token, videoUrl, caption) {
  return createAndPublish(userId, token, {
    video_url: videoUrl,
    media_type: 'REELS',
    caption,
    share_to_feed: true,
  }, 30);
}

export async function postCarousel(userId, token, imageUrls, caption) {
  const childIds = [];
  for (const url of imageUrls) {
    const id = await createContainer(userId, {
      image_url: url,
      is_carousel_item: true,
    }, token);
    childIds.push(id);
    await sleep(1000);
  }

  return createAndPublish(userId, token, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
  });
}
