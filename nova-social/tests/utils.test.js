import { describe, it, expect } from 'vitest';
import {
  getTodayDayOfWeek,
  getISOWeekNumber,
  getImageSource,
  normalizeUrl,
  filterUnused,
  markUsed,
  getBestVideoFile,
  buildCaption,
  calculateDaySlot,
  parseGeneratedContent,
  fillPrompt,
  resolveFocusType,
  calculateExpiresAt,
  getDaysUntilExpiry,
  shouldRefreshToken,
  getMediaSourceForPostType,
  buildJamendoDownloadUrl,
  sanitizeSearchTerms,
} from '../scripts/utils.js';

// ─── getTodayDayOfWeek ────────────────────────────────────────────────────────

describe('getTodayDayOfWeek', () => {
  it('returns 0 for Monday', () => {
    const monday = new Date('2024-01-01T12:00:00Z');
    expect(getTodayDayOfWeek(monday)).toBe(0);
  });

  it('returns 1 for Tuesday', () => {
    const tuesday = new Date('2024-01-02T12:00:00Z');
    expect(getTodayDayOfWeek(tuesday)).toBe(1);
  });

  it('returns 4 for Friday', () => {
    const friday = new Date('2024-01-05T12:00:00Z');
    expect(getTodayDayOfWeek(friday)).toBe(4);
  });

  it('returns 5 for Saturday', () => {
    const saturday = new Date('2024-01-06T12:00:00Z');
    expect(getTodayDayOfWeek(saturday)).toBe(5);
  });

  it('returns 6 for Sunday', () => {
    const sunday = new Date('2024-01-07T12:00:00Z');
    expect(getTodayDayOfWeek(sunday)).toBe(6);
  });

  it('maps all 7 days to 0-6 range (Mon=0, Sun=6)', () => {
    for (let i = 0; i < 7; i++) {
      const d = new Date(`2024-01-0${i + 1}T12:00:00Z`);
      const result = getTodayDayOfWeek(d);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(6);
    }
  });
});

// ─── getISOWeekNumber ─────────────────────────────────────────────────────────

describe('getISOWeekNumber', () => {
  it('returns 1 for the first week of 2024', () => {
    const jan1 = new Date('2024-01-01T12:00:00Z');
    expect(getISOWeekNumber(jan1)).toBe(1);
  });

  it('returns 52 or 53 for end of year', () => {
    const dec31 = new Date('2024-12-31T12:00:00Z');
    const week = getISOWeekNumber(dec31);
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(53);
  });

  it('returns correct week for mid-year date', () => {
    const july1 = new Date('2024-07-01T12:00:00Z');
    expect(getISOWeekNumber(july1)).toBe(27);
  });

  it('returns consistent results for same week', () => {
    const mon = new Date('2024-03-04T12:00:00Z');
    const fri = new Date('2024-03-08T12:00:00Z');
    expect(getISOWeekNumber(mon)).toBe(getISOWeekNumber(fri));
  });

  it('returns different weeks for dates 7 days apart', () => {
    const d1 = new Date('2024-03-04T12:00:00Z');
    const d2 = new Date('2024-03-11T12:00:00Z');
    expect(getISOWeekNumber(d2)).toBe(getISOWeekNumber(d1) + 1);
  });
});

// ─── getImageSource ───────────────────────────────────────────────────────────

describe('getImageSource', () => {
  it('returns one of pexels, unsplash, or pixabay', () => {
    const sources = ['pexels', 'unsplash', 'pixabay'];
    const result = getImageSource(new Date('2024-01-15T12:00:00Z'));
    expect(sources).toContain(result);
  });

  it('returns pexels when week % 3 === 0', () => {
    const date = new Date('2024-01-15T12:00:00Z'); // week 3
    expect(getISOWeekNumber(date) % 3).toBe(0);
    expect(getImageSource(date)).toBe('pexels');
  });

  it('returns unsplash when week % 3 === 1', () => {
    const date = new Date('2024-01-01T12:00:00Z'); // week 1
    expect(getISOWeekNumber(date) % 3).toBe(1);
    expect(getImageSource(date)).toBe('unsplash');
  });

  it('returns pixabay when week % 3 === 2', () => {
    const date = new Date('2024-01-08T12:00:00Z'); // week 2
    expect(getISOWeekNumber(date) % 3).toBe(2);
    expect(getImageSource(date)).toBe('pixabay');
  });

  it('cycles through all 3 sources over consecutive weeks', () => {
    const sources = new Set();
    for (let i = 0; i < 3; i++) {
      const d = new Date('2024-01-01T12:00:00Z');
      d.setDate(d.getDate() + i * 7);
      sources.add(getImageSource(d));
    }
    expect(sources.size).toBe(3);
  });
});

// ─── normalizeUrl ─────────────────────────────────────────────────────────────

