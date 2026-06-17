-- Enable Row Level Security on all tables.
-- Only the service_role (used by the automation script) should have access.
-- This prevents data exposure if the Supabase anon key is leaked.

-- nc_prompts
ALTER TABLE nc_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON nc_prompts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- nc_topics
ALTER TABLE nc_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON nc_topics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- nc_day_schedule
ALTER TABLE nc_day_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON nc_day_schedule
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- nc_generated_posts
ALTER TABLE nc_generated_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON nc_generated_posts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- nc_cycle_tracker
ALTER TABLE nc_cycle_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON nc_cycle_tracker
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
