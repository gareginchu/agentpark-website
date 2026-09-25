-- Migration 005: add 'catchup' as a valid plan in maintenance_subscriptions
-- Needed to collect back-payment for May–Sep 2026 (5 months × $350 = $1,750).

ALTER TABLE public.maintenance_subscriptions
  DROP CONSTRAINT IF EXISTS maintenance_subscriptions_plan_check;

ALTER TABLE public.maintenance_subscriptions
  ADD CONSTRAINT maintenance_subscriptions_plan_check
  CHECK (plan IN ('monthly', 'annual', 'catchup'));
