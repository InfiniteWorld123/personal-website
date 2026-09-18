-- The assistant on the public pages (D34).
--
-- Two tables, and deliberately no third. There is no `chat_visitors`, because
-- the visitor is never identified: no account, no email asked for, no IP
-- written. A conversation is a random id in the browser's session storage and
-- nothing else, which is why the owner can say "thirty days, then gone" and
-- have it be true rather than hopeful.
--
-- What these tables are *for* is the owner learning what the market asks and
-- where his assistant failed. That knowledge lives in this month's rows. The
-- pruning at the bottom is therefore part of the feature, not housekeeping.


-- ─────────────────────────────────────────────────────────────────────────
-- A conversation
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The language of the page the bubble was opened on. The assistant answers
  -- in it regardless of what the visitor types (D34, the owner's choice): a
  -- German page that answers in Arabic reads as a broken site, not a clever
  -- one. Same three-language CHECK the rest of the schema carries.
  language text NOT NULL CHECK (language IN ('de', 'en', 'ar')),

  -- Which page it was opened from, path only. Useful — it says whether people
  -- ask from Leistungen or from a blog post — and it is not personal data, so
  -- it survives where an address would not be written in the first place.
  opened_from text,

  -- Counted rather than derived from the messages, because the per-visitor
  -- ceiling has to be enforced in the same statement that inserts, and a
  -- COUNT(*) over a growing table to decide whether to accept one more
  -- message is a lock held for no reason.
  visitor_message_count integer NOT NULL DEFAULT 0 CHECK (visitor_message_count >= 0),

  -- Set the first time the assistant has to say it does not know. This is the
  -- single most valuable column here: it marks the conversations worth reading.
  first_unanswered_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Pruning reads by age, and the admin will read by "most recent first".
CREATE INDEX IF NOT EXISTS chat_conversations_last_message_at_idx
  ON chat_conversations (last_message_at DESC);

-- "Show me the ones it could not answer" is the query the owner will run.
CREATE INDEX IF NOT EXISTS chat_conversations_unanswered_idx
  ON chat_conversations (first_unanswered_at DESC)
  WHERE first_unanswered_at IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────
-- What was said
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  conversation_id uuid NOT NULL
    REFERENCES chat_conversations (id) ON DELETE CASCADE,

  -- `VISITOR` or `ASSISTANT`. Spelled out rather than a boolean because a
  -- third author is plausible later (a scripted opening line is not the
  -- assistant answering), and widening a CHECK is cheaper than migrating a
  -- boolean that turned out to be a three-valued thing.
  author text NOT NULL CHECK (author IN ('VISITOR', 'ASSISTANT')),

  body text NOT NULL,

  -- Which knowledge entry the answer was built from, by its stable key — not
  -- a foreign key, because the book is a file in the repository, not a table.
  -- NULL on a visitor's message and on a fallback the book could not answer.
  source_key text,

  -- Which brain produced it: `off` for the file alone, or the provider name.
  -- Worth keeping because the day an answer reads wrong, the first question
  -- is whether a model wrote it or the owner did.
  produced_by text,

  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS chat_messages_conversation_idx
  ON chat_messages (conversation_id, created_at);

-- "What do people actually ask?" grouped by the entry that answered them.
CREATE INDEX IF NOT EXISTS chat_messages_source_key_idx
  ON chat_messages (source_key)
  WHERE source_key IS NOT NULL;
