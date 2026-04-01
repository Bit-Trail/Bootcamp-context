const {
  getAuction,
  getWallet,
  getAvailableBalance,
  releaseEscrowForAuction,
  escrowForAuction,
  computeAuctionSnapshot
} = require("../store");

const { parseIsoDateTimeOrThrow } = require("../utils/time");
const { parseBodyJsonOrEmpty } = require("../http/parseBodyJsonOrEmpty");
const { badRequest, notFound } = require("../http/httpHelpers");
const { isNonEmptyString, isPositiveInteger } = require("../validators/validators");

function postBid(req, res) {
  const auction = getAuction(req.params.id);
  if (!auction) return notFound(res, "Auction not found");

  const body = parseBodyJsonOrEmpty(req);
  const { bidder, amount, now } = body;

  if (!isNonEmptyString(bidder)) {
    return badRequest(res, "bidder must be a non-empty string");
  }
  if (!isPositiveInteger(amount)) {
    return badRequest(res, "amount must be a positive integer");
  }
  if (bidder.trim() === auction.seller) {
    return badRequest(res, "bidder must not be the seller");
  }

  let nowDate;
  try {
    nowDate = now === undefined ? new Date() : parseIsoDateTimeOrThrow(now);
  } catch (_e) {
    return badRequest(res, "Invalid now ISO datetime string");
  }

  const statusNow = computeAuctionSnapshot(auction, nowDate).status;
  if (statusNow !== "ACTIVE") {
    return badRequest(res, "Auction must be ACTIVE at the given now");
  }

  const prevBidder = auction.highestBidder;
  const prevHighestAmount = auction.highestBidAmount; // null when no bids

  const isFirstBid = auction.bids.length === 0;
  const currentPrice = prevHighestAmount === null ? auction.startingPrice : prevHighestAmount;

  if (isFirstBid) {
    if (amount < auction.startingPrice) {
      return badRequest(res, "First bid must be >= startingPrice");
    }
  } else {
    if (amount < currentPrice + auction.minIncrement) {
      return badRequest(res, "Subsequent bids must be >= currentPrice + minIncrement");
    }
  }

  const bidderAddress = bidder.trim();
  const bidderWallet = getWallet(bidderAddress);
  if (!bidderWallet) return badRequest(res, "Bidder must have sufficient available balance");

  // Special rule: if the bidder is raising their own highest bid, release their existing escrow
  // before checking availability.
  const prevEscrowAmountForBidder =
    prevBidder === bidderAddress && prevHighestAmount !== null ? prevHighestAmount : 0;

  const available = getAvailableBalance(bidderAddress);
  const availableAfterPossibleRelease = available + prevEscrowAmountForBidder;
  if (availableAfterPossibleRelease < amount) {
    return badRequest(res, "Bidder must have sufficient available balance");
  }

  // Release previous highest escrow if needed.
  if (prevBidder !== null) {
    releaseEscrowForAuction({ auctionId: auction.id, walletAddress: prevBidder });
  }

  // Now lock the new amount.
  escrowForAuction({ auctionId: auction.id, walletAddress: bidderAddress, amount });

  auction.bids.push({ bidder: bidderAddress, amount, placedAt: nowDate });
  auction.highestBidder = bidderAddress;
  auction.highestBidAmount = amount;

  return res.status(200).json(computeAuctionSnapshot(auction, nowDate));
}

module.exports = { postBid };

