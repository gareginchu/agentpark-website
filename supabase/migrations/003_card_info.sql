-- 003_card_info.sql
-- Capture issuer-bank / card metadata returned by ACBA's getOrderStatusExtended.do
-- on each successful charge, so we can answer questions like "which payments came
-- from Armenian-issued cards vs international cards" without hitting ACBA again.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS card_pan_masked  TEXT,   -- e.g. "411111**1111"
  ADD COLUMN IF NOT EXISTS card_brand       TEXT,   -- "visa" | "mastercard" | "amex" | "arca" | "unknown"
  ADD COLUMN IF NOT EXISTS card_country     TEXT,   -- ISO 3166-1 alpha-2 ("AM", "DE", "US") if ACBA returns it
  ADD COLUMN IF NOT EXISTS card_country_name TEXT,  -- human-readable, e.g. "ARMENIA"
  ADD COLUMN IF NOT EXISTS card_bank_name    TEXT;  -- issuer bank, e.g. "ACBA BANK"

-- Index for the most common analytical query: "Armenian vs international".
CREATE INDEX IF NOT EXISTS registrations_card_country_idx
  ON registrations (card_country)
  WHERE card_country IS NOT NULL;
