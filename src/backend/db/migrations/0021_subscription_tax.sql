-- The rate a subscription bills at. 20 Sep 2026.
--
-- `0020` wrote `tax_rate = 0` into the generator as a literal. That is correct
-- today and only today: he is a `Kleinunternehmer` under `§19` and charges no
-- VAT, and `issueInvoice` refuses any invoice that does otherwise.
--
-- It is the day **after** that which this column exists for. The moment he
-- crosses the threshold, `smallBusiness` goes false and every manual invoice
-- gets a rate typed into a form — but a subscription would keep quietly
-- billing 0 %, for ever, with nothing on any screen to say so. He would find
-- out from a Steuerberater, months of invoices later, and every one of those
-- invoices would be a document he already sent.
--
-- `0016` made this exact argument about `invoice_lines.tax_rate`:
--
--     "It is a column rather than a constant because the day he crosses the
--      threshold, adding VAT must be a value in a form — not a migration over
--      rows that were correct when they were issued."
--
-- A rate hidden inside a generator is worse than a constant, because nothing
-- displays it. So it becomes a value on the row, visible in the form, zero by
-- default, and carried onto the line the generator writes.

ALTER TABLE subscriptions
    ADD COLUMN tax_rate numeric(5, 2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT subscriptions_tax_check CHECK (tax_rate >= 0 AND tax_rate <= 100);

COMMENT ON COLUMN subscriptions.tax_rate IS
    'The rate this subscription bills at, carried onto every line it generates. Zero while §19 applies; a value in a form the day it does not, rather than a literal buried in the generator.';
