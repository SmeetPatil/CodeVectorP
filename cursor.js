// src/cursor.js
//
// A cursor encodes "the position of the last row the client has seen"
// so the next request can say "give me rows after this point" instead
// of "give me rows starting at offset N".
//
// We encode (created_at, id) as a base64 string. Base64 isn't for
// security — it's just to bundle two values into one opaque string
// the client can pass around without caring about its internal shape.
// If we ever want to change what a cursor contains, we can, without
// breaking the API's URL structure.

function encodeCursor(createdAt, id) {
  const payload = JSON.stringify({ created_at: createdAt, id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

function decodeCursor(cursorStr) {
  try {
    const payload = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const { created_at, id } = JSON.parse(payload);
    if (!created_at || !id) return null;
    return { created_at, id: Number(id) };
  } catch {
    return null; // malformed cursor — caller should treat as "no cursor"
  }
}

module.exports = { encodeCursor, decodeCursor };
