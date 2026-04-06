const express = require("express");
const { createRetrievalEngine } = require("./retrievalEngine");
const { createInMemoryStore } = require("./store");
const { registerRoutes } = require("./routes");

function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  const store = createInMemoryStore();
  const retrieval = createRetrievalEngine(store);
  registerRoutes(app, store, retrieval);

  return app;
}

module.exports = { createApp };