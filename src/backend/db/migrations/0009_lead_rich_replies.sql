-- A reply can carry formatting (B4, second round).
--
-- The document, not HTML: the blog settled this in D24 — a ProseMirror tree
-- with a closed schema has no markup to sanitise, which matters on Workers
-- where DOM-based sanitisers cannot run at all. The same decision, the same
-- shape, the same renderer.
--
-- `body` keeps the plain text of the same letter. Search reads it, the list
-- previews it, and a reply that came in as plain text still has only that.

ALTER TABLE lead_messages
    ADD COLUMN body_rich jsonb;

COMMENT ON COLUMN lead_messages.body_rich IS
    'ProseMirror document for outbound replies written in the admin. NULL for plain text and for everything inbound.';
