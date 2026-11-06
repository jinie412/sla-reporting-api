import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateDateRange } from "./utils/dateValidation.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ slaReportService, readiness } = {}) {
  const app = express();
  const readinessState = readiness ?? createReadinessState();

  app.use(express.static(path.join(here, "..", "public")));

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.get("/ready", (req, res) => {
    const ready = readinessState.isReady();
    res.status(ready ? 200 : 503).json({ ready });
  });

  app.get("/api/requests", (req, res) => {
    // TODO (level 4): filters, sorting and cursor pagination, see docs/contract.md.
    res.status(501).json({ error: "not implemented" });
  });

  app.get("/api/sla-report", async (req, res) => {
    const { from, to } = req.query;
    const validation = validateDateRange(from, to);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    if (!slaReportService || typeof slaReportService.generate !== "function") {
      return res.status(503).json({ error: "SLA report service is unavailable" });
    }

    try {
      const report = await slaReportService.generate(from, to);
      res.json(report);
    } catch (error) {
      res.status(502).json({ error: "unable to generate SLA report" });
    }
  });

  return app;
}

export function createReadinessState() {
  let ready = false;
  return {
    isReady: () => ready,
    markReady: () => {
      ready = true;
    },
    markNotReady: () => {
      ready = false;
    },
  };
}
