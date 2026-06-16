-- NOVA Collective Social Content Automation
-- Run these in order in the Supabase SQL Editor

-- 1. Prompt templates
CREATE TABLE IF NOT EXISTS nc_prompts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type    text NOT NULL CHECK (post_type IN ('REEL', 'STATIC', 'CAROUSEL')),
  focus_type   text NOT NULL CHECK (focus_type IN ('N', 'C', 'A')),
  name         text NOT NULL,
  prompt_text  text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2. 90-topic bank (30 per post type × 3 types)
CREATE TABLE IF NOT EXISTS nc_topics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type   text NOT NULL CHECK (post_type IN ('REEL', 'STATIC', 'CAROUSEL')),
  focus_type  text NOT NULL CHECK (focus_type IN ('N', 'C', 'A')),
  day_slot    int  NOT NULL CHECK (day_slot BETWEEN 1 AND 30),
  topic       text NOT NULL,
  notes       text,
  UNIQUE (post_type, day_slot)
);

-- 3. Weekly tone schedule (21 rows: 7 days × 3 post types)
CREATE TABLE IF NOT EXISTS nc_day_schedule (
  day_of_week  int  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon, 6=Sun
  post_type    text NOT NULL CHECK (post_type IN ('REEL', 'STATIC', 'CAROUSEL')),
  focus_type   text NOT NULL CHECK (focus_type IN ('N', 'C', 'A')),
  PRIMARY KEY (day_of_week, post_type)
);

-- 4. Generated + published posts
CREATE TABLE IF NOT EXISTS nc_generated_posts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduled_date      date NOT NULL,
  post_type           text NOT NULL,
  focus_type          text NOT NULL,
  topic_id            uuid REFERENCES nc_topics(id),
  prompt_id           uuid REFERENCES nc_prompts(id),
  topic_text          text NOT NULL,
  generated_json      jsonb,
  image_urls          jsonb,         -- array of public image URLs
  video_url           text,          -- Coverr video URL (for reels)
  media_source        text,          -- 'pexels', 'unsplash', 'pixabay', or 'coverr'
  music_info          jsonb,         -- Jamendo track info for reels
  safety_status       text NOT NULL DEFAULT 'PENDING' CHECK (safety_status IN ('PENDING','SAFE','UNSAFE')),
  safety_result       jsonb,
  instagram_post_id   text,
  publish_status      text NOT NULL DEFAULT 'DRAFT' CHECK (publish_status IN ('DRAFT','PUBLISHED','FAILED')),
  error_log           text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 5. Cycle tracker — stores the date day_slot 1 began
CREATE TABLE IF NOT EXISTS nc_cycle_tracker (
  id           int PRIMARY KEY DEFAULT 1,
  cycle_start  date NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed cycle start to today when first running
INSERT INTO nc_cycle_tracker (id, cycle_start)
VALUES (1, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nc_generated_posts_date ON nc_generated_posts (scheduled_date);
CREATE INDEX IF NOT EXISTS idx_nc_topics_slot ON nc_topics (post_type, day_slot);
CREATE INDEX IF NOT EXISTS idx_nc_prompts_type ON nc_prompts (post_type, focus_type, active);
