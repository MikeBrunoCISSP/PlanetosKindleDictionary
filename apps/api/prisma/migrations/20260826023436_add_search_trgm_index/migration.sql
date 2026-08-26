-- Enable the pg_trgm extension (bundled with postgres:16-alpine) so the GIN
-- index below can use trigram operators for efficient ILIKE '%word%' search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "SeriesWord_normalizedWord_idx" ON "SeriesWord" USING GIN ("normalizedWord" gin_trgm_ops);
