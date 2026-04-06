const { getAuction, computeAuctionSnapshot } = require("../store");
const { parseIsoDateTimeOrThrow } = require("../utils/time");
const { parseBodyJsonOrEmpty } = require("../http/parseBodyJsonOrEmpty");
const { badRequest, notFound } = require("../http/httpHelpers");

function postCancel(req, res) {
  const auction = getAuction(req.params.id);
  if (!auction) return notFound(res, "Auction not found");

  if (auction.cancelledAt || auction.settledAt) {
    return badRequest(res, "Auction is not in UPCOMING status");
  }

  const body = parseBodyJsonOrEmpty(req);
  const { now } = body;

  let nowDate;
  try {
    nowDate = now === undefined ? new Date() : parseIsoDateTimeOrThrow(now);
  } catch (_e) {
    return badRequest(res, "Invalid now ISO datetime string");
  }

  const statusNow = computeAuctionSnapshot(auction, nowDate).status;
  if (statusNow !== "UPCOMING") {
    return badRequest(res, "Auction is not in UPCOMING status");
  }

  auction.cancelledAt = nowDate;
  return res.status(200).json(computeAuctionSnapshot(auction, nowDate));
}

module.exports = { postCancel };

