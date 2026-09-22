-- Services V2. See docs/v2/services.md.
--
-- The owner's catalogue of what they offer: independent records, any number of
-- them, no categories and no fixed three. Nothing here points at Leads,
-- Invoices, Booking or Media, and nothing there points here — the spec keeps
-- the catalogue separate on purpose, so a later price change can never rewrite
-- a business record that quoted the old one.
--
-- The shape follows Projects (0001), for the same reason Projects has it:
--
--   * `v2_services` is the identity — an id, a place in the one manual order,
--     and two pointers. It holds nothing a visitor can read.
--   * `v2_service_versions` holds at most two versions per service: the
--     private draft the owner edits, and the frozen copy visitors read. Saving
--     writes the draft; only **Publish** / **Publish update** writes the other.
--     A public query joins `published_version_id` and nothing else, so an
--     unfinished sentence or an unapproved price cannot reach the site because
--     somebody forgot a WHERE.
--   * `v2_service_texts` is one row per version per language.
--   * `v2_service_slugs` remembers every address a service was published
--     under, so changing one later keeps the old link working (it redirects).
--
-- Numbered 0005 because 0004 is the highest that exists. The runner sorts by
-- filename, so a lower number would run out of order on a new database and
-- never at all on one that has already recorded the name.
--
-- Structure only. No rows: V2 starts with an empty catalogue, which the owner
-- fills by hand. The PDFs and the current public page are references, not an
-- import.


