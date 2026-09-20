-- One meaning for the word "subscription". 20 Sep 2026.
--
-- `invoices.money_kind` was the rule the whole business rests on, made
-- structural: BUILD money is paid once and ends, SUBSCRIPTION money does not,
-- and `0016` recorded that merging them is «الخطأ الذي يُفلس» — the mistake
-- that bankrupts you.
--
-- The rule is not going anywhere. The **column** is, because it stopped being
-- what enforces it.
--
-- `0016` justified it in one sentence: *"every figure the admin shows is
-- filtered by it."* That was true for exactly as long as there was no
-- subscriptions table — the recurring figure had to be inferred from what he
-- had billed, so something on the invoice had to say which kind it was. `0020`
-- brought the table back and the figure now reads the arrangements themselves,
-- which is both more honest (it counts money agreed, not money already
-- invoiced) and stronger: a row in `subscriptions` **is** a subscription,
-- where `money_kind` depended on him remembering to set it.
--
-- So by 20 Sep nothing read the column. It was written on create, carried on
-- update, copied onto corrections, projected onto every row — and consumed by
-- no figure, no filter and no screen. A question the form asked him whose
-- answer changed nothing.
--
-- He found it himself, in the form: *"when I would like to create an invoice
-- then I have two types, one payment and subscription — do you think that
-- system is weird?"* It was. The word meant two different things on two
-- screens and only one of them did anything.
--
-- What tells the two kinds apart now is `subscription_id`: an invoice a
-- subscription wrote, or one he wrote. Derived from a fact rather than from a
-- label, and impossible to set wrong.

ALTER TABLE invoices
    DROP CONSTRAINT IF EXISTS invoices_money_kind_check,
    DROP COLUMN IF EXISTS money_kind;
