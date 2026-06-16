# NOVA Collective Social Content Automation

Daily automated Instagram posts for NOVA Collective — generates beauty & wellness professional content via Claude, pulls media from Coverr/Pexels/Unsplash/Pixabay, mixes Reel videos with Jamendo music, and posts to Instagram.

## How It Works

1. **GitHub Actions cron** fires daily at 9:00 AM UTC (4 AM EST)
2. Pulls today's topic from the 90-day topic bank (30 REEL + 30 STATIC + 30 CAROUSEL)
3. Claude generates content using NOVA Collective prompt templates
4. Fetches media:
   - **Reels**: Coverr.co stock video (fallback: Pexels video, then Ken Burns from still image)
   - **Static posts**: Rotates weekly between Pexels, Unsplash, and Pixabay
   - **Carousels**: 6 images from the weekly image source
5. FFmpeg mixes video + Jamendo instrumental music for Reels
6. Posts to Instagram business account via Meta Graph API
7. Saves everything to Supabase for tracking

## Content Strategy

- **3 post types daily**: Reel (video), Static (single image), Carousel (6 images)
- **2 content tones**: Neutral (all beauty/wellness pros) and Community-Forward (diverse entrepreneurs, women of color, first-gen business owners)
- **90-day topic rotation**: Topics cycle every 30 days per post type
- **Target professionals**: Hairstylists, barbers, estheticians, nail techs, massage therapists, lash/brow techs, tattoo artists, Reiki/energy healers, makeup artists, waxing specialists
- **Brand messaging**: NOVA Collective is a private membership (Master Membership Agreement), not a lease — members hold a revocable license to use workspace, paying membership dues

## Setup

### 1. Run Supabase Migrations

Run these SQL files **in order** in your Supabase SQL Editor:

```
supabase/001_create_tables.sql
supabase/002_seed_schedule.sql
supabase/003_seed_prompts.sql
supabase/004_seed_topics.sql
supabase/005_token_store.sql
```

### 2. Create Supabase Storage Bucket

In your Supabase dashboard, go to **Storage** and create a public bucket named `reel-videos`. This stores the mixed video+music files for Reels.

### 3. Add GitHub Secrets

Go to **Settings > Secrets and variables > Actions** in this repo and add:

| Secret | Where to get it |
|--------|----------------|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) > API Keys |
| `SUPABASE_URL` | Supabase dashboard > Project Settings > API > Project URL |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard > Project Settings > API > service_role key |
| `PEXELS_API_KEY` | [pexels.com/api](https://www.pexels.com/api/) (free) |
| `UNSPLASH_ACCESS_KEY` | [unsplash.com/developers](https://unsplash.com/developers) (free) |
| `PIXABAY_API_KEY` | [pixabay.com/api/docs](https://pixabay.com/api/docs/) (free) |
| `COVERR_API_KEY` | [coverr.co](https://coverr.co/) > API settings |
| `INSTAGRAM_ACCESS_TOKEN` | Meta for Developers > your app > Instagram (needs `instagram_content_publish`, `instagram_basic`, `pages_read_engagement`) |
| `INSTAGRAM_USER_ID` | Your Instagram Business Account ID |
| `META_APP_ID` | Meta for Developers > App Settings > Basic |
| `META_APP_SECRET` | Meta for Developers > App Settings > Basic |
| `JAMENDO_CLIENT_ID` | [devportal.jamendo.com](https://devportal.jamendo.com/) (sign up > create app > get client ID) |

### 4. Test with Dry Run

Go to **Actions** tab > **NOVA Collective Daily Instagram Content** > **Run workflow** > set dry_run to `true`.

This generates content and saves to Supabase without actually posting to Instagram.

### 5. Go Live

Once the dry run looks good, the cron will automatically post every day at 9 AM UTC. You can also trigger manually from the Actions tab with dry_run set to `false`.

## Commands

```bash
cd nova-social
npm install
npm run generate    # Run the full pipeline
npm run dry-run     # Generate + save to Supabase, skip posting
```

## Media Sources

| Source | Used for | Rotation |
|--------|----------|----------|
| **Coverr.co** | Reel videos | Primary video source (Demo: 50 req/hr) |
| **Pexels** | Images + fallback video | Week % 3 = 0 |
| **Unsplash** | Images | Week % 3 = 1 |
| **Pixabay** | Images | Week % 3 = 2 |
| **Jamendo** | Background music for Reels | Every Reel |

## Database Tables

All tables are prefixed with `nc_` (NOVA Collective):

- `nc_prompts` — 6 prompt templates (REEL/STATIC/CAROUSEL × N/C)
- `nc_topics` — 90-day topic bank (30 per post type)
- `nc_day_schedule` — Weekly tone schedule (7 days × 3 post types)
- `nc_generated_posts` — All generated + published content
- `nc_cycle_tracker` — Tracks the 30-day cycle position
- `nc_token_store` — Instagram token auto-refresh storage
