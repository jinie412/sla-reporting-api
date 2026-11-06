const dateFormatters = new Map();

export function isEligibleRequest(request, site, from, to) {
  if (
    !request ||
    request.status === "canceled" ||
    request.deleted_at != null ||
    request.merged_into_id != null ||
    !site?.timezone
  ) {
    return false;
  }

  const createdAt = new Date(request.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    return false;
  }

  let formatter = dateFormatters.get(site.timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: site.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    dateFormatters.set(site.timezone, formatter);
  }

  const localDate = formatter
    .formatToParts(createdAt)
    .reduce((date, part) => {
      if (part.type !== "literal") date[part.type] = part.value;
      return date;
    }, {});
  const date = `${localDate.year}-${localDate.month}-${localDate.day}`;

  return date >= from && date <= to;
}
