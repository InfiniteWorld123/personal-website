-- Every letter leaves from the inbox. 18 Sep 2026.
--
-- B9 shipped with a `Send by email` button that called Resend directly. It
-- worked, and it was the wrong design, for a reason the owner spotted before I
-- did: **the letter never appeared in his own inbox.** He would send a client
-- the one document that matters and then find no trace of it in the
-- conversation with that person. Three months later, "what exactly did I write
-- to him?" had no answer.
--
-- His words: *"I will click, and then it will navigate to inbox."* So the
-- invoice no longer sends anything. It prepares a letter — recipient, subject,
-- body, the frozen PDF as an attachment — and hands it to the composer that
-- already exists, where he reads it, edits it, and sends it like any other
-- letter. It is then recorded in the thread, because that is what the inbox
-- does with everything it sends.
--
-- Two consequences in the schema, and both of them are deletions of things
-- that would otherwise become lies.


-- ─────────────────────────────────────────────────────────────────────────
-- Which invoice a file is
-- ─────────────────────────────────────────────────────────────────────────
--
-- The frozen PDF is copied into the person's files so the composer can attach
-- it the way it attaches anything else. This column is what stops that copy
-- being an anonymous blob: it says which document it is.
--
-- It also answers a question that has no other honest source — **was this
-- invoice actually sent?** Not "did he press a button", but: does an outgoing
-- letter exist carrying this document. `lead_attachments.message_id` is set by
-- `reply()` at the moment the letter is stored, so the fact appears only when
-- the letter really went.
--
-- `ON DELETE SET NULL` rather than CASCADE: an issued invoice is never
-- deleted, but if one ever were, the file he sent a client would still have
-- been sent, and erasing the row would erase that.

ALTER TABLE lead_attachments
    ADD COLUMN invoice_id uuid REFERENCES invoices ("id") ON DELETE SET NULL;

-- At most one **unsent** copy per invoice per person.
--
-- Handing the same invoice to the composer twice — because he went back, or
-- refreshed the page — must find the file already sitting there rather than
-- pile up a second and a third identical PDF for him to choose between.
--
-- `message_id IS NULL` is what makes it "unsent", and it is the whole reason
-- the index is partial: a reminder weeks later attaches the invoice again, and
-- that second letter needs its own copy. `reply()` only ever links a file that
-- is not yet linked, so without a fresh copy the reminder would be recorded
-- carrying nothing — the file would reach the client and the thread would not
-- show it.
CREATE UNIQUE INDEX lead_attachments_invoice_idx
    ON lead_attachments (lead_id, invoice_id)
    WHERE invoice_id IS NOT NULL AND message_id IS NULL;

-- Reading back the other way: which letters carried this invoice.
CREATE INDEX lead_attachments_invoice_sent_idx
    ON lead_attachments (invoice_id)
    WHERE invoice_id IS NOT NULL AND message_id IS NOT NULL;

COMMENT ON COLUMN lead_attachments.invoice_id IS
    'The invoice this file is a copy of. Also the only honest source for "was it sent": an outgoing message carrying this file is proof, a button press is not.';


-- ─────────────────────────────────────────────────────────────────────────
-- Two columns that nothing writes any more
-- ─────────────────────────────────────────────────────────────────────────
--
-- `sent_at` and `reminded_at` were written by the direct-send path that this
-- migration removes. Nothing writes them now, and a column that nothing writes
-- is exactly the dead promise this project keeps deleting — it reads like an
-- answer and is always empty.
--
-- What replaces them is not a column. "Sent" is derived: an outgoing message
-- exists whose attachment carries this invoice. "Reminded" is the same query
-- with the reminder letter. Both are facts about letters that really left,
-- computed where they are read, and neither can drift out of date.
--
-- The `invoices_sent_check` constraint goes with `sent_at`; Postgres drops it
-- in the same step.

ALTER TABLE invoices
    DROP COLUMN sent_at,
    DROP COLUMN reminded_at;
