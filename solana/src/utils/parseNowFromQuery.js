const { parseIsoDateTimeOrThrow } = require("./time");

function parseNowFromQuery(req, res, badRequest) {
  const nowRaw = req.query.now;
  if (nowRaw === undefined) return { now: null, responded: false };
  try {
    if (typeof nowRaw !== "string") {
      badRequest(res, "now must be an ISO datetime string");
      return { now: null, responded: true };
    }
    const d = parseIsoDateTimeOrThrow(nowRaw);
    return { now: d, responded: false };
  } catch (_e) {
    badRequest(res, "Invalid now ISO datetime string");
    return { now: null, responded: true };
  }
}

module.exports = { parseNowFromQuery };

