-- PostgreSQL initialization script for Bookworm dev/test containers
-- Ensure required extensions exist before Prisma migrations run
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Mirror trigger GUC used by docker-compose command (optional safety)
-- ALTER SYSTEM SET bookworm.max_reserved_items_per_user = '20';
