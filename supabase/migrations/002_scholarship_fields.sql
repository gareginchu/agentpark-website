-- Two columns on `registrations` for the Scholarship Holders tier on the
-- Design Thinking event. When a participant picks that tier they pay a
-- self-determined amount and declare which scholarship they hold + whether
-- it has already been verified by the organizing team.
--
-- Run in Supabase Dashboard → SQL Editor. Idempotent.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS scholarship_name TEXT;

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS scholarship_confirmed BOOLEAN;
