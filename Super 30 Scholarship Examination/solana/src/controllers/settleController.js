const {
  getAuction,
  getWallet,
  releaseEscrowForAuction,
  ensureWallet,
  computeAuctionSnapshot
} = require("../store");

const { parseIsoDateTimeOrThrow } = require("../utils/time");
const { parseBodyJsonOrEmpty } = require("../http/parseBodyJsonOrEmpty");
const { badRequest, notFound } = require("../http/httpHelpers");

function postSettle(req, res) {
  const auction = getAuction(req.params.id);
  if (!auction) return notFound(res, "Auction not found");

  if (auction.settledAt) {
    return badRequest(res, "Auction is not in ENDED status");
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
  if (statusNow !== "ENDED") {
    return badRequest(res, "Auction is not in ENDED status");
  }

  let winner = null;
  let winningBid = null;

  if (auction.bids.length > 0) {
    winner = auction.highestBidder;
    winningBid = auction.highestBidAmount;

    const winnerWallet = getWallet(winner);
    if (winningBid !== null && winnerWallet) {
      releaseEscrowForAuction({ auctionId: auction.id, walletAddress: winner });
      winnerWallet.balance -= winningBid;
    }

    if (winningBid !== null) {
      const sellerWallet = ensureWallet(auction.seller, nowDate);
      sellerWallet.balance += winningBid;
    }
  }

  auction.settledAt = nowDate;
  return res.status(200).json({
    auction: computeAuctionSnapshot(auction, nowDate),
    winner,
    winningBid
  });
}

module.exports = { postSettle };

