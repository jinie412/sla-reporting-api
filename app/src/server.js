import { createApp } from "./app.js";
import { HelpdeskClient } from "./helpdesk.js";
import { HelpdeskDataService } from "./services/helpdeskDataService.js";
import { SlaReportService } from "./services/slaReportService.js";

const port = Number(process.env.PORT || 8080);
const helpdeskClient = new HelpdeskClient();
const helpdeskDataService = new HelpdeskDataService({ client: helpdeskClient });
const slaReportService = new SlaReportService(helpdeskDataService);

createApp({ slaReportService }).listen(port, "0.0.0.0", () => {
  console.log(`listening on http://0.0.0.0:${port}`);
});
