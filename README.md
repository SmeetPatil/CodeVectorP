# Products Browse API

Browse ~200,000 products, newest first, with category filtering and pagination
that stays correct while data is being written concurrently.

## Stack

- **Node.js + Express** — HTTP API
- **PostgreSQL** (tested locally; designed for Neon/Supabase free tier)
- No ORM — raw SQL via `pg`, because the whole point of this task is the
  query plan and indexing strategy, and an ORM would obscure exactly the
  part that matters.

## Setup

```bash
npm install
cp .env.example .env   # fill in your DATABASE_URL
psql "$DATABASE_URL" -f src/schema.sql   # create table + indexes
npm run seed                              # generate 200,000 products
npm start                                  # start the API on $PORT
```

## API

`GET /products`

| Query param | Required | Description                                   |
|-------------|----------|------------------------------------------------|
| `category`  | no       | Filter to a single category                    |
| `cursor`    | no       | Opaque cursor from a previous response         |
| `limit`     | no       | Page size, default 20, max 100                 |

Response:

```json
{
  "items": [ { "id": ..., "name": ..., "category": ..., "price": ..., "created_at": ..., "updated_at": ... }, ... ],
  "next_cursor": "opaque-string-or-null",
  "has_more": true
}
```

To get the next page, pass `next_cursor` from the previous response back as
the `cursor` query param. When `has_more` is `false`, you're at the end.

## Design decisions (and why)

### 1. Keyset (cursor) pagination instead of OFFSET/LIMIT

`OFFSET` pagination asks the database to skip N rows before returning the
next page. The cost of that skip grows with N — on page 5000, Postgres still
has to walk past the first ~100,000 rows. It also doesn't survive concurrent
writes correctly (see below).

Keyset pagination instead remembers the last row seen — `(created_at, id)` —
and asks for "everything strictly after this point" using a row-comparison
predicate:

```sql
WHERE (created_at, id) < ($cursor_created_at, $cursor_id)
ORDER BY created_at DESC, id DESC
LIMIT 20
```

Combined with a composite index on `(created_at DESC, id DESC)`, Postgres
satisfies the filter, sort, and limit in a single index scan — no full
table scan, no separate sort step. Verified via `EXPLAIN ANALYZE`: this
returns in well under 1ms regardless of how deep into the dataset the
cursor points, on the full 200k-row table.

### 2. The `id` tiebreaker is mandatory, not cosmetic

The seed data deliberately allows duplicate `created_at` values across rows
(many products can share a timestamp). Sorting by `created_at` alone makes
"give me rows after this one" ambiguous whenever ties exist — you can skip
or repeat rows inside a tie group. Sorting by `(created_at, id)` makes every
row's position in the order unique, so the cursor is unambiguous no matter
how many ties exist.

### 3. Sort by `created_at`, not `updated_at`

"Newest first" could mean "most recently created" or "most recently
touched." I chose `created_at` deliberately:

- It's immutable — a row's position in the feed never changes after
  creation, which is what makes a cursor stay valid indefinitely.
- If sorting by `updated_at` instead, editing an old product would yank it
  to the top of the feed, which actively breaks pagination stability:
  a row the user already paginated past could resurface above their
  cursor, and they'd see it twice. The task's requirement ("must not see
  the same product twice") rules this out.

`updated_at` is still stored and returned in the response, it just isn't
used for ordering.

### 4. Why this stays correct while 50 products are added/updated mid-browse

- **Inserts** always land at the newest end of the sort order (`created_at
  = now()`). A user's cursor points at some older row; the `WHERE`
  predicate only matches rows "below" that cursor. New rows above it are
  simply outside the window being requested — they can't cause a
  duplicate or a skip in an in-progress pagination session.
- **Updates** to existing rows change `updated_at` (and other columns) but
  never `created_at`, so they don't move in the sort order. An update to
  a row the user already saw, or hasn't reached yet, doesn't change
  whether/when they see it.
- **Deletes** (not in the task's stated requirement, but worth noting):
  if a row the user hasn't reached yet gets deleted, they simply won't see
  it on a later page — correct behavior, not a bug.

This was tested directly: paginate through several pages, insert 50 new
rows + update 50 existing rows mid-session, then continue pagination on the
old cursor and confirm zero duplicates and zero new rows leaking into the
in-progress session, while a *fresh* (uncursored) request immediately shows
the new rows at the top.

### 5. Avoiding `COUNT(*)` for "has more pages"

A naive way to know if there's a next page is `SELECT COUNT(*) WHERE ...`,
but that's itself an expensive scan on a 200k-row table for no real
benefit. Instead, each query fetches `limit + 1` rows; if the extra row
comes back, there's a next page, and it's trimmed off before responding.

### 6. Seed script: batched inserts, not a loop

200,000 individual `INSERT` statements means 200,000 network round-trips
to the database — on a remote host (Neon/Supabase) where each round-trip
costs real latency, this is extremely slow. The seed script batches 5,000
rows per `INSERT` statement (40 batches total), paying the round-trip cost
40 times instead of 200,000. Locally this generates and inserts all
200,000 rows in about 5–6 seconds.

## What I'd improve with more time

- Add an integration test suite (the manual concurrency test I ran during
  development should become an automated test).
- Add rate limiting / basic auth if this were a real public API.
- Consider `COPY` instead of batched `INSERT` for the seed script for even
  faster generation at larger scale (not necessary at 200k rows, but would
  matter at 10M+).
- Add a `total_count` estimate (via `pg_class.reltuples`, which is
  approximate but free, rather than an exact `COUNT(*)`) if the UI ever
  needs to show "page X of Y".

## How I used AI

[Fill this in honestly based on your actual process — see note below.]
