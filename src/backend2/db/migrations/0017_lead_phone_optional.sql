-- Leads: phone becomes optional too (owner decision, 26 Nov 2026).
--
-- Some places on Google Maps show no phone number. A Lead may now be saved
-- with an empty phone; one that is given must still look like a phone number
-- (enforced by the shared contract). `phone_key` is then empty, and duplicate
-- checks ignore empty keys.

ALTER TABLE v2_leads DROP CONSTRAINT v2_leads_phone_check;