CREATE TABLE v2_services (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- The one global manual order, 1-based and dense. It covers every service,
    -- published or not; the public list is the same order filtered, which is
    -- what makes a move on Dashboard page 3 land where the owner meant it.
    position                 integer NOT NULL,
    draft_version_id         uuid,
    published_version_id     uuid,
    -- Increments on every save that changes the draft. A stale value from a
    -- second browser tab is refused rather than allowed to overwrite.
    draft_revision           integer NOT NULL DEFAULT 1,
    -- Which draft revision the live version equals. "Live, with unpublished
    -- changes" is then one integer comparison, in a list, without loading
    -- every version to compare them field by field.
    published_draft_revision integer,
    -- Kept when a service is taken down, so the dashboard can say "you took
    -- this down" rather than "this is new".
    first_published_at       timestamptz,
    published_at             timestamptz,
    created_at               timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at               timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_services_position_check CHECK (position > 0),
    CONSTRAINT v2_services_revision_check CHECK (draft_revision > 0),
    -- Deferred so a renumbering may collide with itself halfway through and be
    -- checked once, at COMMIT.
    CONSTRAINT v2_services_position_unique UNIQUE (position) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE v2_service_versions (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id             uuid NOT NULL REFERENCES v2_services (id) ON DELETE CASCADE,
    kind                   text NOT NULL,
    -- One address for all three languages. Empty is a perfectly good draft.
    slug                   text NOT NULL DEFAULT '',
    -- The homepage star. Part of the version, because the spec puts it under
    -- the same rule as everything else a visitor sees: starring a live service
    -- changes the homepage only on **Publish update**.
    featured               boolean NOT NULL DEFAULT false,
    -- Catalogue presentation, not billing. Nothing charges anyone.
    -- NULL means the owner has not chosen yet, which a draft may be.
    price_mode             text,
    -- Euro cents, so 49.90 € per month is exact.
    price_amount_cents     integer,
    price_period           text,
    -- Switched on and off by hand. No start date, no end date, no code.
    promotion_active       boolean NOT NULL DEFAULT false,
    promotion_amount_cents integer,
    created_at             timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_service_versions_kind_check CHECK (kind IN ('draft', 'published')),
    CONSTRAINT v2_service_versions_slug_check
        CHECK (slug = '' OR (length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
    CONSTRAINT v2_service_versions_mode_check
        CHECK (price_mode IS NULL OR price_mode IN ('fixed', 'from', 'quote')),
    CONSTRAINT v2_service_versions_period_check
        CHECK (price_period IS NULL OR price_period IN ('one_time', 'monthly', 'yearly')),
    CONSTRAINT v2_service_versions_amount_check
        CHECK (price_amount_cents IS NULL OR price_amount_cents BETWEEN 1 AND 99999999),
    CONSTRAINT v2_service_versions_promotion_amount_check
        CHECK (promotion_amount_cents IS NULL OR promotion_amount_cents BETWEEN 1 AND 99999999),
    -- The live price, enforced by the database as well as by the service.
    --
    -- A draft may be anything the owner is halfway through. A published
    -- version may not: it has an address and a price mode; "on request" has no
    -- number and no offer; a fixed or starting-from price has an amount and a
    -- period; and an offer that is switched on is lower than the price it
    -- replaces. If a future code path ever forgot the publication rules, the
    -- write would fail here instead of putting a wrong price on the site.
    CONSTRAINT v2_service_versions_published_check CHECK (
        kind = 'draft'
        OR (
            slug <> ''
            AND (
                (price_mode = 'quote'
                    AND price_amount_cents IS NULL
                    AND price_period IS NULL
                    AND promotion_active = false
                    AND promotion_amount_cents IS NULL)
                OR (price_mode IN ('fixed', 'from')
                    AND price_amount_cents IS NOT NULL
                    AND price_period IS NOT NULL
                    AND (promotion_active = false
                        OR (promotion_amount_cents IS NOT NULL
                            AND promotion_amount_cents < price_amount_cents)))
            )
        )
    )
);

CREATE UNIQUE INDEX v2_service_versions_one_per_kind ON v2_service_versions (service_id, kind);

CREATE TABLE v2_service_texts (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id       uuid NOT NULL REFERENCES v2_service_versions (id) ON DELETE CASCADE,
    language         text NOT NULL,
    name             text NOT NULL DEFAULT '',
    -- The short description on a card and in search results.
    summary          text NOT NULL DEFAULT '',
    -- What is included, one entry per line on the page.
    included         text[] NOT NULL DEFAULT '{}',
    -- Optional longer copy. Plain text: no rich-text editor in this module.
    body             text NOT NULL DEFAULT '',
    -- The offer's short label ("Launch offer"). Shown only while the offer is on.
    promotion_label  text NOT NULL DEFAULT '',
    -- Optional overrides. Empty means the name and the short description are
    -- used. There is deliberately no canonical field: that is generated.
    seo_title        text NOT NULL DEFAULT '',
    seo_description  text NOT NULL DEFAULT '',
    CONSTRAINT v2_service_texts_language_check CHECK (language IN ('de', 'en', 'ar')),
    CONSTRAINT v2_service_texts_unique UNIQUE (version_id, language)
);

-- Every address a service has been published under. A retired one keeps
-- resolving (the public API names the current one, and the website redirects),
-- and no other service can take it over while this service exists.
CREATE TABLE v2_service_slugs (
    slug        text PRIMARY KEY,
    service_id  uuid NOT NULL REFERENCES v2_services (id) ON DELETE CASCADE,
    is_current  boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT v2_service_slugs_slug_check
        CHECK (length(slug) <= 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- At most one current address per service.
CREATE UNIQUE INDEX v2_service_slugs_current_idx ON v2_service_slugs (service_id) WHERE is_current;

-- The two pointers from a service to its versions. The tables point at each
-- other, so these are deferrable: a service row is written before the draft it
-- names, and the pair is checked once at COMMIT.
ALTER TABLE v2_services
    ADD CONSTRAINT v2_services_draft_fk FOREIGN KEY (draft_version_id)
        REFERENCES v2_service_versions (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE v2_services
    ADD CONSTRAINT v2_services_published_fk FOREIGN KEY (published_version_id)
        REFERENCES v2_service_versions (id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

-- The public list: published services, in the owner's order.
CREATE INDEX v2_services_public_order_idx ON v2_services (position)
    WHERE published_version_id IS NOT NULL;
