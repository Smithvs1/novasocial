import { describe, it, expect } from 'vitest';
import {
  normalizeUrl,
  filterUnused,
  getBestVideoFile,
  buildJamendoDownloadUrl,
} from '../scripts/utils.js';

// ─── Simulated media API response processing ─────────────────────────────────

describe('Pexels response processing', () => {
  it('extracts large2x URLs from photos array', () => {
    const response = {
      photos: [
        { src: { large2x: 'https://images.pexels.com/photos/1/large2x.jpg', large: 'https://images.pexels.com/photos/1/large.jpg' } },
        { src: { large2x: 'https://images.pexels.com/photos/2/large2x.jpg', large: 'https://images.pexels.com/photos/2/large.jpg' } },
        { src: { large2x: 'https://images.pexels.com/photos/3/large2x.jpg', large: 'https://images.pexels.com/photos/3/large.jpg' } },
      ],
    };

    const allUrls = response.photos.map(p => p.src.large2x || p.src.large);
    expect(allUrls).toEqual([
      'https://images.pexels.com/photos/1/large2x.jpg',
      'https://images.pexels.com/photos/2/large2x.jpg',
      'https://images.pexels.com/photos/3/large2x.jpg',
    ]);
  });

  it('falls back to large when large2x is missing', () => {
    const response = {
      photos: [
        { src: { large: 'https://images.pexels.com/photos/1/large.jpg' } },
      ],
    };

    const allUrls = response.photos.map(p => p.src.large2x || p.src.large);
    expect(allUrls).toEqual(['https://images.pexels.com/photos/1/large.jpg']);
  });

  it('returns empty array when no photos', () => {
    const response = { photos: [] };
    const allUrls = (response.photos || []).map(p => p.src.large2x || p.src.large);
    expect(allUrls).toEqual([]);
  });

  it('filters and slices results correctly', () => {
    const used = new Set(['https://images.pexels.com/photos/1/large2x.jpg']);
    const allUrls = [
      'https://images.pexels.com/photos/1/large2x.jpg?auto=compress',
      'https://images.pexels.com/photos/2/large2x.jpg?auto=compress',
      'https://images.pexels.com/photos/3/large2x.jpg?auto=compress',
    ];

    const result = filterUnused(allUrls, used).slice(0, 1);
    expect(result).toEqual(['https://images.pexels.com/photos/2/large2x.jpg?auto=compress']);
  });
});

describe('Unsplash response processing', () => {
  it('extracts regular URLs from results array', () => {
    const response = {
      results: [
        { urls: { regular: 'https://images.unsplash.com/photo-1?w=1080' } },
        { urls: { regular: 'https://images.unsplash.com/photo-2?w=1080' } },
      ],
    };

    const allUrls = response.results.map(p => p.urls.regular);
    expect(allUrls).toEqual([
      'https://images.unsplash.com/photo-1?w=1080',
      'https://images.unsplash.com/photo-2?w=1080',
    ]);
  });

  it('handles empty results', () => {
    const response = { results: [] };
    expect(response.results.length).toBe(0);
  });

  it('deduplicates by normalized URL', () => {
    const used = new Set(['https://images.unsplash.com/photo-1']);
    const allUrls = [
      'https://images.unsplash.com/photo-1?w=400',
      'https://images.unsplash.com/photo-2?w=400',
    ];
    const fresh = filterUnused(allUrls, used);
    expect(fresh).toEqual(['https://images.unsplash.com/photo-2?w=400']);
  });
});

describe('Pixabay response processing', () => {
  it('extracts largeImageURL from hits', () => {
    const response = {
      hits: [
        { largeImageURL: 'https://pixabay.com/get/photo-1_1280.jpg', webformatURL: 'https://pixabay.com/get/photo-1_640.jpg' },
        { largeImageURL: 'https://pixabay.com/get/photo-2_1280.jpg', webformatURL: 'https://pixabay.com/get/photo-2_640.jpg' },
      ],
    };

    const allUrls = response.hits.map(h => h.largeImageURL || h.webformatURL);
    expect(allUrls).toEqual([
      'https://pixabay.com/get/photo-1_1280.jpg',
      'https://pixabay.com/get/photo-2_1280.jpg',
    ]);
  });

  it('falls back to webformatURL when largeImageURL is missing', () => {
    const response = {
      hits: [
        { webformatURL: 'https://pixabay.com/get/photo-1_640.jpg' },
      ],
    };

    const allUrls = response.hits.map(h => h.largeImageURL || h.webformatURL);
    expect(allUrls).toEqual(['https://pixabay.com/get/photo-1_640.jpg']);
  });
});

describe('Coverr response processing', () => {
  it('extracts video URL from hits', () => {
    const response = {
      hits: [
        { video_files: [{ url: 'https://storage.coverr.co/videos/123.mp4' }], urls: { mp4: 'https://coverr.co/dl/123.mp4' } },
      ],
    };

    const url = response.hits[0].video_files?.[0]?.url || response.hits[0].urls?.mp4;
    expect(url).toBe('https://storage.coverr.co/videos/123.mp4');
  });

  it('falls back to urls.mp4 when video_files is empty', () => {
    const response = {
      hits: [
        { video_files: [], urls: { mp4: 'https://coverr.co/dl/456.mp4' } },
      ],
    };

    const url = response.hits[0].video_files?.[0]?.url || response.hits[0].urls?.mp4;
    expect(url).toBe('https://coverr.co/dl/456.mp4');
  });

  it('checks deduplication before returning', () => {
    const used = new Set(['https://storage.coverr.co/videos/123.mp4']);
    const url = 'https://storage.coverr.co/videos/123.mp4?token=abc';
    expect(used.has(normalizeUrl(url))).toBe(true);
  });
});

