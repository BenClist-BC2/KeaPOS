-- ============================================================
-- Add 'terminal' role for POS terminal devices
-- ============================================================
-- This must be in a separate migration because PostgreSQL doesn't
-- allow using new enum values in the same transaction they're created.
-- ============================================================

alter type user_role add value 'terminal';
