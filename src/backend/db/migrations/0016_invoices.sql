-- B9 — invoicing. 18 Sep 2026.
--
-- The shape below is the one `docs/data-model.md` has carried since B0. It is
-- built now, unchanged in its invariants, because those invariants are not
-- design taste — they are what makes a row still true a year after it was
-- written. What the owner decided in the lab is written beside each column it
-- touched, so the next reader does not have to guess which lines are law and
-- which are his preference.
--
-- Two rules run through the whole file:
--
--   1. **The two kinds of money never meet.** `docs/services/*.pdf` calls
--      merging them «الخطأ الذي يُفلس», and a screen that summed a project fee
--      into a monthly fee is what made him delete the lead system twice. Here
--      the separation is `invoices.money_kind`, and every figure the admin
--      shows is filtered by it. A build invoice and a subscription invoice are
--      never the same piece of paper — his answer, question 12.
--
--   2. **An issued invoice is a fact, not a record.** It gets a number, a
--      frozen PDF and a lock, and it is corrected only by a second document
--      that points back at it. This is `GoBD`, not an opinion, and the checks
--      at the bottom of each table are there so no future service can talk its
--      way around it.
--
-- Deliberately **not** here: quotes. He was shown the mechanism, tried it in
-- the lab, and turned all three offer switches off. The `PROPOSAL` stage on a
-- deal stays a conversation, not a document. There is no `kind = 'OFFER'`
-- waiting quietly for someone to switch on — a column nothing writes is the
-- kind of dead promise this project keeps deleting.


-- ─────────────────────────────────────────────────────────────────────────
-- The client
-- ─────────────────────────────────────────────────────────────────────────
--
-- His answer to question 6, option B: a table of its own, not billing columns
-- bolted onto `leads`.
--
-- The reason is that they answer different questions. A `leads` row is anyone
-- who wrote — a baker, a hosting provider's billing robot, a stranger. It
-- holds a name and a mailbox because that is all a letter carries. An invoice
-- needs a postal address, a legal company name and, one day, a VAT id; none of
-- those mean anything on somebody who sent one question and vanished.
--
-- `lead_id` keeps the thread back to the conversation without forcing it: a
-- client may be created from an inbox conversation, or typed in from nothing,
-- and `ON DELETE SET NULL` means clearing the inbox never touches the books.

CREATE TABLE clients (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid REFERENCES leads ("id") ON DELETE SET NULL,

    -- Either may be empty, never both — a sole trader has no company name, and
    -- a company's invoice may name no person at all. The check at the bottom
    -- is what stops a nameless client existing.
    company text NOT NULL DEFAULT '',
    contact_name text NOT NULL DEFAULT '',

    email text NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',

    -- `§14 UStG` requires the recipient's full address on the invoice, so these
    -- are not optional decoration. Two street lines because "c/o" and
    -- "Gebäude B" exist and belong above the postcode, not inside it.
    street text NOT NULL DEFAULT '',
    street_extra text NOT NULL DEFAULT '',
    postcode text NOT NULL DEFAULT '',
    city text NOT NULL DEFAULT '',

    -- His answer to question 7: the field exists, the logic does not. Most
    -- clients will be German; the day one is not, the address already prints
    -- correctly and only the tax treatment is a new decision.
    country text NOT NULL DEFAULT 'DE',

    -- `USt-IdNr`. Empty for every client he has today. It is here rather than
    -- added later because printing it is one line of the PDF and migrating a
    -- live `clients` table is not.
    vat_id text NOT NULL DEFAULT '',

    -- Which language his paper speaks to *this* client. Set once on the client
    -- so he never picks it again per invoice, overridable per invoice.
    language text NOT NULL DEFAULT 'de',

    notes text NOT NULL DEFAULT '',

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT clients_named_check
        CHECK (btrim(company) <> '' OR btrim(contact_name) <> ''),
    CONSTRAINT clients_country_check CHECK (country ~ '^[A-Z]{2}$'),
    CONSTRAINT clients_language_check CHECK (language IN ('de', 'en'))
);