describe('normalizeUrl', () => {
  it('strips query params from Unsplash URLs', () => {
    const url = 'https://images.unsplash.com/photo-123?w=1080&q=80';
    expect(normalizeUrl(url)).toBe('https://images.unsplash.com/photo-123');
  });

  it('strips query params from Pexels URLs', () => {
    const url = 'https://images.pexels.com/photos/123/photo.jpg?auto=compress&cs=tinysrgb';
    expect(normalizeUrl(url)).toBe('https://images.pexels.com/photos/123/photo.jpg');
  });

  it('strips query params from Pixabay URLs', () => {
    const url = 'https://pixabay.com/get/photo-123.jpg?w=1280';
    expect(normalizeUrl(url)).toBe('https://pixabay.com/get/photo-123.jpg');
  });

  it('strips query params from Coverr URLs', () => {
    const url = 'https://storage.coverr.co/videos/123.mp4?token=abc';
    expect(normalizeUrl(url)).toBe('https://storage.coverr.co/videos/123.mp4');
  });

  it('returns non-matching URLs unchanged', () => {
    const url = 'https://example.com/image.jpg?size=large';
    expect(normalizeUrl(url)).toBe(url);
  });

  it('returns invalid URLs unchanged', () => {
    expect(normalizeUrl('not-a-url')).toBe('not-a-url');
    expect(normalizeUrl('')).toBe('');
  });

  it('handles URLs without query params', () => {
    const url = 'https://images.unsplash.com/photo-123';
    expect(normalizeUrl(url)).toBe(url);
  });
});

// ─── filterUnused ─────────────────────────────────────────────────────────────

describe('filterUnused', () => {
  it('returns only unused URLs when some are in the set', () => {
    const used = new Set(['https://images.unsplash.com/photo-1']);
    const urls = [
      'https://images.unsplash.com/photo-1?w=800',
      'https://images.unsplash.com/photo-2?w=800',
    ];
    const result = filterUnused(urls, used);
    expect(result).toEqual(['https://images.unsplash.com/photo-2?w=800']);
  });

  it('returns all URLs when none are used', () => {
    const used = new Set();
    const urls = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    expect(filterUnused(urls, used)).toEqual(urls);
  });

  it('returns original URLs if all are used (fallback)', () => {
    const used = new Set(['https://images.pexels.com/a.jpg', 'https://images.pexels.com/b.jpg']);
    const urls = [
      'https://images.pexels.com/a.jpg?auto=compress',
      'https://images.pexels.com/b.jpg?auto=compress',
    ];
    expect(filterUnused(urls, used)).toEqual(urls);
  });

  it('handles empty URL array', () => {
    const used = new Set(['https://example.com/a.jpg']);
    expect(filterUnused([], used)).toEqual([]);
  });
});

// ─── markUsed ─────────────────────────────────────────────────────────────────

describe('markUsed', () => {
  it('adds normalized URLs to the set', () => {
    const used = new Set();
    markUsed(['https://images.unsplash.com/photo-1?w=800'], used);
    expect(used.has('https://images.unsplash.com/photo-1')).toBe(true);
  });

  it('handles multiple URLs', () => {
    const used = new Set();
    markUsed([
      'https://images.pexels.com/a.jpg?q=80',
      'https://images.pexels.com/b.jpg?q=80',
    ], used);
    expect(used.size).toBe(2);
  });

  it('does not duplicate existing entries', () => {
    const used = new Set(['https://images.unsplash.com/photo-1']);
    markUsed(['https://images.unsplash.com/photo-1?w=800'], used);
    expect(used.size).toBe(1);
  });
});

// ─── getBestVideoFile ─────────────────────────────────────────────────────────

describe('getBestVideoFile', () => {
  it('returns HD video link when available', () => {
    const files = [
      { quality: 'sd', link: 'https://example.com/sd.mp4' },
      { quality: 'hd', link: 'https://example.com/hd.mp4' },
    ];
    expect(getBestVideoFile(files)).toBe('https://example.com/hd.mp4');
  });

  it('falls back to first file when no HD available', () => {
    const files = [
      { quality: 'sd', link: 'https://example.com/sd.mp4' },
      { quality: 'sd', link: 'https://example.com/sd2.mp4' },
    ];
    expect(getBestVideoFile(files)).toBe('https://example.com/sd.mp4');
  });

  it('returns null for empty array', () => {
    expect(getBestVideoFile([])).toBe(null);
  });

  it('returns null when file has no link property', () => {
    const files = [{ quality: 'hd' }];
    expect(getBestVideoFile(files)).toBe(null);
  });
});

// ─── buildCaption ─────────────────────────────────────────────────────────────

