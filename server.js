require('dotenv').config();
const express = require('express');
const { getProductsPage } = require('./products');
const { encodeCursor, decodeCursor } = require('./cursor');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/products', async (req, res) => {
  try {
    const category = req.query.category || null;

    let limit = parseInt(req.query.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    limit = Math.min(limit, MAX_LIMIT);

    let cursor = null;
    if (req.query.cursor) {
      cursor = decodeCursor(req.query.cursor);
      if (!cursor) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
    }

    const { items, hasNextPage } = await getProductsPage({
      category,
      cursor,
      limit,
    });

    let nextCursor = null;
    if (hasNextPage && items.length > 0) {
      const last = items[items.length - 1];
      nextCursor = encodeCursor(last.created_at, last.id);
    }

    res.json({
      items,
      next_cursor: nextCursor,
      has_more: hasNextPage,
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
