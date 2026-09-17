-- Undoing 0012, at the owner's instruction.
--
-- `0012_subscriptions.sql` modelled the instalment/subscription split from
-- `docs/services/`. The reasoning was sound and the timing was wrong: he has
-- no clients, has not been to the Finanzamt, and told me plainly that his
-- services and prices will keep changing — so building the lead system on top
-- of a subscription model he has not decided is complexity bought against a
-- business that does not exist yet.
--
-- His words, 17 Sep 2026: *"if you don't need it, then you can delete it right
-- now."* Nothing was ever written to the table, and nothing in the codebase
-- reads it or the four payment columns, so this removes both rather than
-- leaving dead structure behind — the thing that makes a panel untrustworthy.
--
-- The reasoning is not lost. It is recorded in the memory note
-- `business-model-two-kinds-of-money`, and `0012` stays in the repository as
-- the exact statement to run again on the day he has clients and prices he is
-- sure of.

DROP TABLE IF EXISTS subscriptions;

ALTER TABLE deals
    DROP COLUMN IF EXISTS payment_plan,
    DROP COLUMN IF EXISTS setup_cents,
    DROP COLUMN IF EXISTS instalment_cents,
    DROP COLUMN IF EXISTS instalment_months;

-- The `SUB_*` kinds go with the table. No row ever carried one — the table it
-- described was never written to — so nothing existing violates the narrower
-- constraint.
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
        'VALUE', 'SERVICE', 'WON', 'LOST', 'AUTO_CLOSED', 'REOPENED'
    )
);
