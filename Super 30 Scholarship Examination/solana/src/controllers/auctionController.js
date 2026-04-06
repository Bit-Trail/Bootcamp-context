const {
  createAuction,
  getAuction,
  listAuctions,
  computeAuctionSnapshot
} = require("../store");

const { parseBodyJsonOrEmpty } = require("../http/parseBodyJsonOrEmpty");
const { badRequest, notFound } = require("../http/httpHelpers");
const { parseIsoDateTimeOrThrow } = require("../utils/time");
const { parseNowFromQuery } = require("../utils/parseNowFromQuery");
const {
  isNonEmptyString,
  isNonNegativeInteger,
  isPositiveInteger,
  normalizeStatusFilter
} = require("../validators/validators");

function postAuction(req, res) {
  const body = parseBodyJsonOrEmpty(req);
  const { seller, item, startAt, endAt, startingPrice, minIncrement } = body;

  if (!isNonEmptyString(seller)) {
    return badRequest(res, "seller must be a non-empty string");
  }
  if (!isNonEmptyString(item)) {
    return badRequest(res, "item must be a non-empty string");
  }
  if (typeof startAt !== "string") {
    return badRequest(res, "startAt must be an ISO datetime string with timezone");
  }
  if (typeof endAt !== "string") {
    return badRequest(res, "endAt must be an ISO datetime string with timezone");
  }
  if (!isNonNegativeInteger(startingPrice)) {
    return badRequest(res, "startingPrice must be an integer >= 0");
  }
  if (!isPositiveInteger(minIncrement)) {
    return badRequest(res, "minIncrement must be a positive integer");
  }

  let startDate;
  let endDate;
  try {
    startDate = parseIsoDateTimeOrThrow(startAt);
    endDate = parseIsoDateTimeOrThrow(endAt);
  } catch (_e) {
    return badRequest(res, "Invalid ISO datetime for startAt/endAt");
  }

  if (!(endDate.getTime() > startDate.getTime())) {
    return badRequest(res, "endAt must be strictly after startAt");
  }

  const createdAt = new Date();
  const auction = createAuction({
    seller: seller.trim(),
    item: item.trim(),
    startAt: startDate,
    endAt: endDate,
    startingPrice,
    minIncrement,
    createdAt
  });

  return res.status(201).json(computeAuctionSnapshot(auction, createdAt));
}

function getAuctionById(req, res) {
  const auction = getAuction(req.params.id);
  if (!auction) return notFound(res, "Auction not found");

  const parsed = parseNowFromQuery(req, res, badRequest);
  if (parsed.responded) return;
  const now = parsed.now || new Date();

  return res.status(200).json(computeAuctionSnapshot(auction, now));
}

function getAuctionsList(req, res) {
  const parsed = parseNowFromQuery(req, res, badRequest);
  if (parsed.responded) return;
  const now = parsed.now || new Date();

  const sellerFilter = req.query.seller;
  const statusFilter = normalizeStatusFilter(req.query.status);

  const snapshots = listAuctions()
    .filter((a) => {
      if (sellerFilter !== undefined && String(a.seller) !== String(sellerFilter)) {
        return false;
      }
      if (statusFilter !== undefined && statusFilter !== null) {
        const s = computeAuctionSnapshot(a, now).status;
        if (s !== statusFilter) return false;
      }
      return true;
    })
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((a) => computeAuctionSnapshot(a, now));

  return res.status(200).json({ auctions: snapshots });
}

module.exports = {
  postAuction,
  getAuctionById,
  getAuctionsList
};

