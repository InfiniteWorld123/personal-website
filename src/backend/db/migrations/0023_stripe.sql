-- Paying an invoice by card. 20 Sep 2026.
--
-- He asked for Stripe and looked at two alternatives first: Polar, and the
-- Better Auth Stripe plugin. Both were refused for the same reason, and it is
-- worth writing down because the reason is about this system rather than about
-- them.
--
-- **Polar** is a Merchant of Record — in their own words, "the reseller of
-- your product". The client would buy from Polar, and **Polar** would issue
-- the invoice. He has an invoicing system with a gapless number series, frozen
-- PDFs and §14 on every page; a second invoice from a reseller for the same
-- money would make his the one with no standing.
--
-- **The Better Auth plugin** needs user accounts, does subscriptions only, and
-- brings its own `subscription` table. His clients have no accounts — they
-- receive letters — and `0022` had just finished making the word
-- "subscription" mean one thing.
--
-- So: Stripe's API directly, for exactly one job. He stays the seller, his
-- invoice stays the document, and Stripe only carries the money and reports
-- that it arrived.


-- ─────────────────────────────────────────────────────────────────────────
-- The link that belongs to one invoice
-- ─────────────────────────────────────────────────────────────────────────
--
-- A Stripe **Payment Link**, not a Checkout Session. A session expires within
-- a day, and an invoice is due in fourteen — a client who pays on the twelfth
-- would find a dead page and no way to say so. A payment link does not expire.
--
-- Written at issue, beside the frozen PDF, and for the same reason: the paper
-- carries this URL, so the URL has to be as permanent as the paper.

ALTER TABLE invoices
    ADD COLUMN pay_url text,
    -- Stripe's own id for the link. Kept so it can be deactivated when the
    -- invoice is cancelled — a link that still takes money for a voided
    -- document is the worst thing in this file.
    ADD COLUMN pay_link_id text,
    ADD CONSTRAINT invoices_pay_pair_check
        CHECK ((pay_url IS NULL) = (pay_link_id IS NULL)),
    -- A draft has no link, the way it has no number and no file.
    ADD CONSTRAINT invoices_pay_draft_check
        CHECK (status <> 'DRAFT' OR pay_url IS NULL);

COMMENT ON COLUMN invoices.pay_url IS
    'The Stripe payment link printed on this invoice. A link rather than a session: a session dies within a day and an invoice is due in fourteen.';


-- ─────────────────────────────────────────────────────────────────────────
-- Money that arrived twice, counted once
-- ─────────────────────────────────────────────────────────────────────────
--
-- Stripe will send the same event more than once. Every payment provider does,
-- eventually — a retry after a slow response, a replay after an outage — and
-- the documented contract is that receivers must be idempotent rather than
-- that senders will be careful.
--
-- Without this column, a repeated webhook writes a second `payments` row, the
-- invoice reads as overpaid, and he goes looking for a transfer that never
-- happened.
--
-- The unique index is the guarantee. Not the handler's care: a handler can be
-- rewritten, and a constraint refuses whatever the code believes. `NULL` for
-- every payment he types in himself, and partial so those are unaffected.

ALTER TABLE payments
    ADD COLUMN external_id text;

CREATE UNIQUE INDEX payments_external_idx ON payments (external_id)
    WHERE external_id IS NOT NULL;

COMMENT ON COLUMN payments.external_id IS
    'Stripe''s id for the payment this row records. UNIQUE, so a webhook delivered twice cannot be booked twice — the constraint decides that, not the handler.';
