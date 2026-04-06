const { depositToWallet, getWalletBalanceSnapshot } = require("../store");
const { parseBodyJsonOrEmpty } = require("../http/parseBodyJsonOrEmpty");
const {
  isNonEmptyString,
  isPositiveInteger
} = require("../validators/validators");

const { badRequest } = require("../http/httpHelpers");

function postWalletDeposit(req, res) {
  const body = parseBodyJsonOrEmpty(req);
  const { wallet, amount } = body;

  if (!isNonEmptyString(wallet)) {
    return badRequest(res, "wallet must be a non-empty string");
  }
  if (!isPositiveInteger(amount)) {
    return badRequest(res, "amount must be a positive integer");
  }

  const now = new Date();
  const created = depositToWallet(wallet.trim(), amount, now);
  return res.status(201).json(created);
}

function getWalletBalance(req, res) {
  const wallet = req.params.wallet;
  return res.status(200).json(getWalletBalanceSnapshot(wallet));
}

module.exports = {
  postWalletDeposit,
  getWalletBalance
};