CREATE INDEX clients_name_idx ON clients (lower(company), lower(contact_name));
CREATE INDEX clients_lead_idx ON clients (lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON TABLE clients IS
    'Someone he actually bills. Not everyone who wrote to him — that is a lead.';


-- ─────────────────────────────────────────────────────────────────────────
-- Invoice numbers
-- ─────────────────────────────────────────────────────────────────────────
--
-- One row per year, holding the next number to hand out.
--
-- A sequence would be simpler and is wrong here: `nextval` is deliberately
-- non-transactional, so a rolled-back insert burns a number and leaves a hole
-- in the series. A hole is a question at an audit — "what was 2026-007, and
-- why did you delete it?" — and the honest answer, "nothing, the software did
-- that", is not one he should ever have to give.
--
-- The allocation is a single statement (see `invoice.service.ts`), so the
-- number and the invoice that carries it are written or neither is.

CREATE TABLE invoice_numbers (
    year integer NOT NULL PRIMARY KEY,
    next integer NOT NULL DEFAULT 1,
    CONSTRAINT invoice_numbers_next_check CHECK (next >= 1)
);

COMMENT ON TABLE invoice_numbers IS
    'The next invoice number for each year. Gapless by construction: a number is only handed out by the same statement that writes it onto an invoice.';


-- ─────────────────────────────────────────────────────────────────────────
-- The invoice
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE invoices (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),

    -- RESTRICT, not CASCADE: deleting a client must never quietly delete the
    -- invoices he sent them. If he wants the client gone, the books have to be
    -- dealt with first — deliberately, by him.
    client_id uuid NOT NULL REFERENCES clients ("id") ON DELETE RESTRICT,

    -- The deal this came out of, when it came out of one. Optional because he
    -- asked for both doors (question 3): a won deal fills the form, and a free
    -- invoice needs no deal at all.
    deal_id uuid REFERENCES deals ("id") ON DELETE SET NULL,

    -- **NULL while it is a draft.** His answer, switch 21: the number is
    -- reserved at the moment of issue, not when the form opens. A draft that
    -- gets abandoned then costs nothing, where a number handed out at `New`
    -- would leave exactly the gap `invoice_numbers` exists to prevent.
    number text UNIQUE,
    -- Kept beside the number so "this year's invoices" is an index hit rather
    -- than a string operation on every row.
    number_year integer,

    -- INVOICE is the ordinary document. CANCELLATION voids one completely
    -- (`Storno`); CREDIT_NOTE gives part of it back (`Gutschrift`). He asked
    -- for both, from day one — question 4.
    kind text NOT NULL DEFAULT 'INVOICE',
    -- What a cancellation or credit note points back at. An issued invoice is
    -- append-only, so this reference *is* the correction mechanism; there is
    -- no path in the code that edits an issued row's money.
    corrects_id uuid REFERENCES invoices ("id") ON DELETE RESTRICT,

    -- DRAFT: still his, still editable, has no number and no file.
    -- ISSUED: numbered, frozen, locked (switch 20).
    -- CANCELLED: an issued invoice that a CANCELLATION now voids. It keeps its
    --   number and its file. It is never deleted, and it never counts.
    status text NOT NULL DEFAULT 'DRAFT',

    -- Question 8: German or English, chosen per document, defaulted from the
    -- client. Stored on the invoice because the PDF was written in one of them
    -- and must never be re-rendered in the other.
    language text NOT NULL DEFAULT 'de',

    -- **The rule the whole business rests on.** BUILD money is paid once and
    -- ends; SUBSCRIPTION money does not stop. They are two documents, never
    -- two lines on one — his answer to question 12 — and this column is what
    -- lets every figure in the admin stay on one side of that line.
    money_kind text NOT NULL DEFAULT 'BUILD',

    issued_on date,
    due_on date,

    -- The payment term he chose, carried on the draft until it is used.
    --
    -- A due *date* cannot live on a draft: it is fourteen days from the day
    -- the invoice is actually issued, and a date typed in on Monday is already
    -- wrong by Thursday. So the term is stored as a number of days, and
    -- `due_on` is computed from it inside the statement that issues.
    due_days integer NOT NULL DEFAULT 14,

    -- The period the work covers. Required on the paper once by `§14 UStG`;
    -- printed in the header, not on every line — he turned that switch off.
    service_from date,
    service_to date,

    currency text NOT NULL DEFAULT 'EUR',

    -- Totals are **stored**, not derived, from the moment of issue. A draft
    -- recomputes them from its lines on every save; an issued invoice must
    -- still show the same total in five years even if a rounding rule, a tax
    -- rate or a line's history changes underneath it. The PDF in the bucket
    -- says this number, and the database has to agree with the paper.
    net_cents integer NOT NULL DEFAULT 0,
    tax_cents integer NOT NULL DEFAULT 0,
    total_cents integer NOT NULL DEFAULT 0,

    -- His own sentence, above the signature. Switch 9.
    note text NOT NULL DEFAULT '',

    -- The frozen file in R2 — his answer to question 15, option B. Written
    -- once, at issue, and never rewritten. Regenerating on demand would mean a
    -- new logo next year silently rewrites every invoice he ever sent, which
    -- is both a `GoBD` breach and, worse, means he does not own a copy of what
    -- he actually sent.
    pdf_key text,

    -- When the letter went out, and when he last nudged. Both nullable: he
    -- may hand an invoice over on paper, and most invoices never need a
    -- reminder at all.
    sent_at timestamptz,
    reminded_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT invoices_kind_check
        CHECK (kind IN ('INVOICE', 'CANCELLATION', 'CREDIT_NOTE')),
    CONSTRAINT invoices_status_check
        CHECK (status IN ('DRAFT', 'ISSUED', 'CANCELLED')),
    CONSTRAINT invoices_language_check CHECK (language IN ('de', 'en')),
    CONSTRAINT invoices_money_kind_check CHECK (money_kind IN ('BUILD', 'SUBSCRIPTION')),
    CONSTRAINT invoices_currency_check CHECK (currency ~ '^[A-Z]{3}$'),

    -- A number and an issue date exist exactly when the document is no longer
    -- a draft. Three separate facts that must move together, so they move in
    -- one check rather than in three places in the service.
    CONSTRAINT invoices_issued_pair_check CHECK (
        (status = 'DRAFT') = (number IS NULL)
        AND (number IS NULL) = (issued_on IS NULL)
        AND (number IS NULL) = (number_year IS NULL)
    ),

    -- A correction points at what it corrects; an ordinary invoice does not.
    CONSTRAINT invoices_corrects_pair_check CHECK (
        (kind = 'INVOICE') = (corrects_id IS NULL)
    ),

    -- A document cannot correct itself into existence.
    CONSTRAINT invoices_self_check CHECK (corrects_id IS DISTINCT FROM id),

    -- A draft has no file. Said here because the only way to get one is to
    -- issue, and a `pdf_key` on a draft would mean a file exists for a document
    -- whose numbers can still change.
    CONSTRAINT invoices_pdf_check CHECK (status <> 'DRAFT' OR pdf_key IS NULL),

    -- Nothing is sent before it is issued.
    CONSTRAINT invoices_sent_check CHECK (sent_at IS NULL OR status <> 'DRAFT'),

    CONSTRAINT invoices_due_days_check CHECK (due_days >= 0 AND due_days <= 90),

    CONSTRAINT invoices_money_check CHECK (
        net_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0
    ),

    -- Due before issued is always a mistake, and one that only shows up as a
    -- red row in the overdue list weeks later.
    CONSTRAINT invoices_dates_check CHECK (
        due_on IS NULL OR issued_on IS NULL OR due_on >= issued_on
    ),
    CONSTRAINT invoices_period_check CHECK (
        service_to IS NULL OR service_from IS NULL OR service_to >= service_from
    )
);

