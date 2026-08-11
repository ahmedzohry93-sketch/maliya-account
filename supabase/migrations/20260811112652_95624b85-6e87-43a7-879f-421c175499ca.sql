ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_journal_entries_type ON public.journal_entries (entry_type);