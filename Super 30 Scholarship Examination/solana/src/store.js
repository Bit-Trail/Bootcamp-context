const { randomUUID } = require("crypto");

// In-memory state only.
const wallets = new Map(); // walletAddress -> Wallet
const auctions = new Map(); // auctionId -> Auction

function ensureWallet(walletAddress, createdAt) {
  let wallet = wallets.get(walletAddress);
  if (!wallet) {
    wallet = {
      wallet: walletAddress,
      balance: 0, // total deposits - amounts paid for won auctions + seller earnings
      escrowedTotal: 0, // sum of current highest-bid escrows across unsettled auctions
      escrowByAuctionId: new Map(), // auctionId -> amount currently escrowed
      createdAt: createdAt || new Date()
    };
    wallets.set(walletAddress, wallet);
  }
  return wallet;
}

function getWallet(walletAddress) {
  return wallets.get(walletAddress) || null;
}

function getWalletBalanceSnapshot(walletAddress) {
  const wallet = getWallet(walletAddress);
  if (!wallet) {
    return {
      wallet: walletAddress,
      balance: 0,
      escrowed: 0,
      available: 0
    };
  }
  const balance = wallet.balance;
  const escrowed = wallet.escrowedTotal;
  return {
    wallet: walletAddress,
    balance,
    escrowed,
    available: balance - escrowed
  };
}

function depositToWallet(walletAddress, amount, now) {
  const wallet = ensureWallet(walletAddress, now);
  wallet.balance += amount;
  return {
    wallet: walletAddress,
    amount,
    balance: wallet.balance,
    createdAt: wallet.createdAt.toISOString()
  };
}

function escrowForAuction({ auctionId, walletAddress, amount }) {
  const wallet = wallets.get(walletAddress);
  if (!wallet) {
    // Should not happen if availability checks were correct.
    return;
  }
  wallet.escrowedTotal += amount;
  wallet.escrowByAuctionId.set(auctionId, amount);
}

function releaseEscrowForAuction({ auctionId, walletAddress }) {
  const wallet = wallets.get(walletAddress);
  if (!wallet) return;
  const amount = wallet.escrowByAuctionId.get(auctionId) || 0;
  if (amount > 0) {
    wallet.escrowedTotal -= amount;
    wallet.escrowByAuctionId.delete(auctionId);
  }
}

function getAvailableBalance(walletAddress) {
  const wallet = getWallet(walletAddress);
  if (!wallet) return 0;
  return wallet.balance - wallet.escrowedTotal;
}

function escrowAmountForAuction({ auctionId, walletAddress }) {
  const wallet = getWallet(walletAddress);
  if (!wallet) return 0;
  return wallet.escrowByAuctionId.get(auctionId) || 0;
}

function createAuction({
  seller,
  item,
  startAt,
  endAt,
  startingPrice,
  minIncrement,
  createdAt
}) {
  const id = randomUUID();
  const auction = {
    id,
    seller,
    item,
    startAt,
    endAt,
    startingPrice,
    minIncrement,
    createdAt,
    bids: [], // { bidder, amount, placedAt }
    highestBidder: null,
    highestBidAmount: null,
    settledAt: null,
    cancelledAt: null
  };
  auctions.set(id, auction);
  return auction;
}

function getAuction(auctionId) {
  return auctions.get(auctionId) || null;
}

function listAuctions() {
  return Array.from(auctions.values());
}

function computeAuctionStatus(auction, now) {
  if (auction.cancelledAt && now >= auction.cancelledAt) return "CANCELLED";
  if (auction.settledAt && now >= auction.settledAt) return "SETTLED";
  if (now < auction.startAt) return "UPCOMING";
  if (now >= auction.endAt) return "ENDED";
  return "ACTIVE";
}

function computeAuctionSnapshot(auction, now) {
  const nowMs = now.getTime();
  // `now` is used for time-travel snapshots: only include bids that occurred at/before `now`.
  const relevantBids = auction.bids.filter((b) => b.placedAt.getTime() <= nowMs);

  const bidCount = relevantBids.length;

  let highestBidder = null;
  let currentPrice = auction.startingPrice;

  if (bidCount > 0) {
    let highest = relevantBids[0];
    for (const bid of relevantBids.slice(1)) {
      if (
        bid.amount > highest.amount ||
        (bid.amount === highest.amount && bid.placedAt.getTime() > highest.placedAt.getTime())
      ) {
        highest = bid;
      }
    }
    highestBidder = highest.bidder;
    currentPrice = highest.amount;
  }

  return {
    id: auction.id,
    seller: auction.seller,
    item: auction.item,
    startAt: auction.startAt.toISOString(),
    endAt: auction.endAt.toISOString(),
    startingPrice: auction.startingPrice,
    minIncrement: auction.minIncrement,
    createdAt: auction.createdAt.toISOString(),
    status: computeAuctionStatus(auction, now),
    currentPrice,
    bidCount,
    highestBidder
  };
}

module.exports = {
  ensureWallet,
  getWallet,
  depositToWallet,
  getWalletBalanceSnapshot,
  escrowForAuction,
  releaseEscrowForAuction,
  getAvailableBalance,
  escrowAmountForAuction,
  createAuction,
  getAuction,
  listAuctions,
  computeAuctionSnapshot
};

