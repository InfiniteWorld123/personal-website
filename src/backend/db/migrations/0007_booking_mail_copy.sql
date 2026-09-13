-- The words the confirmation and the cancellation are written in, per call
-- type and per language.
--
-- Empty means "use the built-in wording", which is what every existing row
-- gets: the default is not a copy of the current text, because a copy would
-- freeze it and stop translations improving with the rest of the site.
ALTER TABLE booking_type_translations
  ADD COLUMN confirmed_subject text NOT NULL DEFAULT '',
  ADD COLUMN confirmed_intro text NOT NULL DEFAULT '',
  ADD COLUMN cancelled_subject text NOT NULL DEFAULT '',
  ADD COLUMN cancelled_intro text NOT NULL DEFAULT '';
