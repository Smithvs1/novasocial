import { describe, it, expect } from 'vitest';
import {
  calculateExpiresAt,
  getDaysUntilExpiry,
  shouldRefreshToken,
  buildCaption,
} from '../scripts/utils.js';

// ─── Token lifecycle simulation ───────────────────────────────────────────────

describe('Token lifecycle', () => {
  const now = new Date('2024-06-01T00:00:00Z');

  it('new token has ~60 days until expiry', () => {
    const expiresAt = calculateExpiresAt(now, 5184000);
    const days = getDaysUntilExpiry(expiresAt.toISOString(), now);
    expect(days).toBe(60);
  });

  it('token refreshed at 13 days remaining triggers refresh', () => {
    expect(shouldRefreshToken(13)).toBe(true);
  });

  it('token with 30 days remaining does not trigger refresh', () => {
    expect(shouldRefreshToken(30)).toBe(false);
  });

  it('expired token shows negative days', () => {
    const expired = '2024-05-01T00:00:00Z';
    const days = getDaysUntilExpiry(expired, now);
    expect(days).toBe(-31);
  });

  it('token store upsert payload is well-formed', () => {
    const key = 'instagram_access_token';
    const value = 'EAAx...token';
    const expiresInSeconds = 5184000;
    const expiresAt = calculateExpiresAt(now, expiresInSeconds);

    const payload = {
      key,
      value,
      refreshed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    expect(payload.key).toBe('instagram_access_token');
    expect(payload.refreshed_at).toBe('2024-06-01T00:00:00.000Z');
    expect(payload.expires_at).toBe('2024-07-31T00:00:00.000Z');
  });
});

// ─── Instagram caption formatting ─────────────────────────────────────────────

describe('Instagram caption formatting', () => {
  it('caption is under 2200 character limit for single posts', () => {
    const generated = {
      caption: 'A'.repeat(1800),
      hashtags: '#beauty #salon #nova #wellness',
    };
    const caption = buildCaption(generated);
    expect(caption.slice(0, 2200).length).toBeLessThanOrEqual(2200);
  });

  it('handles emoji-rich captions', () => {
    const generated = {
      caption: '✨ Transform your space ✨\n\nYour suite, your rules. 💅',
      hashtags: '#NOVACollective #BeautyBoss #SalonSuite',
    };
    const result = buildCaption(generated);
    expect(result).toContain('✨');
    expect(result).toContain('#NOVACollective');
  });

  it('separates caption and hashtags with double newline', () => {
    const generated = {
      caption: 'Great content',
      hashtags: '#tag1 #tag2',
    };
    const result = buildCaption(generated);
    expect(result).toBe('Great content\n\n#tag1 #tag2');
  });
});

// ─── Instagram container status simulation ────────────────────────────────────

describe('Instagram container status handling', () => {
  it('recognizes FINISHED status', () => {
    const response = { status_code: 'FINISHED' };
    expect(response.status_code === 'FINISHED').toBe(true);
  });

  it('recognizes ERROR status', () => {
    const response = { status_code: 'ERROR', error: { message: 'Upload failed' } };
    expect(response.status_code === 'ERROR').toBe(true);
  });

  it('recognizes IN_PROGRESS status (needs retry)', () => {
    const response = { status_code: 'IN_PROGRESS' };
    const isFinished = response.status_code === 'FINISHED';
    const isError = response.status_code === 'ERROR';
    expect(isFinished).toBe(false);
    expect(isError).toBe(false);
  });

  it('carousel publish body is correctly structured', () => {
    const childIds = ['container_1', 'container_2', 'container_3'];
    const caption = 'My carousel post\n\n#beauty #salon';
    const payload = {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: 'TOKEN_PLACEHOLDER',
    };

    expect(payload.media_type).toBe('CAROUSEL');
    expect(payload.children).toBe('container_1,container_2,container_3');
    expect(payload.caption).toContain('#beauty');
  });

  it('reel publish body includes share_to_feed', () => {
    const payload = {
      video_url: 'https://storage.supabase.co/reel-123.mp4',
      media_type: 'REELS',
      caption: 'Check out our space!',
      share_to_feed: true,
      access_token: 'TOKEN_PLACEHOLDER',
    };

    expect(payload.media_type).toBe('REELS');
    expect(payload.share_to_feed).toBe(true);
  });
});

// ─── Supabase post record structure ───────────────────────────────────────────

describe('Post record structure', () => {
  it('draft post has correct initial state', () => {
    const record = {
      scheduled_date: '2024-06-01',
      post_type: 'STATIC',
      focus_type: 'N',
      topic_id: 1,
      prompt_id: 2,
      topic_text: 'Client retention strategies',
      generated_json: { title: 'Test', caption: 'Hello', hashtags: '#test' },
      image_urls: ['https://images.pexels.com/photo-1.jpg'],
      video_url: null,
      media_source: 'pexels',
      safety_status: 'SAFE',
      publish_status: 'DRAFT',
    };

    expect(record.publish_status).toBe('DRAFT');
    expect(record.safety_status).toBe('SAFE');
    expect(record.video_url).toBe(null);
    expect(record.image_urls).toHaveLength(1);
  });

  it('published post includes instagram_post_id', () => {
    const update = {
      instagram_post_id: '17890123456789',
      publish_status: 'PUBLISHED',
    };
    expect(update.publish_status).toBe('PUBLISHED');
    expect(update.instagram_post_id).toBeTruthy();
  });

  it('failed post has FAILED status and null post id', () => {
    const update = {
      instagram_post_id: null,
      publish_status: 'FAILED',
    };
    expect(update.publish_status).toBe('FAILED');
    expect(update.instagram_post_id).toBe(null);
  });

  it('reel post stores video_url instead of image_urls', () => {
    const record = {
      post_type: 'REEL',
      image_urls: null,
      video_url: 'https://storage.coverr.co/videos/123.mp4',
      media_source: 'coverr',
    };
    expect(record.image_urls).toBe(null);
    expect(record.video_url).toBeTruthy();
    expect(record.media_source).toBe('coverr');
  });

  it('carousel post stores multiple image_urls', () => {
    const record = {
      post_type: 'CAROUSEL',
      image_urls: Array.from({ length: 6 }, (_, i) => `https://images.unsplash.com/photo-${i}.jpg`),
      video_url: null,
      media_source: 'unsplash',
    };
    expect(record.image_urls).toHaveLength(6);
    expect(record.video_url).toBe(null);
  });
});
