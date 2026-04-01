function parseBodyJsonOrEmpty(req) {
  // express.json() parses body when Content-Type is JSON.
  // For endpoints where body is optional, treat missing body as `{}`.
  if (req.body === undefined) return {};
  return req.body;
}

module.exports = { parseBodyJsonOrEmpty };