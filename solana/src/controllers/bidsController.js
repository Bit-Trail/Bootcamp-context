const { getAuction } = require("../store");
const { notFound } = require("../http/httpHelpers");

function getBids(req, res) {
  const auction = getAuction(req.params.id);
  if (!auction) return notFound(res, "Auction not found");

  const bids = auction.bids
    .slice()
    .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())
    .map((b) => ({
      bidder: b.bidder,
      amount: b.amount,
      placedAt: b.placedAt.toISOString()
    }));

  return res.status(200).json({ bids });
}

module.exports = { getBids };

