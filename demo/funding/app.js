(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const state = {
    scenarios: [],
    scenario: null,
    scopeData: null,
    preview: null,
    operation: null,
    operationId: null,
    correctionPreview: null,
    correctionOperationId: null,
    busy: false,
    faultArmed: null
  };

  const money = (cents) => {
    const amount = Number(cents ?? 0) / 100;
    return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 }).format(amount);
  };
  const safe = (value) => String(value ?? "—");
  const esc = (value) => safe(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const id = () => crypto.randomUUID();
  const scopePath = () => {
    const scope = state.scenario?.scope;
    return scope ? `/api/payment-funding/scopes/${encodeURIComponent(scope.kind)}/${encodeURIComponent(scope.id)}` : null;
  };
  const statusClass = (status) => {
    if (["applied", "authorized"].includes(status)) return "";
    if (["aborted", "failed"].includes(status)) return "danger";
    return "warn";
  };

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error(`Respuesta no legible del servicio (${response.status}).`); }
    if (!response.ok || payload?.ok === false) {
      const error = payload?.error || {};
      const failure = new Error(error.message || `No se pudo completar la acción (${response.status}).`);
      failure.code = error.code;
      failure.retryable = error.retryable;
      failure.operationId = error.operationId;
      failure.details = error.details;
      failure.status = response.status;
      throw failure;
    }
    return payload?.data;
  }
  const post = (url, body = {}) => request(url, { method: "POST", body });

  function setBusy(value) {
    state.busy = value;
    document.querySelectorAll("button, select").forEach((element) => {
      element.disabled = value || element.dataset.locked === "true";
    });
    syncButtons();
  }
  function showError(target, error) {
    const node = $(target);
    const extra = error?.operationId ? `<small>Operación: ${esc(error.operationId)}</small>` : "";
    const retry = error?.retryable ? " Se puede reintentar sin cambiar la operación." : "";
    node.innerHTML = `<strong>${esc(error?.code || "No se pudo completar")}</strong>${esc(error?.message || "Error inesperado.")}${esc(retry)}${extra}`;
    node.classList.add("visible");
  }
  function clearMessage(errorSelector, successSelector) {
    const error = $(errorSelector);
    const success = $(successSelector);
    error.classList.remove("visible");
    error.textContent = "";
    success.classList.remove("visible");
    success.textContent = "";
  }
  function showSuccess(target, text) {
    const node = $(target);
    node.textContent = text;
    node.classList.add("visible");
  }
  function syncButtons() {
    const scenario = state.scenario;
    const hasFunding = !!scenario?.request;
    $("#preview-button").disabled = state.busy || !hasFunding;
    $("#start-button").disabled = state.busy || !state.preview || !!state.operation;
    $("#fault-cae").disabled = state.busy || !state.operation || !["reserved"].includes(state.operation.status);
    $("#fault-link").disabled = state.busy || !state.operation || !["authorized_pending_link"].includes(state.operation.status);
    $("#correction-preview").disabled = state.busy || !scenario?.correctionRequest;
    $("#correction-confirm").disabled = state.busy || !state.correctionPreview;
    $("#scenario-select").disabled = state.busy;
  }
  function renderScenario() {
    const scenario = state.scenario;
    $("#scenario-description").textContent = scenario?.description || "Los casos disponibles vienen del servicio de demo.";
    $("#scope-badge").textContent = scenario?.scope ? `${scenario.scope.kind} · ${scenario.scope.id}` : "Ámbito pendiente";
    const requestBody = scenario?.request;
    const details = $("#request-details");
    if (!requestBody) {
      details.innerHTML = '<span class="request-tag">Este escenario no incluye FundingRequest</span>';
      $("#request-total").textContent = "—";
    } else {
      const applications = requestBody.applications || [];
      const collections = requestBody.newCollections || [];
      const tags = [
        `Documento ${safe(requestBody.documentId)}`,
        ...applications.map((item) => `${safe(item.receiptId)} → ${money(item.amountCents)}`),
        ...collections.map((item) => `Nuevo ${safe(item.rowId)} · ${safe(item.method)} · ${money(item.amountCents)}`)
      ];
      details.innerHTML = tags.length ? tags.map((tag) => `<span class="request-tag">${esc(tag)}</span>`).join("") : '<span class="request-tag">Sin líneas en el request</span>';
      const total = applications.reduce((sum, item) => sum + Number(item.amountCents || 0), 0)
        + collections.reduce((sum, item) => sum + Number(item.amountCents || 0), 0);
      $("#request-total").textContent = money(total);
    }
    const correction = scenario?.correctionRequest;
    const correctionDetails = $("#correction-details");
    if (!correction) {
      correctionDetails.innerHTML = '<span class="request-tag">Este escenario no incluye CorrectionRequest</span>';
      $("#correction-total").textContent = "—";
    } else {
      const flat = Object.entries(correction).flatMap(([key, value]) => {
        if (value && typeof value === "object") return [`${key}: ${JSON.stringify(value)}`];
        return [`${key}: ${safe(value)}`];
      });
      correctionDetails.innerHTML = flat.length
        ? flat.map((item) => `<span class="request-tag">${esc(item)}</span>`).join("")
        : '<span class="request-tag">Corrección preparada</span>';
      $("#correction-total").textContent = safe(correction.revision ?? correction.shiftId ?? "Preparada");
    }
    $("#correction-panel").hidden = !correction;
    syncButtons();
  }
  function renderScope() {
    const data = state.scopeData;
    if (!data) return;
    const receipts = data.receipts || [];
    const documents = data.documents || [];
    $("#debt-value").textContent = money(data.debtCents);
    $("#debt-caption").textContent = state.scenario?.scope?.kind === "reservation"
      ? `La reserva tiene ${money(data.debtCents)} pendientes de cobro.`
      : `La cuenta SPA registra ${money(data.debtCents)} pendientes de cobro.`;
    $("#receipt-count").textContent = String(receipts.length);
    $("#document-count").textContent = String(documents.length);

    $("#receipts-body").innerHTML = receipts.length ? receipts.map((receipt) => `
      <tr>
        <td><span class="receipt-id">${esc(receipt.id)}</span><span class="source-id">Origen ${esc(receipt.sourcePaymentId)}</span></td>
        <td><span class="method-chip">${esc(receipt.method)}</span></td>
        <td><span class="amount-strong">${money(receipt.amountCents)}</span></td>
        <td><span class="amount-strong">${money(receipt.appliedCents)}</span></td>
        <td><span class="amount-strong">${money(receipt.heldCents)}</span></td>
        <td><span class="amount-strong">${money(receipt.freeCents)}</span></td>
      </tr>`).join("") : '<tr><td class="empty-row" colspan="6">No hay recibos en este ámbito.</td></tr>';

    $("#documents-list").innerHTML = documents.length ? documents.map((doc) => `
      <div class="doc-row"><div><span class="doc-name">${esc(doc.id)}</span><span class="doc-total">Total ${money(doc.totalCents)}</span></div>
      <span class="status-chip ${statusClass(doc.status)}">${esc(doc.status)}</span></div>`).join("")
      : '<p class="no-data">No hay documentos registrados.</p>';
    const operations = data.operations || [];
    $("#operations-list").innerHTML = operations.length ? operations.map((op) => `
      <div class="op-item"><div class="op-top"><span class="op-id">${esc(op.id)}</span><span class="status-chip ${statusClass(op.status)}">${esc(op.status)}</span></div>
      <p class="op-invoice">${op.invoice ? `Factura ${esc(op.invoice.invoiceId)} · CAE ${esc(op.invoice.cae)}` : "Factura aún sin vincular"}</p>
      ${op.lastError ? `<p class="op-error">${esc(op.lastError)}</p>` : ""}
      <button class="btn small" type="button" data-load-operation="${esc(op.id)}">Abrir / recuperar operación</button></div>`).join("")
      : '<p class="no-data">No hay operaciones anteriores en este ámbito.</p>';
    $("#operations-list").querySelectorAll("[data-load-operation]").forEach(button => {
      button.addEventListener("click", async () => {
        if (state.busy) return;
        setBusy(true);
        try {
          const operation = await request(`/api/payment-funding/operations/${encodeURIComponent(button.dataset.loadOperation)}`);
          renderOperation(operation);
        } catch (error) { showError("#error-alert", error); }
        finally { setBusy(false); }
      });
    });
    renderRectifications(data.rectifications || []);
    renderEvents(data.events || []);
  }
  function renderRectifications(rows) {
    $("#rectifications-list").innerHTML = rows.length ? rows.map((row) => {
      const delta = row.delta && typeof row.delta === "object"
        ? Object.entries(row.delta).map(([method, amount]) => `${method} ${money(amount)}`).join(" · ")
        : money(row.delta);
      const expected = row.expectedAfter && typeof row.expectedAfter === "object"
        ? Object.entries(row.expectedAfter).map(([method, amount]) => `${method} ${money(amount)}`).join(" · ")
        : money(row.expectedAfter);
      return `<div class="audit-item"><div class="audit-rev">Turno ${esc(row.shiftId)}<br>Rev. ${esc(row.revision)}</div><div>
        <p class="audit-reason">${esc(row.reason)}</p>
        <div class="audit-values"><span>Delta esperado: ${esc(delta)}</span><span>Esperado después: ${esc(expected)}</span><span>Conteo físico original: ${row.physicalCountCents == null ? "No verificable" : money(row.physicalCountCents)}</span></div>
      </div></div>`;
    }).join("") : '<p class="no-data">No hay rectificaciones de turno registradas.</p>';
  }
  function renderEvents(events) {
    $("#events-list").innerHTML = events.length ? events.map((event) => {
      const type = event.type || event.event || event.kind || "evento";
      const description = event.description || event.message || event.reason || (event.payload ? JSON.stringify(event.payload) : event.operationId || "");
      return `<article class="event-item"><span class="event-type">${esc(type)}</span><p class="event-desc">${esc(description)}</p></article>`;
    }).join("") : '<p class="no-data">No hay eventos de auditoría registrados.</p>';
  }
  function renderOperation(operation) {
    if (!operation) return;
    state.operation = operation;
    if (operation.id) state.operationId = operation.id;
    $("#operation-focus").hidden = false;
    $("#active-operation-id").textContent = state.operationId || operation.id || "—";
    const status = $("#active-operation-status");
    status.textContent = safe(operation.status);
    status.className = `status-chip ${statusClass(operation.status)}`;
    const actions = [];
    if (operation.status === "reserved") actions.push('<button class="btn small" data-op-action="authorize" type="button">Autorizar emisor simulado</button>');
    if (operation.status === "authorized_pending_link") actions.push('<button class="btn small" data-op-action="finalize" type="button">Finalizar vínculo</button>');
    if (["authorizing", "fiscal_unknown"].includes(operation.status)) actions.push('<button class="btn small" data-op-action="resume" type="button">Recuperar esta operación</button>');
    if (operation.status === "reserved") actions.push('<button class="btn small caution" data-op-action="abort" type="button">Abortar reserva</button>');
    if (operation.status === "applied" || operation.status === "aborted") {
      actions.push('<button class="btn small secondary" data-op-action="refresh" type="button">Consultar estado persistido</button>');
    }
    $("#operation-actions").innerHTML = actions.join("");
    $("#start-button").textContent = operation.status === "applied" ? "Operación aplicada" : "Operación en curso";
    $("#start-button").disabled = true;
    syncButtons();
  }
  async function refreshScope() {
    const path = scopePath();
    if (!path) return;
    state.scopeData = await request(path);
    renderScope();
  }
  async function loadScenario(idValue) {
    state.scenario = state.scenarios.find((item) => String(item.id) === idValue) || null;
    state.scopeData = null;
    state.preview = null;
    state.operation = null;
    state.operationId = null;
    state.correctionPreview = null;
    state.correctionOperationId = null;
    state.faultArmed = null;
    $("#operation-focus").hidden = true;
    clearMessage("#error-alert", "#success-message");
    clearMessage("#correction-error", "#correction-success");
    renderScenario();
    if (!state.scenario) return;
    setBusy(true);
    try { await refreshScope(); }
    catch (error) { showError("#error-alert", error); }
    finally { setBusy(false); renderScenario(); }
  }
  async function loadScenarios() {
    try {
      const result = await request("/api/demo/scenarios");
      state.scenarios = Array.isArray(result) ? result : [];
      const select = $("#scenario-select");
      select.innerHTML = state.scenarios.length
        ? state.scenarios.map((scenario) => `<option value="${esc(scenario.id)}">${esc(scenario.title)}</option>`).join("")
        : '<option value="">No hay escenarios disponibles</option>';
      if (state.scenarios.length) await loadScenario(String(state.scenarios[0].id));
    } catch (error) {
      $("#scenario-select").innerHTML = '<option value="">No se pudieron cargar escenarios</option>';
      showError("#error-alert", error);
    }
  }
  async function runAction(action) {
    if (!state.operationId || state.busy) return;
    clearMessage("#error-alert", "#success-message");
    setBusy(true);
    try {
      let result;
      if (action === "refresh") result = await request(`/api/payment-funding/operations/${encodeURIComponent(state.operationId)}`);
      else result = await post(`/api/payment-funding/operations/${encodeURIComponent(state.operationId)}/${action}`, {});
      renderOperation(result);
      await refreshScope();
      if (result.status === "fiscal_unknown" || result.status === "authorizing") {
        showSuccess("#success-message", "El estado fiscal requiere conciliación. Los fondos permanecen retenidos; recupere esta misma operación.");
      } else if (result.status === "applied") showSuccess("#success-message", "Factura vinculada. Se mantuvieron los recibos existentes sin volver a cobrar.");
      else showSuccess("#success-message", `Estado actualizado: ${result.status}.`);
    } catch (error) {
      if (error.operationId) state.operationId = error.operationId;
      showError("#error-alert", error);
      if (state.operationId) {
        try {
          const current = await request(`/api/payment-funding/operations/${encodeURIComponent(state.operationId)}`);
          renderOperation(current);
        } catch { /* conserva operación y preview para retry */ }
      }
      try { await refreshScope(); } catch { /* conserva el error de acción visible */ }
    } finally { setBusy(false); }
  }

  $("#scenario-select").addEventListener("change", (event) => loadScenario(event.target.value));
  $("#preview-button").addEventListener("click", async () => {
    if (!state.scenario?.request || state.busy) return;
    clearMessage("#error-alert", "#success-message");
    setBusy(true);
    try {
      state.preview = await post("/api/payment-funding/previews", state.scenario.request);
      showSuccess("#success-message", `Previsualización lista · ${safe(state.preview.fundingMode)} · ${money(state.preview.totalCents)}.`);
      await refreshScope();
    } catch (error) {
      showError("#error-alert", error);
      try { await refreshScope(); } catch { /* el error original tiene prioridad */ }
    } finally { setBusy(false); }
  });
  $("#start-button").addEventListener("click", async () => {
    if (!state.preview || !state.scenario?.request || state.busy) return;
    state.operationId = state.operationId || id();
    clearMessage("#error-alert", "#success-message");
    setBusy(true);
    try {
      const operation = await post("/api/payment-funding/operations", {
        operationId: state.operationId,
        previewHash: state.preview.previewHash,
        request: state.preview.request || state.scenario.request
      });
      renderOperation(operation);
      await refreshScope();
      showSuccess("#success-message", "Operación creada. La financiación queda reservada; continúe desde este mismo identificador.");
    } catch (error) {
      if (error.operationId) state.operationId = error.operationId;
      showError("#error-alert", error);
      try {
        const current = await request(`/api/payment-funding/operations/${encodeURIComponent(state.operationId)}`);
        renderOperation(current);
      } catch { /* conserva UUID y preview para retry idempotente */ }
      try { await refreshScope(); } catch { /* error ya visible */ }
    } finally { setBusy(false); }
  });
  $("#operation-actions").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-op-action]");
    if (!button) return;
    if (button.dataset.opAction === "abort" && !window.confirm("¿Abortar esta reserva antes de autorizar?")) return;
    await runAction(button.dataset.opAction);
  });
  document.querySelectorAll("[data-point]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (state.busy || !state.operationId) return;
      clearMessage("#error-alert", "#success-message");
      setBusy(true);
      try {
        await post("/api/demo/faults", { point: button.dataset.point });
        state.faultArmed = button.dataset.point;
        showSuccess("#success-message", button.dataset.point === "after_cae"
          ? "Fallo post-CAE armado para la siguiente autorización."
          : "Fallo al finalizar armado para la siguiente vinculación.");
        await refreshScope();
      } catch (error) { showError("#error-alert", error); }
      finally { setBusy(false); syncButtons(); }
    });
  });
  $("#correction-preview").addEventListener("click", async () => {
    if (!state.scenario?.correctionRequest || state.busy) return;
    clearMessage("#correction-error", "#correction-success");
    setBusy(true);
    try {
      state.correctionPreview = await post("/api/payment-funding/corrections/preview", state.scenario.correctionRequest);
      state.correctionOperationId = state.correctionOperationId || id();
      showSuccess("#correction-success", `Corrección previsualizada · ${money(state.correctionPreview.totalCents)}. Confirme para aplicar atómicamente.`);
      await refreshScope();
    } catch (error) {
      showError("#correction-error", error);
      try { await refreshScope(); } catch { /* conserva error */ }
    } finally { setBusy(false); }
  });
  $("#correction-confirm").addEventListener("click", async () => {
    if (!state.correctionPreview || !state.scenario?.correctionRequest || state.busy) return;
    clearMessage("#correction-error", "#correction-success");
    state.correctionOperationId = state.correctionOperationId || id();
    setBusy(true);
    try {
      const result = await post("/api/payment-funding/corrections", {
        operationId: state.correctionOperationId,
        previewHash: state.correctionPreview.previewHash,
        request: state.correctionPreview.request || state.scenario.correctionRequest
      });
      showSuccess("#correction-success", `Corrección confirmada${result?.status ? ` · ${result.status}` : ""}. La rectificación queda registrada en el ámbito.`);
      state.correctionPreview = null;
      await refreshScope();
    } catch (error) {
      if (error.operationId) state.correctionOperationId = error.operationId;
      showError("#correction-error", error);
      try { await refreshScope(); } catch { /* conserva error y operación para retry */ }
    } finally { setBusy(false); }
  });

  loadScenarios();
})();
