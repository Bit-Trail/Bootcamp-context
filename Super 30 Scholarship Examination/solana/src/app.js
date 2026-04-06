const express = require("express");

const walletController = require("./controllers/walletController");
const auctionController = require("./controllers/auctionController");
const bidController = require("./controllers/bidController");
const settleController = require("./controllers/settleController");
const cancelController = require("./controllers/cancelController");
const bidsController = require("./controllers/bidsController");

function createApp() {
  const app = express();
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.post("/api/wallets/deposit", walletController.postWalletDeposit);
  app.get("/api/wallets/:wallet/balance", walletController.getWalletBalance);

  app.post("/api/auctions", auctionController.postAuction);
  app.get("/api/auctions/:id", auctionController.getAuctionById);
  app.get("/api/auctions", auctionController.getAuctionsList);

  app.post("/api/auctions/:id/bid", bidController.postBid);
  app.post("/api/auctions/:id/settle", settleController.postSettle);
  app.post("/api/auctions/:id/cancel", cancelController.postCancel);
  app.get("/api/auctions/:id/bids", bidsController.getBids);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}

module.exports = { createApp };

