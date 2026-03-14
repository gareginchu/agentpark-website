-- ============================================================
-- AgentPark: Supabase Auth & Secure RLS Migration
-- Run this in Supabase SQL Editor AFTER creating your admin
-- user via Supabase Dashboard > Authentication > Add User
-- ============================================================

-- 1. Drop the old permissive policies on events (admin-only write ops)
DROP POLICY IF EXISTS "Public insert events" ON events;
DROP POLICY IF EXISTS "Public update events" ON events;
DROP POLICY IF EXISTS "Public delete events" ON events;

-- 2. Create auth-gated policies for events (admin = any authenticated user)
CREATE POLICY "Auth insert events" ON events
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Auth update events" ON events
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Auth delete events" ON events
  FOR DELETE USING (auth.role() = 'authenticated');

-- Public read stays as-is: "Public read events"

-- 3. Tighten registrations — admin can read & delete, public can insert
DROP POLICY IF EXISTS "Public read registrations" ON registrations;
DROP POLICY IF EXISTS "Public delete registrations" ON registrations;

CREATE POLICY "Auth read registrations" ON registrations
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Auth delete registrations" ON registrations
  FOR DELETE USING (auth.role() = 'authenticated');

-- Public insert stays: "Public insert registrations"

-- 4. Secure payments table
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read payments" ON payments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service insert payments" ON payments
  FOR INSERT WITH CHECK (true);

-- 5. Secure page_views table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'page_views') THEN
    EXECUTE 'ALTER TABLE page_views ENABLE ROW LEVEL SECURITY';
    EXECUTE 'CREATE POLICY "Public insert page_views" ON page_views FOR INSERT WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Public update page_views" ON page_views FOR UPDATE USING (true)';
    EXECUTE 'CREATE POLICY "Auth read page_views" ON page_views FOR SELECT USING (auth.role() = ''authenticated'')';
  END IF;
END $$;

-- ============================================================
-- SETUP INSTRUCTIONS:
-- 1. Go to Supabase Dashboard > Authentication > Users > Add User
-- 2. Create your admin user with email + password
--    (e.g., admin@agentpark.am / your-secure-password)
-- 3. Run this SQL migration
-- 4. Login to /admin.html with your new email + password
-- ============================================================