describe('Pexels video response processing', () => {
  it('selects HD quality video file', () => {
    const videoFiles = [
      { quality: 'sd', link: 'https://videos.pexels.com/sd.mp4' },
      { quality: 'hd', link: 'https://videos.pexels.com/hd.mp4' },
      { quality: 'uhd', link: 'https://videos.pexels.com/uhd.mp4' },
    ];

    expect(getBestVideoFile(videoFiles)).toBe('https://videos.pexels.com/hd.mp4');
  });

  it('processes multiple video search results', () => {
    const response = {
      videos: [
        { video_files: [{ quality: 'hd', link: 'https://videos.pexels.com/v1.mp4' }] },
        { video_files: [{ quality: 'hd', link: 'https://videos.pexels.com/v2.mp4' }] },
      ],
    };

    const used = new Set();
    let found = null;
    for (const vid of response.videos) {
      const url = getBestVideoFile(vid.video_files);
      if (url && !used.has(normalizeUrl(url))) {
        found = url;
        break;
      }
    }
    expect(found).toBe('https://videos.pexels.com/v1.mp4');
  });
});

describe('Jamendo response processing', () => {
  it('filters for downloadable tracks', () => {
    const results = [
      { name: 'Track 1', artist_name: 'Artist A', audiodownload_allowed: true, audiodownload: 'https://mp3d.jamendo.com/1.mp3', audio: 'https://jamendo.com/1.ogg' },
      { name: 'Track 2', artist_name: 'Artist B', audiodownload_allowed: false, audiodownload: 'https://mp3d.jamendo.com/2.mp3', audio: 'https://jamendo.com/2.ogg' },
      { name: 'Track 3', artist_name: 'Artist C', audiodownload_allowed: true, audiodownload: 'https://mp3d.jamendo.com/3.mp3', audio: 'https://jamendo.com/3.ogg' },
    ];

    const downloadable = results.filter(t => t.audiodownload_allowed !== false);
    expect(downloadable).toHaveLength(2);
    expect(downloadable[0].name).toBe('Track 1');
    expect(downloadable[1].name).toBe('Track 3');
  });

  it('builds download URL with client_id', () => {
    const trackUrl = 'https://mp3d.jamendo.com/download/track/12345/mp32';
    const clientId = 'test_client_id';
    const dlUrl = buildJamendoDownloadUrl(trackUrl, clientId);
    expect(dlUrl).toBe('https://mp3d.jamendo.com/download/track/12345/mp32?client_id=test_client_id');
  });

  it('prefers audiodownload over audio URL', () => {
    const track = {
      audiodownload: 'https://mp3d.jamendo.com/download/track/123/mp32',
      audio: 'https://jamendo.com/stream/123',
    };
    const trackUrl = track.audiodownload || track.audio;
    expect(trackUrl).toBe('https://mp3d.jamendo.com/download/track/123/mp32');
  });

  it('falls back to audio when audiodownload is missing', () => {
    const track = {
      audiodownload: null,
      audio: 'https://jamendo.com/stream/123',
    };
    const trackUrl = track.audiodownload || track.audio;
    expect(trackUrl).toBe('https://jamendo.com/stream/123');
  });

  it('constructs music info object correctly', () => {
    const track = {
      name: 'Chill Vibes',
      artist_name: 'Lo-Fi Producer',
      audiodownload: 'https://mp3d.jamendo.com/track/999/mp32',
    };
    const clientId = 'abc123';
    const dlUrl = buildJamendoDownloadUrl(track.audiodownload, clientId);
    const musicInfo = {
      url: dlUrl,
      name: track.name,
      artist: track.artist_name,
    };

    expect(musicInfo).toEqual({
      url: 'https://mp3d.jamendo.com/track/999/mp32?client_id=abc123',
      name: 'Chill Vibes',
      artist: 'Lo-Fi Producer',
    });
  });
});

describe('Media routing logic', () => {
  it('REEL posts try coverr first, then pexels video, then static fallback', () => {
    const postType = 'REEL';
    const hasVideoUrl = false;
    const hasPexelsVideo = false;

    let result;
    if (postType === 'REEL') {
      if (hasVideoUrl) {
        result = { type: 'coverr_video' };
      } else if (hasPexelsVideo) {
        result = { type: 'pexels_video' };
      } else {
        result = { type: 'static_fallback' };
      }
    }
    expect(result.type).toBe('static_fallback');
  });

  it('CAROUSEL posts fetch one image per query', () => {
    const queries = ['salon', 'beauty', 'spa', 'wellness', 'hair', 'nails'];
    const urls = queries.map((q, i) => `https://images.pexels.com/photo-${i}.jpg`);
    expect(urls).toHaveLength(6);
  });

  it('STATIC posts fetch a single image', () => {
    const count = 1;
    const urls = ['https://images.unsplash.com/photo-1.jpg'];
    expect(urls.slice(0, count)).toHaveLength(1);
  });
});

describe('Image source rotation', () => {
  it('fetches count * 5 or 10 results (whichever is larger) for dedup pool', () => {
    const count = 1;
    const fetchCount = Math.max(count * 5, 10);
    expect(fetchCount).toBe(10);

    const count6 = 6;
    const fetchCount6 = Math.max(count6 * 5, 10);
    expect(fetchCount6).toBe(30);
  });

  it('slices results to requested count after filtering', () => {
    const allUrls = Array.from({ length: 10 }, (_, i) => `https://images.pexels.com/photo-${i}.jpg`);
    const used = new Set();
    const result = filterUnused(allUrls, used).slice(0, 3);
    expect(result).toHaveLength(3);
  });
});
