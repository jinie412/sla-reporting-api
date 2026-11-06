(() => {
  // Application State
  const state = {
    report: null,
    lastRawJson: null,
    lastEndpoint: "",
    // Responders table sort
    responderSortField: "requests",
    responderSortDir: "desc",
    // Requests table filter & sort & pagination
    filters: {
      search: "",
      siteId: "",
      responderId: "",
      withinTarget: "",
      completedLate: "",
    },
    requestSortField: "id",
    requestSortDir: "asc",
    currentPage: 1,
    pageSize: 50,
    // Browse tab cursor state
    browseNextCursor: null,
    browseBaseParams: null,
  };

  // DOM References
  const els = {
    healthPill: document.getElementById("health-pill"),
    healthText: document.getElementById("health-text"),
    readyPill: document.getElementById("ready-pill"),
    readyText: document.getElementById("ready-text"),
    refreshStatusBtn: document.getElementById("refresh-status-btn"),

    tabBtns: document.querySelectorAll(".tab-btn"),
    reportView: document.getElementById("report-view"),
    browseView: document.getElementById("browse-view"),

    toggleJsonBtn: document.getElementById("toggle-json-btn"),
    exportCsvBtn: document.getElementById("export-csv-btn"),
    jsonDrawer: document.getElementById("json-drawer"),
    jsonEndpointLabel: document.getElementById("json-endpoint-label"),
    jsonOutput: document.getElementById("json-output"),
    copyJsonBtn: document.getElementById("copy-json-btn"),

    statusBanner: document.getElementById("status-banner"),
    statusText: document.getElementById("status"),
    latencyBadge: document.getElementById("latency-badge"),

    form: document.getElementById("f"),
    fromInput: document.getElementById("from-input"),
    toInput: document.getElementById("to-input"),
    runBtn: document.getElementById("run-btn"),
    presetBtns: document.querySelectorAll(".preset-btn"),

    // KPIs
    kpiTotal: document.getElementById("kpi-total-requests"),
    kpiDateRange: document.getElementById("kpi-date-range"),
    kpiResponded: document.getElementById("kpi-responded"),
    kpiUnresponded: document.getElementById("kpi-unresponded"),
    kpiRespondedBar: document.getElementById("kpi-responded-bar"),
    kpiWithinTarget: document.getElementById("kpi-within-target"),
    kpiWithinTargetSub: document.getElementById("kpi-within-target-sub"),
    kpiTargetBar: document.getElementById("kpi-target-bar"),
    kpiCompletedLate: document.getElementById("kpi-completed-late"),
    kpiCompletedLateSub: document.getElementById("kpi-completed-late-sub"),
    kpiLateBar: document.getElementById("kpi-late-bar"),
    kpiAvgMinutes: document.getElementById("kpi-avg-minutes"),
    kpiMedianMinutes: document.getElementById("kpi-median-minutes"),

    // Responders Table
    respondersCountBadge: document.getElementById("responders-count-badge"),
    respondersTbody: document.getElementById("responders-tbody"),
    clearResponderFilterBtn: document.getElementById("clear-responder-filter-btn"),
    responderSortHeaders: document.querySelectorAll("[data-res-sort]"),

    // Requests Table & Filters
    requestsCountBadge: document.getElementById("requests-count-badge"),
    requestsTbody: document.getElementById("requests-tbody"),
    requestSortHeaders: document.querySelectorAll("[data-req-sort]"),
    filterSearch: document.getElementById("filter-search"),
    filterSite: document.getElementById("filter-site"),
    filterResponder: document.getElementById("filter-responder"),
    filterTarget: document.getElementById("filter-target"),
    filterLate: document.getElementById("filter-late"),
    pageSizeSelect: document.getElementById("page-size-select"),
    resetFiltersBtn: document.getElementById("reset-filters-btn"),
    paginationInfo: document.getElementById("pagination-info"),
    pageIndicator: document.getElementById("page-indicator"),
    prevPageBtn: document.getElementById("prev-page-btn"),
    nextPageBtn: document.getElementById("next-page-btn"),

    // Browse Tab (Level 4)
    browseForm: document.getElementById("browse-form"),
    browseRunBtn: document.getElementById("browse-run-btn"),
    browseCountBadge: document.getElementById("browse-count-badge"),
    browseCursorDisplay: document.getElementById("browse-cursor-display"),
    browseResetCursorBtn: document.getElementById("browse-reset-cursor-btn"),
    browseNextCursorBtn: document.getElementById("browse-next-cursor-btn"),
    browseTbody: document.getElementById("browse-tbody"),
  };

  // ==================== SYSTEM HEALTH & READY ====================
  async function checkSystemStatus() {
    try {
      const hRes = await fetch("/health");
      const hData = await hRes.json().catch(() => ({}));
      if (hRes.ok && hData.ok) {
        els.healthPill.className = "status-pill ok";
        els.healthText.textContent = "Health: 200 OK";
      } else {
        els.healthPill.className = "status-pill err";
        els.healthText.textContent = `Health: ${hRes.status}`;
      }
    } catch {
      els.healthPill.className = "status-pill err";
      els.healthText.textContent = "Health: Offline";
    }

    try {
      const rRes = await fetch("/ready");
      const rData = await rRes.json().catch(() => ({}));
      if (rRes.ok && rData.ready) {
        els.readyPill.className = "status-pill ok";
        els.readyText.textContent = "Ready: true (200)";
      } else {
        els.readyPill.className = "status-pill warn";
        els.readyText.textContent = `Ready: Warming up (${rRes.status})`;
        setTimeout(checkSystemStatus, 3000);
      }
    } catch {
      els.readyPill.className = "status-pill err";
      els.readyText.textContent = "Ready: Offline";
    }
  }

  // ==================== FORMATTERS ====================
  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatMinutes(minutes) {
    if (minutes === null || minutes === undefined) {
      return '<span class="badge badge-neutral">null</span>';
    }
    const num = Number(minutes);
    if (!Number.isFinite(num)) return escapeHtml(minutes);
    if (num < 60) {
      return `<span class="mono"><strong>${num}</strong> min</span>`;
    }
    const hrs = Math.floor(num / 60);
    const rem = num % 60;
    const human = rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
    return `<span class="mono"><strong>${num}</strong> min <span style="color: var(--text-muted)">(${human})</span></span>`;
  }

  function formatWithinTargetBadge(val) {
    if (val === true) {
      return '<span class="badge badge-success">✓ Within Target (true)</span>';
    }
    if (val === false) {
      return '<span class="badge badge-danger">✕ Missed Target (false)</span>';
    }
    return '<span class="badge badge-neutral">— No Response (null)</span>';
  }

  function formatCompletedLateBadge(val) {
    if (val === true) {
      return '<span class="badge badge-danger">⚠ Completed Late (true)</span>';
    }
    if (val === false) {
      return '<span class="badge badge-success">✓ On Time (false)</span>';
    }
    return '<span class="badge badge-neutral">— N/A (null)</span>';
  }

  function showStatusBanner(message, isError = false, elapsedMs = null) {
    els.statusBanner.classList.remove("hidden", "error", "success");
    els.statusBanner.classList.add(isError ? "error" : "success");
    els.statusText.textContent = message;

    if (elapsedMs !== null) {
      els.latencyBadge.classList.remove("hidden");
      els.latencyBadge.textContent =
        elapsedMs >= 1000
          ? `${(elapsedMs / 1000).toFixed(2)} s`
          : `${Math.round(elapsedMs)} ms`;
    } else {
      els.latencyBadge.classList.add("hidden");
    }
  }

  function updateRawJsonDrawer(endpoint, data) {
    state.lastEndpoint = endpoint;
    state.lastRawJson = data;
    els.jsonEndpointLabel.textContent = endpoint;
    els.jsonOutput.textContent = JSON.stringify(data, null, 2);
  }

  // ==================== SLA REPORT FETCH & RENDER ====================
  async function fetchSlaReport(from, to) {
    const params = new URLSearchParams({ from, to });
    const endpoint = `/api/sla-report?${params.toString()}`;

    els.runBtn.disabled = true;
    els.runBtn.innerHTML = '<span class="spinner"></span><span>Running...</span>';
    showStatusBanner(`Fetching ${endpoint} ...`, false, null);

    const t0 = performance.now();
    try {
      const res = await fetch(endpoint);
      const elapsed = performance.now() - t0;
      const data = await res.json().catch(() => ({ error: "Invalid JSON response" }));

      updateRawJsonDrawer(`${res.status} GET ${endpoint}`, data);

      if (!res.ok) {
        const errMsg = data && data.error ? data.error : `HTTP ${res.status}`;
        showStatusBanner(`Error ${res.status}: ${errMsg}`, true, elapsed);
        return;
      }

      state.report = data;
      state.currentPage = 1;
      els.exportCsvBtn.disabled = !(Array.isArray(data.requests) && data.requests.length > 0);

      showStatusBanner(
        `200 OK — Loaded ${data.requests?.length ?? 0} requests and ${data.responders?.length ?? 0} responders for ${data.from} to ${data.to}`,
        false,
        elapsed
      );

      populateFilterDropdowns(data);
      renderKpis(data);
      renderRespondersTable();
      renderRequestsTable();
    } catch (err) {
      const elapsed = performance.now() - t0;
      showStatusBanner(`Network error: ${err.message}`, true, elapsed);
    } finally {
      els.runBtn.disabled = false;
      els.runBtn.innerHTML = "<span>Run Report</span>";
    }
  }

  function populateFilterDropdowns(report) {
    const requests = Array.isArray(report.requests) ? report.requests : [];
    const sites = [...new Set(requests.map((r) => r.site_id).filter((v) => v !== null && v !== undefined))].sort(
      (a, b) => Number(a) - Number(b)
    );

    const currentSite = state.filters.siteId;
    els.filterSite.innerHTML = '<option value="">All Sites</option>';
    for (const s of sites) {
      const opt = document.createElement("option");
      opt.value = String(s);
      opt.textContent = `Site #${s}`;
      els.filterSite.appendChild(opt);
    }
    if (sites.map(String).includes(currentSite)) {
      els.filterSite.value = currentSite;
    } else {
      state.filters.siteId = "";
    }

    const respondersMap = new Map();
    for (const r of requests) {
      if (r.responder_id !== null && r.responder_id !== undefined) {
        respondersMap.set(String(r.responder_id), r.responder || `Staff #${r.responder_id}`);
      }
    }
    const sortedResponders = [...respondersMap.entries()].sort((a, b) => a[1].localeCompare(b[1]));

    const currentResp = state.filters.responderId;
    els.filterResponder.innerHTML = `
      <option value="">All Responders</option>
      <option value="__null__">Unresponded (null)</option>
    `;
    for (const [id, name] of sortedResponders) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = `${name} (#${id})`;
      els.filterResponder.appendChild(opt);
    }
    if (currentResp === "__null__" || respondersMap.has(currentResp)) {
      els.filterResponder.value = currentResp;
    } else {
      state.filters.responderId = "";
    }
    updateClearResponderButton();
  }

  function renderKpis(report) {
    const requests = Array.isArray(report.requests) ? report.requests : [];
    const total = requests.length;
    const respondedRows = requests.filter((r) => r.responder_id !== null);
    const respondedCount = respondedRows.length;
    const unrespondedCount = total - respondedCount;

    const withinTargetCount = requests.filter((r) => r.within_target === true).length;
    const missedTargetCount = requests.filter((r) => r.within_target === false).length;

    const completedEvalRows = requests.filter((r) => r.completed_late !== null);
    const completedLateCount = requests.filter((r) => r.completed_late === true).length;
    const completedOnTimeCount = requests.filter((r) => r.completed_late === false).length;

    const validMinutes = respondedRows
      .map((r) => r.response_business_minutes)
      .filter((m) => typeof m === "number" && Number.isFinite(m))
      .sort((a, b) => a - b);

    const avgMin =
      validMinutes.length > 0
        ? (validMinutes.reduce((acc, v) => acc + v, 0) / validMinutes.length).toFixed(1)
        : null;

    let medianMin = null;
    if (validMinutes.length > 0) {
      const mid = Math.floor(validMinutes.length / 2);
      medianMin =
        validMinutes.length % 2 !== 0
          ? validMinutes[mid]
          : ((validMinutes[mid - 1] + validMinutes[mid]) / 2).toFixed(1);
    }

    const respondedPct = total > 0 ? Math.round((respondedCount / total) * 100) : 0;
    const targetPct = respondedCount > 0 ? Math.round((withinTargetCount / respondedCount) * 100) : 0;
    const latePct =
      completedEvalRows.length > 0
        ? Math.round((completedLateCount / completedEvalRows.length) * 100)
        : 0;

    els.kpiTotal.textContent = total.toLocaleString();
    els.kpiDateRange.textContent = `Range: ${report.from} → ${report.to}`;

    els.kpiResponded.textContent = `${respondedCount.toLocaleString()} (${respondedPct}%)`;
    els.kpiUnresponded.textContent = `${unrespondedCount.toLocaleString()} without first response`;
    els.kpiRespondedBar.style.width = `${respondedPct}%`;

    els.kpiWithinTarget.textContent =
      respondedCount > 0 ? `${withinTargetCount.toLocaleString()} (${targetPct}%)` : "0 (—)";
    els.kpiWithinTargetSub.textContent = `${withinTargetCount} met target · ${missedTargetCount} missed`;
    els.kpiTargetBar.style.width = `${targetPct}%`;

    els.kpiCompletedLate.textContent = `${completedLateCount.toLocaleString()}`;
    els.kpiCompletedLateSub.textContent = `${completedLateCount} late · ${completedOnTimeCount} on time`;
    els.kpiLateBar.style.width = `${latePct}%`;

    els.kpiAvgMinutes.textContent = avgMin !== null ? `${avgMin}m` : "—";
    els.kpiMedianMinutes.textContent =
      medianMin !== null ? `Median: ${medianMin}m across ${validMinutes.length} responses` : "No responded requests";
  }

  // ==================== RESPONDERS TABLE ====================
  function renderRespondersTable() {
    if (!state.report || !Array.isArray(state.report.responders)) return;
    const responders = [...state.report.responders];
    els.respondersCountBadge.textContent = `${responders.length} responder${responders.length === 1 ? "" : "s"}`;

    if (responders.length === 0) {
      els.respondersTbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <div class="empty-state-title">No responders in this date range</div>
            <div class="empty-state-desc">No eligible requests had a first response event.</div>
          </td>
        </tr>
      `;
      return;
    }

    const dir = state.responderSortDir === "asc" ? 1 : -1;
    const field = state.responderSortField;

    responders.sort((a, b) => {
      let va, vb;
      if (field === "within_rate") {
        va = a.requests > 0 ? a.within_target / a.requests : 0;
        vb = b.requests > 0 ? b.within_target / b.requests : 0;
      } else {
        va = a[field];
        vb = b[field];
      }
      if (typeof va === "string" && typeof vb === "string") {
        const cmp = va.localeCompare(vb);
        return cmp !== 0 ? cmp * dir : (a.id - b.id);
      }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return Number(a.id) - Number(b.id);
    });

    els.respondersTbody.innerHTML = responders
      .map((r) => {
        const rate = r.requests > 0 ? Math.round((r.within_target / r.requests) * 100) : 0;
        const isSelected = String(state.filters.responderId) === String(r.id);
        return `
          <tr class="clickable-row ${isSelected ? "active-filter-row" : ""}" data-responder-id="${escapeHtml(r.id)}" title="Click to filter requests by ${escapeHtml(r.name)}">
            <td class="mono">#${escapeHtml(r.id)}</td>
            <td><strong>${escapeHtml(r.name)}</strong></td>
            <td class="mono">${escapeHtml(r.requests)}</td>
            <td class="mono">${escapeHtml(r.within_target)} / ${escapeHtml(r.requests)}</td>
            <td>
              <div class="inline-rate">
                <div class="inline-rate-bar">
                  <div class="inline-rate-fill" style="width: ${rate}%"></div>
                </div>
                <span class="mono" style="min-width: 38px;">${rate}%</span>
              </div>
            </td>
            <td>
              ${
                r.completed_late > 0
                  ? `<span class="badge badge-danger">${escapeHtml(r.completed_late)} late</span>`
                  : `<span class="badge badge-success">0 late</span>`
              }
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function updateClearResponderButton() {
    if (state.filters.responderId) {
      els.clearResponderFilterBtn.classList.remove("hidden");
    } else {
      els.clearResponderFilterBtn.classList.add("hidden");
    }
  }

  // ==================== REQUESTS TABLE ====================
  function getFilteredAndSortedRequests() {
    if (!state.report || !Array.isArray(state.report.requests)) return [];
    const { search, siteId, responderId, withinTarget, completedLate } = state.filters;
    const q = search.trim().toLowerCase();

    const filtered = state.report.requests.filter((r) => {
      if (q) {
        const idMatch = String(r.id).toLowerCase().includes(q);
        const respMatch = r.responder && String(r.responder).toLowerCase().includes(q);
        if (!idMatch && !respMatch) return false;
      }
      if (siteId && String(r.site_id) !== siteId) return false;
      if (responderId) {
        if (responderId === "__null__") {
          if (r.responder_id !== null) return false;
        } else if (String(r.responder_id) !== responderId) {
          return false;
        }
      }
      if (withinTarget) {
        if (withinTarget === "null" && r.within_target !== null) return false;
        if (withinTarget === "true" && r.within_target !== true) return false;
        if (withinTarget === "false" && r.within_target !== false) return false;
      }
      if (completedLate) {
        if (completedLate === "null" && r.completed_late !== null) return false;
        if (completedLate === "true" && r.completed_late !== true) return false;
        if (completedLate === "false" && r.completed_late !== false) return false;
      }
      return true;
    });

    const field = state.requestSortField;
    const dir = state.requestSortDir === "asc" ? 1 : -1;

    // Sort with nulls last, ties broken by id ascending (matching docs/contract.md)
    filtered.sort((a, b) => {
      const va = a[field];
      const vb = b[field];
      const aNull = va === null || va === undefined;
      const bNull = vb === null || vb === undefined;
      if (aNull && bNull) return Number(a.id) - Number(b.id);
      if (aNull) return 1;
      if (bNull) return -1;

      if (typeof va === "string" && typeof vb === "string") {
        const cmp = va.localeCompare(vb);
        if (cmp !== 0) return cmp * dir;
      } else if (va < vb) {
        return -1 * dir;
      } else if (va > vb) {
        return 1 * dir;
      }
      return Number(a.id) - Number(b.id);
    });

    return filtered;
  }

  function renderRequestsTable() {
    if (!state.report || !Array.isArray(state.report.requests)) return;
    const allTotal = state.report.requests.length;
    const filtered = getFilteredAndSortedRequests();
    const totalFiltered = filtered.length;

    els.requestsCountBadge.textContent =
      totalFiltered === allTotal
        ? `${allTotal} requests`
        : `${totalFiltered} of ${allTotal} requests`;

    const totalPages = Math.max(1, Math.ceil(totalFiltered / state.pageSize));
    if (state.currentPage > totalPages) state.currentPage = totalPages;
    if (state.currentPage < 1) state.currentPage = 1;

    const startIdx = (state.currentPage - 1) * state.pageSize;
    const pageRows = filtered.slice(startIdx, startIdx + state.pageSize);

    if (pageRows.length === 0) {
      els.requestsTbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-state">
            <div class="empty-state-title">No matching requests</div>
            <div class="empty-state-desc">Try clearing or adjusting your active search and filter criteria.</div>
          </td>
        </tr>
      `;
    } else {
      els.requestsTbody.innerHTML = pageRows
        .map((r) => {
          const responderCell =
            r.responder_id !== null
              ? `<strong>${escapeHtml(r.responder)}</strong> <span class="mono" style="color: var(--text-muted)">(#${escapeHtml(r.responder_id)})</span>`
              : '<span class="badge badge-neutral">Unassigned / No Response (null)</span>';

          return `
            <tr>
              <td class="mono"><strong>#${escapeHtml(r.id)}</strong></td>
              <td class="mono">Site #${escapeHtml(r.site_id)}</td>
              <td>${responderCell}</td>
              <td>${formatMinutes(r.response_business_minutes)}</td>
              <td>${formatWithinTargetBadge(r.within_target)}</td>
              <td>${formatCompletedLateBadge(r.completed_late)}</td>
            </tr>
          `;
        })
        .join("");
    }

    const fromNum = totalFiltered === 0 ? 0 : startIdx + 1;
    const toNum = Math.min(startIdx + state.pageSize, totalFiltered);
    els.paginationInfo.textContent = `Showing ${fromNum}–${toNum} of ${totalFiltered} requests`;
    els.pageIndicator.textContent = `Page ${state.currentPage} of ${totalPages}`;
    els.prevPageBtn.disabled = state.currentPage <= 1;
    els.nextPageBtn.disabled = state.currentPage >= totalPages;
  }

  // ==================== CSV EXPORT ====================
  function exportToCsv() {
    const rows = getFilteredAndSortedRequests();
    if (!rows.length) return;

    const headers = [
      "id",
      "site_id",
      "responder_id",
      "responder",
      "response_business_minutes",
      "within_target",
      "completed_late",
    ];
    const csvLines = [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const val = r[h];
            if (val === null || val === undefined) return "";
            const str = String(val);
            return str.includes(",") || str.includes('"')
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(",")
      ),
    ];

    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sla-report-${state.report?.from || "from"}-to-${state.report?.to || "to"}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ==================== LEVEL 4 BROWSE API (/api/requests) ====================
  async function fetchBrowseRequests(cursor = null) {
    const formData = new FormData(els.browseForm);
    const params = new URLSearchParams();

    for (const [k, v] of formData.entries()) {
      if (v !== null && String(v).trim() !== "") {
        params.set(k, String(v).trim());
      }
    }
    if (cursor) {
      params.set("cursor", cursor);
    }

    const endpoint = `/api/requests?${params.toString()}`;
    els.browseRunBtn.disabled = true;
    showStatusBanner(`Fetching ${endpoint} ...`, false, null);

    const t0 = performance.now();
    try {
      const res = await fetch(endpoint);
      const elapsed = performance.now() - t0;
      const data = await res.json().catch(() => ({ error: "Invalid JSON response" }));

      updateRawJsonDrawer(`${res.status} GET ${endpoint}`, data);

      if (!res.ok) {
        const errMsg = data && data.error ? data.error : `HTTP ${res.status}`;
        showStatusBanner(`GET /api/requests returned ${res.status}: ${errMsg}`, true, elapsed);
        els.browseTbody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">
              <div class="empty-state-title">Endpoint returned HTTP ${res.status} (${escapeHtml(errMsg)})</div>
              <div class="empty-state-desc">Level 4 <code>GET /api/requests</code> is graded in Level 4 (see <code>docs/contract.md</code>).</div>
            </td>
          </tr>
        `;
        els.browseCountBadge.textContent = "0 rows";
        els.browseCursorDisplay.textContent = "next_cursor: null";
        els.browseNextCursorBtn.disabled = true;
        return;
      }

      const rows = Array.isArray(data.data) ? data.data : [];
      state.browseNextCursor = data.next_cursor || null;

      showStatusBanner(
        `200 OK — Loaded ${rows.length} rows from GET /api/requests`,
        false,
        elapsed
      );

      els.browseCountBadge.textContent = `${rows.length} rows`;
      els.browseCursorDisplay.textContent = `next_cursor: ${state.browseNextCursor ? state.browseNextCursor : "null"}`;
      els.browseNextCursorBtn.disabled = !state.browseNextCursor;
      els.browseResetCursorBtn.disabled = !cursor;

      if (rows.length === 0) {
        els.browseTbody.innerHTML = `
          <tr>
            <td colspan="6" class="empty-state">
              <div class="empty-state-title">No rows returned</div>
              <div class="empty-state-desc">No requests matched the filter parameters on this page.</div>
            </td>
          </tr>
        `;
      } else {
        els.browseTbody.innerHTML = rows
          .map((r) => {
            const responderCell =
              r.responder_id !== null
                ? `<strong>${escapeHtml(r.responder)}</strong> <span class="mono" style="color: var(--text-muted)">(#${escapeHtml(r.responder_id)})</span>`
                : '<span class="badge badge-neutral">Unassigned / No Response (null)</span>';
            return `
              <tr>
                <td class="mono"><strong>#${escapeHtml(r.id)}</strong></td>
                <td class="mono">Site #${escapeHtml(r.site_id)}</td>
                <td>${responderCell}</td>
                <td>${formatMinutes(r.response_business_minutes)}</td>
                <td>${formatWithinTargetBadge(r.within_target)}</td>
                <td>${formatCompletedLateBadge(r.completed_late)}</td>
              </tr>
            `;
          })
          .join("");
      }
    } catch (err) {
      const elapsed = performance.now() - t0;
      showStatusBanner(`Network error: ${err.message}`, true, elapsed);
    } finally {
      els.browseRunBtn.disabled = false;
    }
  }

  // ==================== EVENT LISTENERS ====================
  els.refreshStatusBtn.addEventListener("click", checkSystemStatus);

  // Mode Tabs
  els.tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      els.tabBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.getAttribute("data-tab");
      if (target === "report-view") {
        els.reportView.classList.remove("hidden");
        els.browseView.classList.add("hidden");
      } else {
        els.reportView.classList.add("hidden");
        els.browseView.classList.remove("hidden");
      }
    });
  });

  // Raw JSON Drawer Toggle & Copy
  els.toggleJsonBtn.addEventListener("click", () => {
    els.jsonDrawer.classList.toggle("hidden");
  });

  els.copyJsonBtn.addEventListener("click", async () => {
    if (!state.lastRawJson) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(state.lastRawJson, null, 2));
      els.copyJsonBtn.textContent = "Copied!";
      setTimeout(() => {
        els.copyJsonBtn.textContent = "Copy JSON";
      }, 1500);
    } catch {
      // ignore clipboard errors
    }
  });

  els.exportCsvBtn.addEventListener("click", exportToCsv);

  // SLA Report Form Submit
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    fetchSlaReport(els.fromInput.value, els.toInput.value);
  });

  // Quick Date Presets
  els.presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const from = btn.getAttribute("data-from");
      const to = btn.getAttribute("data-to");
      els.fromInput.value = from;
      els.toInput.value = to;
      fetchSlaReport(from, to);
    });
  });

  // Responders Table Sorting & Row Click
  els.responderSortHeaders.forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.getAttribute("data-res-sort");
      if (state.responderSortField === field) {
        state.responderSortDir = state.responderSortDir === "asc" ? "desc" : "asc";
      } else {
        state.responderSortField = field;
        state.responderSortDir = field === "name" || field === "id" ? "asc" : "desc";
      }
      renderRespondersTable();
    });
  });

  els.respondersTbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-responder-id]");
    if (!tr) return;
    const respId = tr.getAttribute("data-responder-id");
    if (state.filters.responderId === respId) {
      state.filters.responderId = "";
      els.filterResponder.value = "";
    } else {
      state.filters.responderId = respId;
      els.filterResponder.value = respId;
    }
    state.currentPage = 1;
    updateClearResponderButton();
    renderRespondersTable();
    renderRequestsTable();
  });

  els.clearResponderFilterBtn.addEventListener("click", () => {
    state.filters.responderId = "";
    els.filterResponder.value = "";
    state.currentPage = 1;
    updateClearResponderButton();
    renderRespondersTable();
    renderRequestsTable();
  });

  // Requests Table Filters & Sorting
  function onFilterChange() {
    state.filters.search = els.filterSearch.value;
    state.filters.siteId = els.filterSite.value;
    state.filters.responderId = els.filterResponder.value;
    state.filters.withinTarget = els.filterTarget.value;
    state.filters.completedLate = els.filterLate.value;
    state.currentPage = 1;
    updateClearResponderButton();
    renderRespondersTable();
    renderRequestsTable();
  }

  els.filterSearch.addEventListener("input", onFilterChange);
  els.filterSite.addEventListener("change", onFilterChange);
  els.filterResponder.addEventListener("change", onFilterChange);
  els.filterTarget.addEventListener("change", onFilterChange);
  els.filterLate.addEventListener("change", onFilterChange);

  els.pageSizeSelect.addEventListener("change", () => {
    state.pageSize = Number(els.pageSizeSelect.value) || 50;
    state.currentPage = 1;
    renderRequestsTable();
  });

  els.resetFiltersBtn.addEventListener("click", () => {
    els.filterSearch.value = "";
    els.filterSite.value = "";
    els.filterResponder.value = "";
    els.filterTarget.value = "";
    els.filterLate.value = "";
    onFilterChange();
  });

  els.requestSortHeaders.forEach((th) => {
    th.addEventListener("click", () => {
      const field = th.getAttribute("data-req-sort");
      if (state.requestSortField === field) {
        state.requestSortDir = state.requestSortDir === "asc" ? "desc" : "asc";
      } else {
        state.requestSortField = field;
        state.requestSortDir = "asc";
      }
      renderRequestsTable();
    });
  });

  els.prevPageBtn.addEventListener("click", () => {
    if (state.currentPage > 1) {
      state.currentPage -= 1;
      renderRequestsTable();
    }
  });

  els.nextPageBtn.addEventListener("click", () => {
    state.currentPage += 1;
    renderRequestsTable();
  });

  // Browse Form (Level 4)
  els.browseForm.addEventListener("submit", (e) => {
    e.preventDefault();
    fetchBrowseRequests(null);
  });

  els.browseNextCursorBtn.addEventListener("click", () => {
    if (state.browseNextCursor) {
      fetchBrowseRequests(state.browseNextCursor);
    }
  });

  els.browseResetCursorBtn.addEventListener("click", () => {
    fetchBrowseRequests(null);
  });

  // Initial Check on Load
  checkSystemStatus();
})();

