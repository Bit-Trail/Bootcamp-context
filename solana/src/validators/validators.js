function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStatusFilter(statusValue) {
  if (typeof statusValue !== "string") return null;
  const v = statusValue.trim().toUpperCase();
  if (
    v === "UPCOMING" ||
    v === "ACTIVE" ||
    v === "ENDED" ||
    v === "SETTLED" ||
    v === "CANCELLED"
  ) {
    return v;
  }
  return v;
}

module.exports = {
  isPositiveInteger,
  isNonNegativeInteger,
  isNonEmptyString,
  normalizeStatusFilter
};

