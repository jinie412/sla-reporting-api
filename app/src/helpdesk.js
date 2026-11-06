import { MAX_RETRIES } from "./constants/constant.js"; 

export class HelpdeskApiError extends Error {
  constructor(message, { status, pathname } = {}) {
    super(message);
    this.name = "HelpdeskApiError";
    this.status = status;
    this.pathname = pathname;
  }
}

export class HelpdeskClient {
  constructor({
    baseUrl = process.env.HELPDESK_URL || "http://localhost:4010",
    token = process.env.HELPDESK_TOKEN || "",
    maxRetries = MAX_RETRIES,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {}) {
    if (!baseUrl || !token) {
      throw new Error("HELPDESK_URL and HELPDESK_TOKEN are required");
    }
    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new Error("maxRetries must be a non-negative integer");
    }

    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.token = token;
    this.maxRetries = maxRetries;
    this.sleep = sleep;
  }

  // GET a path (e.g. "/some/endpoint") with optional query params; returns parsed JSON.
  async get(pathname, params = {}) {
    const url = new URL(this.baseUrl + pathname);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(
          key,
          Array.isArray(value) ? JSON.stringify(value) : String(value),
        );
      }
    }

    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
      });

      if (res.ok) {
        try {
          return await res.json();
        } catch {
          throw new HelpdeskApiError(
            `Helpdesk API GET ${pathname} returned invalid JSON`,
            { status: res.status, pathname },
          );
        }
      }

      if (res.status === 429 && attempt < this.maxRetries) {
        await this.sleep(this.#retryAfterMilliseconds(res.headers, attempt));
        continue;
      }

      throw new HelpdeskApiError(
        `Helpdesk API GET ${pathname} failed with HTTP ${res.status}`,
        { status: res.status, pathname },
      );
    }
  }

  #retryAfterMilliseconds(headers, attempt) {
    const retryAfter = headers.get("retry-after");
    if (!retryAfter) {
      return 1000 * 2 ** attempt;
    }

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const date = Date.parse(retryAfter);
    return Number.isNaN(date)
      ? 1000 * 2 ** attempt
      : Math.max(0, date - Date.now());
  }
}
