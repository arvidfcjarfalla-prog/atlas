-- Add chat_history column to maps table for persisting agent conversations.
-- Stored as JSONB array of { role, content, toolCalls? } objects.

ALTER TABLE maps ADD COLUMN IF NOT EXISTS chat_history jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN maps.chat_history IS 'Agent chat messages for this map session';
