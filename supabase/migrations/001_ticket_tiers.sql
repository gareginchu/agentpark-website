-- Adds ticket_tiers JSONB column to events and ticket_tier_id to registrations,
-- then seeds the Design Thinking Bootcamp event with two visible tracks plus a
-- hidden HackNation scholarship tier (revealed via ?promo=hacknation on event.html).
--
-- Run this in the Supabase SQL Editor. Idempotent: safe to re-run.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS ticket_tiers JSONB;

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS ticket_tier_id TEXT;

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS phone TEXT;

UPDATE events
SET
  title          = 'Design Thinking Bootcamp & Coach Certification — June 22–27, 2026',
  title_am       = 'Design Thinking բութքեմփ և մարզչի սերտիֆիկացում, Հունիսի 22 – 27, 2026',
  date           = '2026-06-22',
  end_date       = '2026-06-27',
  price          = 64500,
  currency       = 'AMD',
  price_display  = 'show',
  ticket_tiers   = '[
    {
      "id": "bootcamp",
      "label_en": "4-Day Design Thinking Bootcamp",
      "label_am": "4-օրյա Design Thinking բութքեմփ",
      "price_amd": 64500,
      "price_display": "€150",
      "dates_text_en": "June 24–27, 2026",
      "dates_text_am": "Հունիսի 24–27, 2026",
      "deadline": "2026-06-10",
      "description_en": "A hands-on innovation training where participants work in teams on real-life challenges and learn how to move from problem understanding to solution concepts and prototypes.",
      "description_am": "Գործնական նորարարական ուսուցում, որտեղ մասնակիցները թիմերով աշխատում են իրական մարտահրավերների վրա և սովորում են անցնել խնդրի ըմբռնումից դեպի լուծման հայեցակարգեր և նախատիպեր:",
      "hidden": false
    },
    {
      "id": "coach",
      "label_en": "Design Thinking Coach Certification",
      "label_am": "Design Thinking մարզչի սերտիֆիկացում",
      "price_amd": 215000,
      "price_display": "€500",
      "dates_text_en": "June 22–27, 2026 + 12 hours online (May 12 – June 14)",
      "dates_text_am": "Հունիսի 22–27, 2026 + 12 ժամ առցանց (Մայիսի 12 – Հունիսի 14)",
      "deadline": "2026-05-10",
      "description_en": "A training and certification track for professionals who want to facilitate Design Thinking workshops, guide teams, and bring structured innovation methods into their organizations.",
      "description_am": "Ուսուցման և սերտիֆիկացման ծրագիր մասնագետների համար, ովքեր ցանկանում են վարել Design Thinking վորքշոփներ, ուղղորդել թիմեր և ներդնել կառուցվածքային նորարարության մեթոդներ իրենց կազմակերպություններում:",
      "hidden": false
    },
    {
      "id": "scholarship",
      "label_en": "4-Day Design Thinking Bootcamp — HackNation Scholarship",
      "label_am": "4-օրյա Design Thinking բութքեմփ — HackNation կրթաթոշակ",
      "price_amd": 6500,
      "price_display": "€15",
      "dates_text_en": "June 24–27, 2026",
      "dates_text_am": "Հունիսի 24–27, 2026",
      "deadline": "2026-06-10",
      "description_en": "Scholarship rate for local winners of the HackNation Global AI Hackathon.",
      "description_am": "Կրթաթոշակային գին HackNation Global AI Hackathon-ի տեղական հաղթողների համար:",
      "hidden": true,
      "promo_code": "hacknation"
    }
  ]'::jsonb
WHERE id = 'ac3cc99a-75f5-49fd-8111-9195b057fd46';
