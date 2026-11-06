export function validateDateRange(from, to) {
  if (from == null || to == null || from === "" || to === "") {
    return {
      valid: false,
      message: "Both from and to are required",
    };
  }

  if (typeof from !== "string" || typeof to !== "string") {
    return {
      valid: false,
      message: "Dates must use YYYY-MM-DD format",
    };
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!datePattern.test(from) || !datePattern.test(to)) {
    return {
      valid: false,
      message: "Dates must use YYYY-MM-DD format",
    };
  }

  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);

  if (
    Number.isNaN(fromDate.getTime()) ||
    Number.isNaN(toDate.getTime()) ||
    fromDate.toISOString().slice(0, 10) !== from ||
    toDate.toISOString().slice(0, 10) !== to
  ) {
    return {
      valid: false,
      message: "Invalid calendar date",
    };
  }

  if (from > to) {
    return {
      valid: false,
      message: "from must not be after to",
    };
  }

  return { valid: true };
}
