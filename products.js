const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
});

pool.on('connect', (client) => {
  client.query("SET timezone = 'Asia/Kolkata'");
});

/**
 * Fetch a page of products, newest first, optionally filtered by
 * category, optionally starting after a cursor.
 *
 * ── The core idea ──────────────────────────────────────────────────
 * We sort by (created_at DESC, id DESC). The tiebreaker on `id` matters
 * because many products can share the same created_at timestamp —
 * without a tiebreaker, "rows after this cursor" would be ambiguous
 * for tied rows, and we could double-show or skip rows within a tie.
 *
 * To get "the next page after row X", we don't say OFFSET N. We say:
 *   WHERE (created_at, id) < (X.created_at, X.id)
 * Postgres supports this "row comparison" syntax directly — it's
 * exactly the semantics we want for descending order: strictly
 * "earlier in the sort order than X".
 *
 * ── Why this stays correct while data is being written ─────────────
 * - New inserts always land at created_at = now(), i.e. the NEWEST
 *   end of the sort order. A cursor pointing at an older row is
 *   unaffected by anything inserted above it — the WHERE clause only
 *   ever looks "below" the cursor, so new rows above don't shift
 *   which rows match. No duplicates, no skips from inserts.
 * - Updates to EXISTING rows don't move them, because we sort by
 *   created_at (immutable, set once at creation), not updated_at.
 *   An edit changes updated_at and possibly other columns, but the
 *   row's position in the feed never changes. This is a deliberate
 *   design choice: "newest first" means newest-CREATED first, and it
 *   keeps the cursor's position meaningful indefinitely.
 * - Deletes are the one case keyset pagination doesn't fully erase —
 *   if a row you already saw gets deleted, you simply won't see it
 *   again, which is correct behavior, not a bug.
 *
 * @param {object} opts
 * @param {string|null} opts.category - optional category filter
 * @param {{created_at: string, id: number}|null} opts.cursor - last seen row
 * @param {number} opts.limit - page size
 */
async function getProductsPage({ category, cursor, limit }) {
  const conditions = [];
  const params = [];

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  if (cursor) {
    // Row-comparison predicate: strictly "older" than the cursor row
    // in our (created_at DESC, id DESC) ordering.
    params.push(cursor.created_at);
    params.push(cursor.id);
    conditions.push(
      `(created_at, id) < ($${params.length - 1}, $${params.length})`
    );
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // Fetch one extra row beyond `limit` so we can tell whether there's
  // a next page, without a separate COUNT(*) query (which would be
  // slow on 200k rows and is unnecessary here).
  params.push(limit + 1);
  const limitParamIndex = params.length;

  const query = `
    SELECT id, name, category, price, created_at, updated_at
    FROM products
    ${whereClause}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitParamIndex}
  `;

  const { rows } = await pool.query(query, params);

  const hasNextPage = rows.length > limit;
  const items = hasNextPage ? rows.slice(0, limit) : rows;

  return { items, hasNextPage };
}

module.exports = { getProductsPage, pool };
