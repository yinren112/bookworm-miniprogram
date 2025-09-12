-- Enable the pg_trgm extension for trigram similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create a GIN index on the concatenation of title and author for fast fuzzy searching.
-- The table name "bookmaster" is quoted because of its lowercase naming convention.
CREATE INDEX idx_bookmaster_title_author_trgm 
ON "bookmaster" USING GIN ((title || ' ' || COALESCE(author, '')) gin_trgm_ops);