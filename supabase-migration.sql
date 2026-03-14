-- ============================================================
-- AgentPark: Paid Event Registration — Database Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Add price columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS price integer DEFAULT 0;
ALTER TABLE events ADD COLUMN IF NOT EXISTS currency text DEFAULT 'AMD';

-- 2. Add payment tracking columns to registrations table
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'free';
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_amount integer DEFAULT 0;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_currency text DEFAULT 'AMD';
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_order_id text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_txn_id text;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS email_sent boolean DEFAULT false;

-- 3. Create payments audit log table
CREATE TABLE IF NOT EXISTS payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  event_id uuid,
  order_id text NOT NULL,
  amount integer NOT NULL,
  currency text DEFAULT 'AMD',
  status text NOT NULL,
  bank_response jsonb,
  created_at timestamptz DEFAULT now()
);

-- 4. Add price_display column: 'hide' (default/free), 'show', 'contact'
ALTER TABLE events ADD COLUMN IF NOT EXISTS price_display text DEFAULT 'hide';

-- 5. Index for faster payment lookups
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_registrations_payment_order_id ON registrations(payment_order_id);
CREATE INDEX IF NOT EXISTS idx_registrations_payment_status ON registrations(payment_status);
