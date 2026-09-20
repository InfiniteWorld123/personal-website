-- Money that does not stop. 20 Sep 2026.
--
--     التقسيط ينتهي. الاشتراك لا ينتهي.
--
-- This is the second time this table has been written. `0012` modelled the
-- whole of `docs/services/` — tiers, add-ons, yearly prepayment, the
-- instalment that ends in month 13 — and `0013` deleted it eleven days later
-- at his instruction, because his prices were still moving and he had no
-- clients. That was the right call, and the reasoning has not changed.
--
-- So this is deliberately **not** that table. There is no tier, no add-on and
-- no instalment schedule here, because every one of them assumes a price list
-- he has not settled. What is here is the smallest thing that answers the
-- question he actually asked on 20 Sep:
--
--     a client, an amount, and a day of the month.
--
-- «INFINITE WOLD pays 49 € on the 1st.» That is the whole model. Tiers can be
-- built on top the day the prices stop moving; nothing below has to change to
-- allow it, and nothing below pretends it already happened.


CREATE TABLE subscriptions (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

    -- RESTRICT, like `invoices.client_id`: removing a client who is still
    -- being billed every month has to be a deliberate act, not a side effect.
    client_id uuid NOT NULL REFERENCES clients ("id") ON DELETE RESTRICT,

    -- The fixed half of the line. The month is appended when the invoice is
    -- drawn — his answer, 20 Sep — so "Website-Betreuung" is typed once and
    -- "Website-Betreuung · Oktober 2026" is what the client reads.
    description text NOT NULL,

    amount_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'EUR',

    /*
     * Which day of the month it bills, 1 to 28.
     *
     * Not 1 to 31, and the ceiling is the point. A subscription set to the
     * 31st has no 31st in February, and every system that allows it then has
     * to invent a rule — bill early, bill late, skip the month — that nobody
     * remembers choosing and that silently shifts a client's billing date
     * forever. Twenty-eight exists in every month of every year, so there is
     * no rule to invent and no month that behaves differently from the rest.
     */
    billing_day smallint NOT NULL,

    started_on date NOT NULL DEFAULT CURRENT_DATE,

    /*
     * The next month this owes an invoice for, as its first day.
     *
     * Stored rather than computed from `started_on` and the calendar, because
     * catching up has to be possible: if he does not open the admin for three
     * months, three invoices are owed, and a date that moves forward one
     * period at a time is what lets the generator walk them in order without
     * guessing which were already written.
     *
     * Always the first of a month. `billing_day` decides the *due* date on the
     * paper; this decides which month is being billed.
     */
    next_period date NOT NULL,

    -- Set when he stops billing them. The row is never deleted: the invoices
    -- it produced point back at it, and a client's history should not vanish
    -- because the arrangement ended.
    cancelled_on date,

    note text NOT NULL DEFAULT '',

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT subscriptions_description_check CHECK (btrim(description) <> ''),
    CONSTRAINT subscriptions_amount_check CHECK (amount_cents > 0),
    CONSTRAINT subscriptions_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT subscriptions_day_check CHECK (billing_day BETWEEN 1 AND 28),
    -- The stored period must actually be a month, not a day inside one.
    CONSTRAINT subscriptions_period_check CHECK (next_period = date_trunc('month', next_period)),
    CONSTRAINT subscriptions_cancelled_check
        CHECK (cancelled_on IS NULL OR cancelled_on >= started_on)
);

-- "What is due today" — the only query the generator runs. Partial, because a
-- cancelled subscription is never due again.
CREATE INDEX subscriptions_due_idx ON subscriptions (next_period)
    WHERE cancelled_on IS NULL;

CREATE INDEX subscriptions_client_idx ON subscriptions (client_id);

COMMENT ON TABLE subscriptions IS
    'A client, an amount, and a day of the month. Deliberately not the tier model of 0012: that assumed a price list he has not settled.';


-- ─────────────────────────────────────────────────────────────────────────
-- Which subscription an invoice came out of, and for which month
-- ─────────────────────────────────────────────────────────────────────────
--
-- These two columns are the reason a month cannot be billed twice.
--
-- The generator could have relied on moving `next_period` forward and trusted
-- itself never to run twice over the same row. It would be wrong eventually:
-- two requests arriving together, a retry after a timeout, a catch-up loop
-- that throws halfway. Every one of those ends in a client receiving the same
-- month's invoice twice, which is the kind of mistake that costs trust rather
-- than money.
--
-- The unique index below makes it impossible instead of unlikely. The second
-- insert for a month violates a constraint and the transaction rolls back,
-- whatever the generator believed.

ALTER TABLE invoices
    ADD COLUMN subscription_id uuid REFERENCES subscriptions ("id") ON DELETE SET NULL,
    -- The month being billed, as its first day. Null on every invoice he
    -- writes by hand.
    ADD COLUMN period_start date,
    ADD CONSTRAINT invoices_period_start_check
        CHECK (period_start IS NULL OR period_start = date_trunc('month', period_start)),
    -- Both or neither: a period without a subscription is a date nothing reads.
    ADD CONSTRAINT invoices_subscription_pair_check
        CHECK ((subscription_id IS NULL) = (period_start IS NULL));

-- One invoice per subscription per month. The whole guarantee, in one line.
CREATE UNIQUE INDEX invoices_subscription_period_idx
    ON invoices (subscription_id, period_start)
    WHERE subscription_id IS NOT NULL;

COMMENT ON COLUMN invoices.period_start IS
    'The month this subscription invoice bills. With subscription_id it is UNIQUE, so no month can be billed twice however often the generator runs.';