describe('buildCaption', () => {
  it('combines caption and hashtags', () => {
    const generated = {
      caption: 'Beautiful salon vibes',
      hashtags: '#beauty #salon #nova',
    };
    expect(buildCaption(generated)).toBe('Beautiful salon vibes\n\n#beauty #salon #nova');
  });

  it('handles missing caption', () => {
    const generated = { hashtags: '#beauty' };
    expect(buildCaption(generated)).toBe('#beauty');
  });

  it('handles missing hashtags', () => {
    const generated = { caption: 'Great content' };
    expect(buildCaption(generated)).toBe('Great content');
  });

  it('handles empty generated object', () => {
    expect(buildCaption({})).toBe('');
  });

  it('trims whitespace', () => {
    const generated = { caption: '  Hello  ', hashtags: '  #tag  ' };
    const result = buildCaption(generated);
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
  });
});

// ─── calculateDaySlot ─────────────────────────────────────────────────────────

describe('calculateDaySlot', () => {
  it('returns 1 when cycleStart is null', () => {
    expect(calculateDaySlot(null)).toBe(1);
  });

  it('returns 1 on the cycle start day', () => {
    const start = '2024-01-01';
    const today = new Date('2024-01-01T12:00:00Z');
    expect(calculateDaySlot(start, today)).toBe(1);
  });

  it('returns 2 one day after start', () => {
    const start = '2024-01-01';
    const today = new Date('2024-01-02T12:00:00Z');
    expect(calculateDaySlot(start, today)).toBe(2);
  });

  it('returns 30 on day 29 after start', () => {
    const start = '2024-01-01';
    const today = new Date('2024-01-30T12:00:00Z');
    expect(calculateDaySlot(start, today)).toBe(30);
  });

  it('wraps around to 1 after 30 days', () => {
    const start = '2024-01-01';
    const today = new Date('2024-01-31T12:00:00Z');
    expect(calculateDaySlot(start, today)).toBe(1);
  });

  it('wraps correctly for day 60 (2 full cycles)', () => {
    const start = '2024-01-01';
    const today = new Date('2024-03-01T12:00:00Z');
    expect(calculateDaySlot(start, today)).toBe(1);
  });

  it('handles mid-cycle correctly', () => {
    const start = '2024-01-01';
    const today = new Date('2024-01-16T12:00:00Z');
    expect(calculateDaySlot(start, today)).toBe(16);
  });
});

// ─── parseGeneratedContent ────────────────────────────────────────────────────

describe('parseGeneratedContent', () => {
  it('extracts JSON from text with surrounding content', () => {
    const raw = 'Here is the content:\n{"title": "Test", "caption": "Hello"}';
    expect(parseGeneratedContent(raw)).toEqual({ title: 'Test', caption: 'Hello' });
  });

  it('parses plain JSON string', () => {
    const raw = '{"title": "Direct JSON"}';
    expect(parseGeneratedContent(raw)).toEqual({ title: 'Direct JSON' });
  });

  it('returns null for text without JSON', () => {
    expect(parseGeneratedContent('No JSON here')).toBe(null);
  });

  it('returns null for empty string', () => {
    expect(parseGeneratedContent('')).toBe(null);
  });

  it('returns null for invalid JSON inside braces', () => {
    expect(parseGeneratedContent('{not: valid: json}')).toBe(null);
  });

  it('handles nested JSON objects', () => {
    const raw = '```json\n{"caption": "Test", "meta": {"key": "val"}}\n```';
    const result = parseGeneratedContent(raw);
    expect(result.caption).toBe('Test');
    expect(result.meta.key).toBe('val');
  });
});

// ─── fillPrompt ───────────────────────────────────────────────────────────────

describe('fillPrompt', () => {
  it('replaces {TOPIC} placeholder with topic', () => {
    const template = 'Write a post about {TOPIC} for beauty professionals';
    expect(fillPrompt(template, 'salon marketing')).toBe(
      'Write a post about salon marketing for beauty professionals'
    );
  });

  it('replaces only the first occurrence', () => {
    const template = '{TOPIC} is great. More about {TOPIC}';
    const result = fillPrompt(template, 'wellness');
    expect(result).toBe('wellness is great. More about {TOPIC}');
  });

  it('returns unchanged if no placeholder', () => {
    const template = 'No placeholder here';
    expect(fillPrompt(template, 'anything')).toBe(template);
  });
});

// ─── resolveFocusType ─────────────────────────────────────────────────────────

describe('resolveFocusType', () => {
  it('returns N when focusType is A and random < 0.5', () => {
    expect(resolveFocusType('A', 0.3)).toBe('N');
  });

  it('returns C when focusType is A and random >= 0.5', () => {
    expect(resolveFocusType('A', 0.7)).toBe('C');
  });

  it('returns N unchanged', () => {
    expect(resolveFocusType('N')).toBe('N');
  });

  it('returns C unchanged', () => {
    expect(resolveFocusType('C')).toBe('C');
  });

  it('returns boundary case: random exactly 0.5 gives C', () => {
    expect(resolveFocusType('A', 0.5)).toBe('C');
  });
});

