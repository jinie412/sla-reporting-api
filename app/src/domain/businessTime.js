import { WEEKDAYS } from "../constants/constant.js";

export function calculateBusinessMinutes({ startAt, endAt, site, holidays }) {
  const start = toTimestamp(startAt);
  const end = toTimestamp(endAt);
  if (
    !site?.timezone ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return 0;
  }

  const formatter = getFormatter(site.timezone);
  const holidayDates = new Set(
    (holidays ?? [])
      .map((holiday) => normalizeDate(holiday?.date ?? holiday))
      .filter(Boolean),
  );
  let date = localDate(start, formatter);
  const lastDate = localDate(end, formatter);
  let totalMilliseconds = 0;

  while (date <= lastDate) {
    const hours =
      site.business_hours?.[
        WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
      ];
    if (hours && !holidayDates.has(date)) {
      const open = wallClockTimestamp(date, hours.open, formatter);
      const close = wallClockTimestamp(date, hours.close, formatter);
      if (Number.isFinite(open) && close > open) {
        totalMilliseconds += Math.max(
          0,
          Math.min(end, close) - Math.max(start, open),
        );
      }
    }
    date = nextDate(date);
  }

  return Math.floor(totalMilliseconds / 60_000);
}

const formatters = new Map();

function toTimestamp(value) {
  if (typeof value === "number") return value * 1000;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function getFormatter(timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

function partsAt(timestamp, formatter) {
  return formatter.formatToParts(new Date(timestamp)).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
}

function localDate(timestamp, formatter) {
  const parts = partsAt(timestamp, formatter);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function wallClockTimestamp(date, time, formatter) {
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(time ?? "")) return NaN;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute, second);
  let timestamp = target;

  // Convert the desired local wall-clock time to an instant, including DST offsets.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = partsAt(timestamp, formatter);
    const observed = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    timestamp += target - observed;
  }
  return timestamp;
}

function nextDate(date) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

function normalizeDate(value) {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
}
