import { calculateBusinessMinutes } from "./businessTime.js";
import { processRequestEvents } from "./eventProcessor.js";

import { TARGET_MINUTES } from "../constants/constant.js";

export function calculateSla(request, events, site, holidays, staff) {
  const { responderId, responder, responseAt, completedAt, dueAt } =
    processRequestEvents(events, staff);
  const responseBusinessMinutes =
    responseAt === null
      ? null
      : calculateBusinessMinutes({
          startAt: request.created_at,
          endAt: responseAt,
          site,
          holidays,
        });

  const target = TARGET_MINUTES[request.priority] ?? TARGET_MINUTES.Low;
  const deadline =
    dueAt === null ? NaN : localDeadlineTimestamp(dueAt, site.timezone);

  return {
    id: request.id,
    site_id: request.site_id,
    responder_id: responderId,
    responder,
    response_business_minutes: responseBusinessMinutes,
    within_target:
      responseBusinessMinutes === null
        ? null
        : responseBusinessMinutes <= target,
    completed_late:
      completedAt === null || !Number.isFinite(deadline)
        ? null
        : completedAt > deadline,
  };
}

function localDeadlineTimestamp(value, timeZone) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value,
  );
  if (!match || !timeZone) return NaN;

  const [, day, month, year, hour, minute, second = "0"] = match;
  const target = Date.UTC(year, Number(month) - 1, day, hour, minute, second);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  let timestamp = target;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = formatter.formatToParts(new Date(timestamp));
    const observed = {};
    for (const part of parts) {
      if (part.type !== "literal") observed[part.type] = part.value;
    }
    timestamp +=
      target -
      Date.UTC(
        observed.year,
        Number(observed.month) - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
      );
  }

  return timestamp / 1000;
}
