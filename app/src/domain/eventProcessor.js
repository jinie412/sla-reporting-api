export function processRequestEvents(events, staff) {
  const revertedIds = new Set();
  const orderedEvents = [...(events ?? [])].sort(compareEvents);

  for (const event of orderedEvents) {
    if (event?.reverts_id !== null && event?.reverts_id !== undefined) {
      revertedIds.add(String(event.id));
      revertedIds.add(String(event.reverts_id));
    }
  }

  const staffById = new Map();
  for (const member of staff ?? []) {
    if (member?.id !== null && member?.id !== undefined) {
      staffById.set(String(member.id), member.name);
    }
  }

  let firstResponse;
  let completedAt = null;
  let deadline = null;

  for (const event of orderedEvents) {
    if (!event || revertedIds.has(String(event.id))) continue;

    if (
      event.status === "processing" &&
      event.actor_id !== null &&
      event.actor_id !== undefined &&
      (!firstResponse || compareEvents(event, firstResponse) < 0)
    ) {
      firstResponse = event;
    }
    if (
      event.status === "complete" &&
      (completedAt === null || event.at >= completedAt)
    ) {
      completedAt = event.at;
    }
    if (
      event.due_at != null &&
      (!deadline || compareEvents(event, deadline) >= 0)
    ) {
      deadline = { at: event.at, id: event.id, value: event.due_at };
    }

  }

  if (!firstResponse) {
    return { responderId: null, responder: null, responseAt: null, completedAt, dueAt: deadline?.value ?? null };
  }

  return {
    responderId: firstResponse.actor_id,
    responder: staffById.get(String(firstResponse.actor_id)) ?? null,
    responseAt: firstResponse.at,
    completedAt,
    dueAt: deadline?.value ?? null,
  };
}

function compareEvents(left, right) {
  const timeDifference = left.at - right.at;
  if (timeDifference !== 0) return timeDifference;
  return Number(left.id) - Number(right.id);
}