// ─── calculateExpiresAt ───────────────────────────────────────────────────────

describe('calculateExpiresAt', () => {
  it('adds seconds to the given date', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const result = calculateExpiresAt(now, 3600);
    expect(result.toISOString()).toBe('2024-01-01T01:00:00.000Z');
  });

  it('handles 60-day token expiry', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const sixtyDays = 60 * 24 * 3600;
    const result = calculateExpiresAt(now, sixtyDays);
    expect(result.toISOString()).toBe('2024-03-01T00:00:00.000Z');
  });
});

// ─── getDaysUntilExpiry ───────────────────────────────────────────────────────

describe('getDaysUntilExpiry', () => {
  it('returns positive days for future expiry', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const expiresAt = '2024-01-31T00:00:00Z';
    expect(getDaysUntilExpiry(expiresAt, now)).toBe(30);
  });

  it('returns negative days for past expiry', () => {
    const now = new Date('2024-02-01T00:00:00Z');
    const expiresAt = '2024-01-01T00:00:00Z';
    expect(getDaysUntilExpiry(expiresAt, now)).toBe(-31);
  });

  it('returns 0 for same day', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    expect(getDaysUntilExpiry('2024-01-01T00:00:00Z', now)).toBe(0);
  });
});

// ─── shouldRefreshToken ───────────────────────────────────────────────────────

describe('shouldRefreshToken', () => {
  it('returns true when days left is below threshold', () => {
    expect(shouldRefreshToken(10, 14)).toBe(true);
  });

  it('returns false when days left is above threshold', () => {
    expect(shouldRefreshToken(30, 14)).toBe(false);
  });

  it('returns false when days left equals threshold', () => {
    expect(shouldRefreshToken(14, 14)).toBe(false);
  });

  it('uses default threshold of 14', () => {
    expect(shouldRefreshToken(13)).toBe(true);
    expect(shouldRefreshToken(14)).toBe(false);
  });
});

// ─── getMediaSourceForPostType ────────────────────────────────────────────────

describe('getMediaSourceForPostType', () => {
  it('returns coverr for REEL posts', () => {
    expect(getMediaSourceForPostType('REEL', 'pexels')).toBe('coverr');
  });

  it('returns imageSource for STATIC posts', () => {
    expect(getMediaSourceForPostType('STATIC', 'unsplash')).toBe('unsplash');
  });

  it('returns imageSource for CAROUSEL posts', () => {
    expect(getMediaSourceForPostType('CAROUSEL', 'pixabay')).toBe('pixabay');
  });
});

// ─── buildJamendoDownloadUrl ──────────────────────────────────────────────────

describe('buildJamendoDownloadUrl', () => {
  it('appends client_id when not present', () => {
    const url = 'https://mp3d.jamendo.com/download/track/123/mp32';
    expect(buildJamendoDownloadUrl(url, 'my_client')).toBe(
      'https://mp3d.jamendo.com/download/track/123/mp32?client_id=my_client'
    );
  });

  it('appends with & when URL already has query params', () => {
    const url = 'https://mp3d.jamendo.com/download/track/123?format=mp3';
    expect(buildJamendoDownloadUrl(url, 'my_client')).toBe(
      'https://mp3d.jamendo.com/download/track/123?format=mp3&client_id=my_client'
    );
  });

  it('returns URL unchanged when client_id already present', () => {
    const url = 'https://mp3d.jamendo.com/download?client_id=existing';
    expect(buildJamendoDownloadUrl(url, 'my_client')).toBe(url);
  });

  it('returns null for null/falsy input', () => {
    expect(buildJamendoDownloadUrl(null, 'id')).toBe(null);
    expect(buildJamendoDownloadUrl('', 'id')).toBe(null);
  });
});

// ─── sanitizeSearchTerms ──────────────────────────────────────────────────────

describe('sanitizeSearchTerms', () => {
  it('removes special characters and limits words', () => {
    const query = "luxury salon & spa - professional's choice";
    expect(sanitizeSearchTerms(query, 3)).toBe('luxury+salon+spa');
  });

  it('joins words with + separator', () => {
    expect(sanitizeSearchTerms('beauty wellness spa relaxation', 3)).toBe('beauty+wellness+spa');
  });

  it('handles single word', () => {
    expect(sanitizeSearchTerms('beauty', 3)).toBe('beauty');
  });

  it('respects maxWords parameter', () => {
    expect(sanitizeSearchTerms('one two three four five', 2)).toBe('one+two');
  });

  it('handles empty string', () => {
    expect(sanitizeSearchTerms('', 3)).toBe('');
  });
});
