-- B10 — the paper a subscription has been missing. 20 Sep 2026.
--
-- A subscription is an arrangement, not a document: `0020` gave it a client,
-- an amount and a day of the month, and its paper was the monthly invoices
-- underneath it. That is right for the *billing* and wrong for the moment the
-- arrangement begins, which had no paper at all.
--
-- His words: "when I add a subscription then I would like to see it as a pdf
-- paper that I can send to the client". What he is describing is the document
-- every recurring arrangement starts with — what is agreed, how much, from
-- which month, and how either side stops it.
--
-- It is deliberately **not** an invoice:
--
--   * It takes no number from the gapless series. `§14` numbering exists so
--     that documents demanding money are continuous; a page that demands
--     nothing must never consume one.
--   * It is drawn fresh each time rather than frozen into the bucket. An
--     invoice is frozen because what was sent is a legal fact; an agreement
--     describes the arrangement *as it stands*, and the copy the client holds
--     is the attachment on the letter that carried it — which is stored, and
--     is the record.
--   * Nothing about it is a Dauerrechnung. That would be a standing invoice
--     replacing the monthly ones, and running both would bill every month
--     twice. The paper says so in a sentence, in both languages.
--
-- The one thing the database has to learn is which file is a copy of which
-- subscription, and that is the column below.


-- ─────────────────────────────────────────────────────────────────────────
-- The file, and the arrangement it is a copy of
-- ─────────────────────────────────────────────────────────────────────────
--
-- `ON DELETE SET NULL`, exactly as `0018` did for `invoice_id`, and for the
-- same reason: a subscription that has written no invoices may still be
-- deleted, and if the agreement had already gone to a client then it went —
-- erasing the row would erase that fact while the letter stays in the thread.

ALTER TABLE lead_attachments
    ADD COLUMN subscription_id uuid REFERENCES subscriptions ("id") ON DELETE SET NULL;

-- At most one **unsent** copy per subscription per person.
--
-- The same shape as `lead_attachments_invoice_idx` and the same argument:
-- pressing "Write the letter" twice, going back, or refreshing the composer
-- must find the file already sitting there rather than pile up identical PDFs
-- for him to choose between.
--
-- Partial on `message_id IS NULL` because that is what makes a copy "unsent".
-- Sending the agreement again after a price change needs its own copy, and it
-- is a different copy: the paper is redrawn from what the arrangement says
-- today, so the second letter genuinely carries different bytes.
CREATE UNIQUE INDEX lead_attachments_subscription_idx
    ON lead_attachments (lead_id, subscription_id)
    WHERE subscription_id IS NOT NULL AND message_id IS NULL;

-- A file may be a copy of an invoice or of a subscription, never of both.
-- Nothing in the application can do it; this is the constraint that keeps it
-- true for anything that reaches the table another way.
ALTER TABLE lead_attachments
    ADD CONSTRAINT lead_attachments_one_source_check
        CHECK (invoice_id IS NULL OR subscription_id IS NULL);

COMMENT ON COLUMN lead_attachments.subscription_id IS
    'The subscription this file is the agreement for. Not an invoice: it takes no number and demands no money.';
