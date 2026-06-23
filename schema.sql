CREATE TABLE IF NOT EXISTS products (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL,
    price       NUMERIC(10, 2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_feed
    ON products (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_products_category_feed
    ON products (category, created_at DESC, id DESC);
-- ── Why these indexes ────────────────────────────────────────────────
--
-- 1. idx_products_feed: composite index on (created_at DESC, id DESC).
--    This is THE index that makes pagination fast. The query pattern is:
--       WHERE (created_at, id) < (cursor_created_at, cursor_id)
--       ORDER BY created_at DESC, id DESC
--       LIMIT 20
--    Postgres can use this single index to satisfy the WHERE filter
--    AND the ORDER BY AND the LIMIT, in one index scan — no separate
--    sort step, no scanning rows you don't need. This is what gives
--    O(log n + limit) performance instead of O(offset + limit) like
--    plain OFFSET pagination would.
--
-- 2. idx_products_category_feed: composite index on
--    (category, created_at DESC, id DESC).
--    When filtering by category, Postgres can jump straight to the
--    matching category's rows in this index and walk them in the
--    already-correct sort order, no extra sort step needed.
--
-- We keep both because the global feed (no filter) and per-category
-- browsing are two distinct, equally-common query shapes here.


