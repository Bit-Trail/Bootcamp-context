function isValidIsoDateTimeWithTimezone(value) {
  // Require full ISO datetime with timezone information.
  // Examples accepted:
  //  - 2026-03-20T10:15:30Z
  //  - 2026-03-20T10:15:30.123+05:30
  // Examples rejected:
  //  - 2026-03-20
  //  - 2026-03-20T10:15:30
  return (
    typeof value === "string" &&
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  );
}

function parseIsoDateTimeOrThrow(value) {
  if (!isValidIsoDateTimeWithTimezone(value)) {
    const err = new Error("Invalid ISO datetime (must include timezone)");
    err.code = "INVALID_ISO_DATETIME";
    throw err;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid ISO datetime");
    err.code = "INVALID_ISO_DATETIME";
    throw err;
  }
  return d;
}

function nowDate() {
  return new Date();
}

function parseNowOverride(queryValue) {
  if (queryValue === undefined || queryValue === null) return nowDate();
  return parseIsoDateTimeOrThrow(queryValue);
}

module.exports = {
  parseIsoDateTimeOrThrow,
  parseNowOverride,
  isValidIsoDateTimeWithTimezone,
};

