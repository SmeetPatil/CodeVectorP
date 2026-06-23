// src/seed.js
//
// Generates 200,000 products and inserts them in large batches.
//
// ── Why not a simple loop with one INSERT per row? ──────────────────
// A loop doing `await client.query('INSERT ...')` 200,000 times means
// 200,000 separate round-trips to the database. Each round-trip pays
// network latency + Postgres parsing/planning overhead, even though
// the actual write is tiny. On a remote DB (Neon/Supabase) where each
// round-trip might cost 10-50ms, 200,000 round-trips is 30+ minutes,
// maybe much worse. The fix: batch many rows into ONE multi-row
// INSERT statement, so we pay the round-trip cost once per batch,
// not once per row.
//
// We insert 5,000 rows per statement, 40 statements total. You could
// also use Postgres's COPY command (even faster, streams raw data),
// but batched multi-row INSERTs are simpler to read/explain live and
// are plenty fast for 200k rows (typically under a minute).

require('dotenv').config();
const { Pool } = require('pg');

const TOTAL_PRODUCTS = 200_000;
const BATCH_SIZE = 5_000;

const CATEGORIES = [
  'Electronics', 'Home & Kitchen', 'Books', 'Clothing', 'Sports',
  'Toys', 'Beauty', 'Automotive', 'Garden', 'Office Supplies',
];

const ADJECTIVES = [
  'Premium', 'Compact', 'Wireless', 'Portable', 'Classic',
  'Eco-Friendly', 'Heavy-Duty', 'Smart', 'Deluxe', 'Essential',
];

const NOUNS = [
  'Blender', 'Notebook', 'Headphones', 'Lamp', 'Backpack',
  'Water Bottle', 'Chair', 'Charger', 'Speaker', 'Jacket',
];

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomProductName() {
  return `${randomFrom(ADJECTIVES)} ${randomFrom(NOUNS)}`;
}

function randomPrice() {
  // price between 5.00 and 999.99
  return (Math.random() * 994 + 5).toFixed(2);
}

function randomPastDate() {
  // spread creation times over the last 365 days, so "newest first"
  // pagination has something meaningful to sort through
  const now = Date.now();
  const oneYearMs = 365 * 24 * 60 * 60 * 1000;
  const ts = now - Math.random() * oneYearMs;
  return new Date(ts);
}

async function seed() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false },
  });

  console.log(`Seeding ${TOTAL_PRODUCTS} products in batches of ${BATCH_SIZE}...`);
  const startTime = Date.now();

  let inserted = 0;

  for (let batchStart = 0; batchStart < TOTAL_PRODUCTS; batchStart += BATCH_SIZE) {
    const rowsInBatch = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - batchStart);

    // Build one big multi-row INSERT:
    //   INSERT INTO products (name, category, price, created_at, updated_at)
    //   VALUES ($1,$2,$3,$4,$5), ($6,$7,$8,$9,$10), ...
    const values = [];
    const placeholders = [];

    for (let i = 0; i < rowsInBatch; i++) {
      const createdAt = randomPastDate();
      // most products: updated_at == created_at (never touched since creation)
      const updatedAt = createdAt;

      const base = i * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`
      );
      values.push(
        randomProductName(),
        randomFrom(CATEGORIES),
        randomPrice(),
        createdAt,
        updatedAt
      );
    }

    const query = `
      INSERT INTO products (name, category, price, created_at, updated_at)
      VALUES ${placeholders.join(', ')}
    `;

    await pool.query(query, values);
    inserted += rowsInBatch;
    console.log(`  inserted ${inserted}/${TOTAL_PRODUCTS}`);
  }

  const seconds = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Done. Inserted ${inserted} products in ${seconds}s.`);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
