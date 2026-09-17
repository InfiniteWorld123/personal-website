-- The rule the whole business rests on, made structural.
--
--     التقسيط ينتهي. الاشتراك لا ينتهي.
--     The instalment ends. The subscription does not.
--
-- `docs/services/Leistungen-Preise-Verkauf.pdf` §1 calls merging these two
-- "الخطأ الذي يُفلس" — the mistake that bankrupts you — and §11 does the
-- arithmetic: fifteen clients paying 128 €/month look like 1.920 €, but 1.185
-- of that is a build price being paid off. The real recurring figure is 735 €,
-- and 735 € is not enough to live on.
--
-- Migration 0011 gave a deal one `value_cents` and an `is_recurring` flag.
-- That cannot hold a client who pays 490 € once, 79 € for twelve months, and
-- 49 € for ever — and a screen that adds those into one number tells the owner
-- the 1.920 € story. This migration separates them, so the honest figure is
-- the only one the system is able to compute.


-- ─────────────────────────────────────────────────────────────────────────
-- How the build price is paid
-- ─────────────────────────────────────────────────────────────────────────
--
-- The deal keeps `value_cents` as what the build is worth. These columns say
-- how it arrives: all at once, or a setup payment plus twelve instalments.

ALTER TABLE deals
    ADD COLUMN payment_plan text NOT NULL DEFAULT 'CASH',
    -- Paid at signing. 990 € for a cash sale, 490 € when it is spread — and
    -- §3 is explicit that hiding this behind "ab 128 €/Monat" is misleading
    -- advertising and a real legal risk in Germany, so it is its own field
    -- rather than something derived for display.
    ADD COLUMN setup_cents integer,
    -- `Rate` on the invoice. A separate line from day one, never merged with
    -- the operating fee, because month 13 must hold no surprise.
    ADD COLUMN instalment_cents integer,
    ADD COLUMN instalment_months smallint,
    ADD CONSTRAINT deals_payment_plan_check CHECK (payment_plan IN ('CASH', 'INSTALMENT')),
    ADD CONSTRAINT deals_setup_check CHECK (setup_cents IS NULL OR setup_cents >= 0),
    ADD CONSTRAINT deals_instalment_amount_check
        CHECK (instalment_cents IS NULL OR instalment_cents >= 0),
    -- An instalment plan without a figure and a length is not a plan.
    ADD CONSTRAINT deals_instalment_pair_check CHECK (
        payment_plan <> 'INSTALMENT'
        OR (instalment_cents IS NOT NULL AND instalment_months IS NOT NULL AND instalment_months > 0)
    );


-- ─────────────────────────────────────────────────────────────────────────
-- The part that never ends
-- ─────────────────────────────────────────────────────────────────────────
--
-- Its own table, not a column on the deal, because §9 lists five concepts
-- that must never be confused and these are two of them: a deal closes, a
-- subscription runs. A client whose website is paid off still has one; a
-- client with two websites has two.

CREATE TABLE subscriptions (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES leads ("id") ON DELETE CASCADE,
    -- The deal that started it. NULL is legitimate: a site built elsewhere can
    -- be taken over on operations alone.
    deal_id uuid REFERENCES deals ("id") ON DELETE SET NULL,
    tier text NOT NULL,
    -- Stored rather than read from the tier, so a price rise does not silently
    -- rewrite what existing clients are already paying. §11's target is not a
    -- client count — it is that a third of them sit above BASIS.
    base_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'EUR',
    /*
     * The technical surcharges of §6, as [{ "label": "…", "monthlyCents": 3000 }].
     *
     * JSONB rather than a second table: they are always read with the
     * subscription and never queried on their own, and the list is the owner's
     * to extend — a booking system, a login, a Stripe integration — without a
     * migration each time. They are what raises the average, so they are
     * counted into the monthly figure, never shown as a discount on it.
     */
    addons jsonb NOT NULL DEFAULT '[]'::jsonb,
    billing text NOT NULL DEFAULT 'MONTHLY',
    started_on date NOT NULL DEFAULT CURRENT_DATE,
    /*
     * The date the `Rate` line disappears — the start of month 13, which §5
     * calls the most dangerous month in the whole model.
     *
     * Stored on the subscription rather than computed on a screen because two
     * different moments are read off it, and both are silent failures if
     * missed: in month 12 the year-in-advance offer, and in month 13 the one
     * message that is allowed to be sent — "congratulations, the site is
     * yours, the invoice is now 49". Never "do you want to continue?", which
     * §5 calls a cancellation invitation written by hand.
     */
    instalment_ends_on date,
    /** Paid twelve months for the price of ten. Nothing is billed until then. */
    prepaid_until date,
    cancelled_on date,
    cancel_reason text,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT subscriptions_tier_check CHECK (tier IN ('BASIS', 'PLUS', 'WACHSTUM')),
    CONSTRAINT subscriptions_billing_check CHECK (billing IN ('MONTHLY', 'YEARLY_PREPAID')),
    CONSTRAINT subscriptions_base_check CHECK (base_cents >= 0),
    CONSTRAINT subscriptions_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT subscriptions_addons_check CHECK (jsonb_typeof(addons) = 'array'),
    CONSTRAINT subscriptions_cancelled_check
        CHECK (cancelled_on IS NULL OR cancelled_on >= started_on)
);

-- The monthly figure reads every living subscription, on every render of the
-- overview. Partial, because a cancelled one is never in it.
CREATE INDEX subscriptions_live_idx ON subscriptions (lead_id)
    WHERE cancelled_on IS NULL;

-- "Whose instalment ends next month" — the one moment §5 says the offer must
-- be made, and the one month a wrong message costs the client.
CREATE INDEX subscriptions_instalment_idx ON subscriptions (instalment_ends_on)
    WHERE instalment_ends_on IS NOT NULL AND cancelled_on IS NULL;

COMMENT ON TABLE subscriptions IS
    'The recurring half of the business. Never summed with a deal value: a build price paid in instalments is not income that continues.';


-- ─────────────────────────────────────────────────────────────────────────
-- History
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE lead_events DROP CONSTRAINT lead_events_kind_check;
ALTER TABLE lead_events ADD CONSTRAINT lead_events_kind_check CHECK (
    kind IN (
        -- the inbox
        'ARRIVED', 'NOTIFIED', 'OPENED', 'STATUS', 'REPLIED', 'INBOUND',
        'NOTE', 'ARCHIVED', 'UNARCHIVED', 'JUNK', 'NOT_JUNK',
        -- the calls
        'BOOKED', 'CALL_HELD', 'NO_SHOW', 'CANCELLED', 'RESCHEDULED',
        -- the deals
        'CREATED', 'DEAL_OPENED', 'PROPOSAL', 'FOLLOW_UP', 'SNOOZED',
        'VALUE', 'SERVICE', 'WON', 'LOST', 'AUTO_CLOSED', 'REOPENED',
        -- the subscription
        'SUB_STARTED', 'SUB_TIER', 'SUB_ADDON', 'SUB_PREPAID',
        'SUB_INSTALMENT_ENDED', 'SUB_CANCELLED'
    )
);
