import { createApp, createReadinessState } from "./app.js";
import { HelpdeskClient } from "./helpdesk.js";
import { HelpdeskDataService } from "./services/helpdeskDataService.js";
import { SlaReportService } from "./services/slaReportService.js";

const port = Number(process.env.PORT || 8080);
const helpdeskClient = new HelpdeskClient();
const helpdeskDataService = new HelpdeskDataService({ client: helpdeskClient });
const slaReportService = new SlaReportService(helpdeskDataService);
const readiness = createReadinessState();

const server = createApp({ slaReportService, readiness }).listen(
  port,
  "0.0.0.0",
  () => {
    console.log(`listening on http://0.0.0.0:${port}`);
    initialize();
  },
);

async function initialize() {
  try {
    const { from, to } = readinessRange();
    await slaReportService.initialize(from, to);
    readiness.markReady();
    console.log(`ready for reports from ${from} through ${to}`);
  } catch (error) {
    readiness.markNotReady();
    console.error("application initialization failed", error);
  }
}

function readinessRange(now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const fromDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, now.getUTCDate()),
  );
  const from = fromDate.toISOString().slice(0, 10);
  return { from, to };
}
