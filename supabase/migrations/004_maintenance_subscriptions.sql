-- Migration 004: maintenance_subscriptions
-- Records online payments for the dadrian-archive.org annual maintenance agreement.

CREATE TABLE IF NOT EXISTS public.maintenance_subscriptions (
  id                   UUID          PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact
  name                 TEXT          NOT NULL CHECK (length(trim(name)) >= 2),
  email                TEXT          NOT NULL,
  organisation         TEXT          NOT NULL DEFAULT 'Ararat-Eskijian Museum and Research Center',

  -- Plan
  plan                 TEXT          NOT NULL CHECK (plan IN ('monthly', 'annual')),

  -- Payment amounts
  payment_amount_luma  BIGINT        NOT NULL,        -- AMD in luma (AMD × 100)
  payment_amount_usd   NUMERIC(10,2) NOT NULL,        -- USD amount, for reference
  payment_currency     TEXT          NOT NULL DEFAULT '051',  -- AMD ISO 4217 numeric

  -- ACBA gateway state
  payment_status       TEXT          NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','failed','declined','amount_mismatch')),
  payment_order_id     TEXT          UNIQUE,          -- ACBA orderId (set after register.do)
  payment_txn_id       TEXT,                          -- auth reference / RRN

  -- Card metadata (populated by payment-callback after successful payment)
  card_pan_masked      TEXT,
  card_brand           TEXT,
  card_country         TEXT,
  card_country_name    TEXT,
  card_bank_name       TEXT,

  paid_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Fast lookup by ACBA orderId (used by payment-callback)
CREATE INDEX IF NOT EXISTS maintenance_subscriptions_order_id_idx
  ON public.maintenance_subscriptions (payment_order_id);

-- Fast lookup by email (useful for admin queries)
CREATE INDEX IF NOT EXISTS maintenance_subscriptions_email_idx
  ON public.maintenance_subscriptions (email);

-- RLS: no public access; only the service role (Edge Functions) may read/write.
ALTER TABLE public.maintenance_subscriptions ENABLE ROW LEVEL SECURITY;
-- No policies added — service role bypasses RLS by design.