-- The list, newest first, which is how the screen opens.
CREATE INDEX invoices_list_idx ON invoices (created_at DESC);

-- The overdue query and the open total: everything still owed. Partial,
-- because a draft is not owed and a cancelled invoice never was.
CREATE INDEX invoices_open_idx ON invoices (due_on)
    WHERE status = 'ISSUED';

-- Every invoice of one client, for their file.
CREATE INDEX invoices_client_idx ON invoices (client_id, created_at DESC);

-- The year's books, in order, for an export.
CREATE INDEX invoices_number_idx ON invoices (number_year, number);

CREATE INDEX invoices_corrects_idx ON invoices (corrects_id) WHERE corrects_id IS NOT NULL;

COMMENT ON TABLE invoices IS
    'One document. A draft is his; an issued invoice is a fact — numbered, frozen to a file in R2, and corrected only by a cancellation or credit note that points back at it.';

COMMENT ON COLUMN invoices.money_kind IS
    'BUILD is paid once and ends. SUBSCRIPTION does not stop. No query in this system may sum across the two.';


-- ─────────────────────────────────────────────────────────────────────────
-- What is being charged for
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE invoice_lines (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices ("id") ON DELETE CASCADE,

    -- The printed position. Held rather than derived from insertion order,
    -- because he can reorder lines in a draft and the paper must match.
    position integer NOT NULL,

    description text NOT NULL,
    -- The grey second line under the description on the paper — "Vorlage
    -- Standard, 5 Seiten, Texte eingepflegt". It is what turns a price into
    -- something a client can agree with.
    detail text NOT NULL DEFAULT '',

    -- Two decimals, so half a day of work is a line and not a rounding
    -- argument. `numeric`, never a float: 0.1 + 0.2 must not appear in money.
    quantity numeric(10, 2) NOT NULL DEFAULT 1,
    unit_cents integer NOT NULL,

    -- **Stored per line, at the rate that applied when it was written.**
    -- Zero for every line he will write this year under `§19`. It is a column
    -- rather than a constant because the day he crosses the threshold, adding
    -- VAT must be a value in a form — not a migration over rows that were
    -- correct when they were issued. `docs/data-model.md` has required this
    -- since B0 and `registration_blocker` names it as the reason.
    tax_rate numeric(5, 2) NOT NULL DEFAULT 0,

    CONSTRAINT invoice_lines_description_check CHECK (btrim(description) <> ''),
    CONSTRAINT invoice_lines_quantity_check CHECK (quantity > 0),
    CONSTRAINT invoice_lines_unit_check CHECK (unit_cents >= 0),
    CONSTRAINT invoice_lines_tax_check CHECK (tax_rate >= 0 AND tax_rate <= 100),
    CONSTRAINT invoice_lines_position_check CHECK (position >= 1),
    -- Two lines cannot claim the same place on the page.
    CONSTRAINT invoice_lines_position_unique UNIQUE (invoice_id, position)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX invoice_lines_invoice_idx ON invoice_lines (invoice_id, position);

COMMENT ON COLUMN invoice_lines.tax_rate IS
    'The rate that applied when this line was written, not a lookup. Switching to Regelbesteuerung is a new value here, never a rewrite of old rows.';


-- ─────────────────────────────────────────────────────────────────────────
-- Money that actually arrived
-- ─────────────────────────────────────────────────────────────────────────
--
-- A table, not a boolean, for two reasons he chose himself:
--
--   * **Partial payments** (question 14). His shops are staged 40/30/30, and
--     an instalment website is a setup fee and then twelve more. One invoice
--     settled by three transfers is the normal case, not the exception.
--   * **`received_on` is the date the money reached him** (switch 15), which
--     is what "earned this month" is counted by. It is also the date his own
--     tax return uses — the Zuflussprinzip — so the honest figure and the
--     legally required one are the same figure, and there is only one to get
--     right.
--
-- There is deliberately no `is_paid` on the invoice. Paid is not a state
-- somebody sets; it is what the sum of these rows says.

CREATE TABLE payments (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices ("id") ON DELETE CASCADE,

    amount_cents integer NOT NULL,

    -- On the payment, never on the invoice: a deposit may arrive by card and
    -- the balance by transfer, and one column on the invoice would have to
    -- lie about one of them.
    method text NOT NULL DEFAULT 'TRANSFER',

    -- A day, not an instant. A bank statement says the 12th; it does not say
    -- 14:37, and inventing a time would be inventing a fact.
    received_on date NOT NULL,

    -- The `Verwendungszweck` from the statement, so a figure on the screen can
    -- be traced to a line on the bank's paper.
    reference text NOT NULL DEFAULT '',
    note text NOT NULL DEFAULT '',

    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT payments_method_check
        CHECK (method IN ('TRANSFER', 'CARD', 'CASH', 'PAYPAL', 'OTHER')),
    -- Negative is not a refund. A refund is a credit note with its own
    -- document, so nothing here ever reduces what arrived.
    CONSTRAINT payments_amount_check CHECK (amount_cents > 0)
);

-- "What arrived this month" — the figure he asked to see, read by date.
CREATE INDEX payments_received_idx ON payments (received_on DESC);
-- What one invoice has been settled by.
CREATE INDEX payments_invoice_idx ON payments (invoice_id, received_on);

COMMENT ON TABLE payments IS
    'Money that actually arrived, on the day it arrived. There is no is_paid boolean anywhere: an invoice is paid when these rows reach its total.';
