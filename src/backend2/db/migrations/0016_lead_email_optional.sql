-- Leads: email becomes optional (owner decision, 26 Nov 2026).
--
-- Local businesses found on Google Maps often have a phone number but no
-- email address. A Lead may now be saved with an empty email; one that is
-- given must still be a valid address (enforced by the shared contract).
-- `email_key` stays a generated column: an empty email has an empty key,
-- which duplicate checks ignore.
--
-- Clients keep their required email: a Lead without one needs its email
-- added before it is won as a new Client.

ALTER TABLE v2_leads DROP CONSTRAINT v2_leads_email_check;
