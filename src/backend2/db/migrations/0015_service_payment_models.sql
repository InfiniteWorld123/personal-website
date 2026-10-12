-- Services V2: the instalment and rent payment models. See docs/v2/services.md.
--
-- A fixed-price package can also be offered in instalments or rented. These
-- are catalogue presentation, like every other price here: nothing charges
-- anyone, and nothing starts a subscription. The public `/services` page shows
-- a package under "Buy", "Instalments" and "Rent" tabs, and each tab reads one
-- of these.
--
-- The columns sit on `v2_service_versions`, beside the price they belong to,
-- so they follow the same rule as the price: a save writes the draft, and only
-- **Publish** / **Publish update** copies them to the version visitors read.
--
--   * `*_monthly_cents` is euro cents, like `price_amount_cents`. NULL means
--     "this package is not offered in that model".
--   * `instalment_months` is how many monthly payments the price is split into.
--     The total a visitor sees is computed from it, never stored.
--   * `rent_min_term_months` is the minimum rental term; after it the rental
--     can be cancelled monthly.
--
-- Both counts have a default of 12, so a package that only sets a monthly
-- amount already has a sensible term.
--
-- No rule ties these to `price_mode` in the database: a package that is later
-- changed to "starting from" keeps its stored plans untouched, and the public
-- projection simply does not offer them (they apply to a fixed, one-time
-- price). Losing a typed amount because a radio button was clicked would be the
-- worse behaviour.
--
-- Structure only. No rows are changed: the two live packages get their values
-- from the owner (Dashboard -> Services) or from `bun run db2:services:seed-plans`.

ALTER TABLE v2_service_versions
    ADD COLUMN instalment_monthly_cents integer,
    ADD COLUMN instalment_months        integer NOT NULL DEFAULT 12,
    ADD COLUMN rent_monthly_cents       integer,
    ADD COLUMN rent_min_term_months     integer NOT NULL DEFAULT 12;

ALTER TABLE v2_service_versions
    ADD CONSTRAINT v2_service_versions_instalment_amount_check
        CHECK (instalment_monthly_cents IS NULL OR instalment_monthly_cents BETWEEN 1 AND 99999999),
    ADD CONSTRAINT v2_service_versions_rent_amount_check
        CHECK (rent_monthly_cents IS NULL OR rent_monthly_cents BETWEEN 1 AND 99999999),
    ADD CONSTRAINT v2_service_versions_instalment_months_check
        CHECK (instalment_months BETWEEN 2 AND 60),
    ADD CONSTRAINT v2_service_versions_rent_term_check
        CHECK (rent_min_term_months BETWEEN 1 AND 60);
