const contentUrl = "/data/ceal/content.json";
const statusUrl = "/api/ceal-incidents";
const draftKey = "ceal:incident-draft:v1";

const chatQuickPrompts = [
  { label: "Asistencia", prompt: "Se tomara asistencia durante la contingencia?" },
  { label: "Evaluaciones", prompt: "Habra evaluaciones esta semana?" },
  { label: "Acuerdos", prompt: "Donde puedo ver los acuerdos recientes?" },
  { label: "Reportar un caso", prompt: "Quiero reportar un problema con un ramo" },
  { label: "Contacto urgente", prompt: "A quien contacto si tengo un caso urgente?" },
];

const iconMap = {
  asistencia: "i-calendar",
  evaluaciones: "i-file",
  marcha: "i-megaphone",
  pleno: "i-users",
  contacto: "i-mail",
  issue_attendance: "i-users",
  issue_assessment: "i-calendar",
  issue_contradiction: "i-alert",
  issue_pressure: "i-info",
  issue_admin: "i-file",
  issue_other: "i-menu",
};

const statusClassMap = {
  confirmed: "faq-status faq-status--confirmed",
  review: "faq-status faq-status--review",
  official: "faq-status faq-status--official",
};

const statusLabelMap = {
  confirmed: "Confirmado",
  review: "En revisión",
  official: "Sin respuesta oficial",
};

const state = {
  view: "faq",
  faqCategory: "all",
  query: "",
  content: null,
  submissionStatus: null,
  selectedIssueType: "",
  selectedFile: null,
  chatMessages: [],
};

let evidencePicker = null;

const elements = {
  body: document.body,
  sidebar: document.getElementById("mobile-menu"),
  overlay: document.querySelector('[data-action="close-menu"]'),
  menuButton: document.querySelector('[data-action="toggle-menu"]'),
  viewPanels: Array.from(document.querySelectorAll(".view-panel")),
  viewButtons: Array.from(document.querySelectorAll("[data-view-target]")),
  faqSearch: document.getElementById("faq-search"),
  faqCategoryChips: document.getElementById("faq-category-chips"),
  faqList: document.getElementById("faq-list"),
  faqResultsCopy: document.getElementById("faq-results-copy"),
  faqUpdatedText: document.getElementById("faq-updated-text"),
  faqSourceText: document.getElementById("faq-source-text"),
  agreementsList: document.getElementById("agreements-list"),
  newsList: document.getElementById("news-list"),
  chatMessages: document.getElementById("chat-messages"),
  chatSuggestions: document.getElementById("chat-suggestions"),
  chatForm: document.getElementById("chat-form"),
  chatInput: document.getElementById("chat-input"),
  issueTypeGrid: document.getElementById("issue-type-grid"),
  unitOptions: document.getElementById("unit-options"),
  form: document.getElementById("incident-form"),
  unitInput: document.getElementById("incident-unit"),
  dateInput: document.getElementById("incident-date"),
  descriptionInput: document.getElementById("incident-description"),
  descriptionCount: document.getElementById("description-count"),
  evidenceTrigger: document.getElementById("incident-evidence-trigger"),
  uploadList: document.getElementById("upload-list"),
  formStatus: document.getElementById("form-status"),
  submitButton: document.getElementById("submit-button"),
  statusCurrent: document.getElementById("status-current"),
  statusPlenum: document.getElementById("status-plenum"),
  statusResult: document.getElementById("status-result"),
  statusSource: document.getElementById("status-source"),
  submissionModeBadge: document.getElementById("submission-mode-badge"),
  submissionModeCopy: document.getElementById("submission-mode-copy"),
  sidebarSubmissionMode: document.getElementById("sidebar-submission-mode"),
  sidebarSubmissionCopy: document.getElementById("sidebar-submission-copy"),
};

function iconUse(id) {
  return `<svg aria-hidden="true"><use href="#${id}"></use></svg>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function formatChatText(value) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function formatDateTime(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-CL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateInputMax() {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localDate = new Date(today.getTime() - offset * 60000);
  return localDate.toISOString().slice(0, 10);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 102.4) / 10} KB`;
  }
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}

function getRouteView() {
  const hash = window.location.hash.replace("#", "").trim().toLowerCase();
  if (hash === "reporte" || hash === "report") {
    return "report";
  }
  if (hash === "chat") {
    return "chat";
  }
  return "faq";
}

function setRouteView(view) {
  const hash = view === "report" ? "reporte" : view === "chat" ? "chat" : "faq";
  if (window.location.hash.replace("#", "") !== hash) {
    history.replaceState(null, "", `#${hash}`);
  }
}

function syncMenuState(isOpen) {
  elements.sidebar.classList.toggle("is-open", isOpen);
  elements.overlay?.classList.toggle("is-visible", isOpen);
  elements.body.classList.toggle("menu-open", isOpen);
  elements.sidebar.setAttribute("aria-hidden", String(!isOpen));
  elements.overlay?.setAttribute("aria-hidden", String(!isOpen));
  elements.menuButton?.setAttribute("aria-expanded", String(isOpen));
  elements.menuButton?.setAttribute("aria-label", isOpen ? "Cerrar navegacion" : "Abrir navegacion");
}

function closeMenu() {
  syncMenuState(false);
}

function toggleMenu() {
  if (window.innerWidth >= 1080) {
    return;
  }
  syncMenuState(!elements.sidebar.classList.contains("is-open"));
}

function setView(view) {
  state.view = view;
  setRouteView(view);

  elements.viewPanels.forEach((panel) => {
    const active = panel.dataset.view === view;
    panel.hidden = !active;
    panel.classList.toggle("is-active", active);
  });

  elements.viewButtons.forEach((button) => {
    const active = button.dataset.viewTarget === view;
    button.classList.toggle("is-active", active);
    if (button.matches("[role='tab']")) {
      button.setAttribute("aria-selected", String(active));
    }
  });

  closeMenu();
}

function getFaqItems() {
  if (!state.content) {
    return [];
  }

  const query = state.query.trim().toLowerCase();

  return state.content.faq.items.filter((item) => {
    const categoryMatch = state.faqCategory === "all" || item.category === state.faqCategory;
    const queryMatch =
      !query ||
      `${item.question} ${item.answer} ${item.status_label}`.toLowerCase().includes(query);

    return categoryMatch && queryMatch;
  });
}

function renderFaqCategories() {
  if (!state.content) {
    return;
  }

  const allChip = {
    id: "all",
    label: "Todas",
    icon: "i-search",
  };

  const chips = [allChip, ...state.content.faq.categories];

  elements.faqCategoryChips.innerHTML = chips
    .map((chip) => {
      const active = chip.id === state.faqCategory;
      return `
        <button
          type="button"
          class="filter-chip ${active ? "is-active" : ""}"
          data-faq-category="${chip.id}"
        >
          ${iconUse(chip.icon || "i-info")}
          <span>${escapeHtml(chip.label)}</span>
        </button>
      `;
    })
    .join("");
}

function renderFaqList() {
  const items = getFaqItems();
  const noun = items.length === 1 ? "pregunta visible" : "preguntas visibles";
  elements.faqResultsCopy.textContent = `${items.length} ${noun}`;

  if (!items.length) {
    elements.faqList.innerHTML = `
      <div class="faq-empty">
        No encontramos coincidencias. Prueba con otra palabra o cambia la categoría.
      </div>
    `;
    return;
  }

  elements.faqList.innerHTML = items
    .map((item, index) => {
      const statusClass = statusClassMap[item.status] || statusClassMap.review;
      const statusLabel = item.status_label || statusLabelMap[item.status] || "En revisión";
      return `
        <details class="faq-item" ${index === 0 ? "open" : ""}>
          <summary class="faq-summary">
            <h3 class="faq-question">${escapeHtml(item.question)}</h3>
            <span class="${statusClass}">
              ${iconUse(item.status === "confirmed" ? "i-check" : item.status === "official" ? "i-alert" : "i-clock")}
              <span>${escapeHtml(statusLabel)}</span>
            </span>
            <span class="faq-chevron">${iconUse("i-chevron")}</span>
          </summary>
          <div class="faq-answer">
            <div>${escapeHtml(item.answer)}</div>
            <p class="faq-answer__meta">Actualizado ${escapeHtml(formatDateTime(item.updated_at))}</p>
          </div>
        </details>
      `;
    })
    .join("");
}

function renderInfoLists() {
  const agreements = state.content.summary.agreements
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("");
  const news = state.content.summary.news
    .map((item) => `<p>${escapeHtml(item)}</p>`)
    .join("");

  elements.agreementsList.innerHTML = agreements;
  elements.newsList.innerHTML = news;
}

function getStudentSafeStatus(value) {
  const normalized = normalizeText(value);

  if (normalized.includes("paro")) {
    return "Situacion en reevaluacion diaria";
  }

  if (normalized.includes("paraliz")) {
    return "Decision vigente hasta nueva votacion";
  }

  return value;
}

function ensureChatStarted() {
  if (state.chatMessages.length) {
    return;
  }

  state.chatMessages = [
    {
      role: "assistant",
      text: "Hola. Pregunta por asistencia, evaluaciones, acuerdos, fechas o reportes.",
      actions: [
        { label: "Ver preguntas", action: "open-faq" },
        { label: "Enviar reporte", action: "open-report" },
      ],
    },
  ];
}

function renderChatSuggestions() {
  if (!elements.chatSuggestions) {
    return;
  }

  elements.chatSuggestions.innerHTML = chatQuickPrompts
    .map(
      (item) => `
        <button class="chat-suggestion" type="button" data-chat-prompt="${escapeHtml(item.prompt)}">
          ${escapeHtml(item.label)}
        </button>
      `,
    )
    .join("");
}

function renderChatMessages() {
  if (!elements.chatMessages) {
    return;
  }

  ensureChatStarted();

  elements.chatMessages.innerHTML = state.chatMessages
    .map((message) => {
      const actions = (message.actions || [])
        .map(
          (action) => `
            <button
              class="chat-message__action"
              type="button"
              data-chat-action="${escapeHtml(action.action)}"
              ${action.query ? `data-chat-query="${escapeHtml(action.query)}"` : ""}
            >
              ${escapeHtml(action.label)}
            </button>
          `,
        )
        .join("");

      return `
        <article class="chat-message chat-message--${escapeHtml(message.role)}">
          <div class="chat-message__bubble">
            <p>${formatChatText(message.text)}</p>
            ${actions ? `<div class="chat-message__actions">${actions}</div>` : ""}
          </div>
        </article>
      `;
    })
    .join("");

  requestAnimationFrame(() => {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  });
}

function includesAny(value, words) {
  return words.some((word) => value.includes(word));
}

function getBestFaqMatch(message) {
  if (!state.content?.faq?.items?.length) {
    return null;
  }

  const query = normalizeText(message);
  const tokens = query
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !["esta", "este", "para", "como", "quiero"].includes(token));
  const categoryKeywords = {
    asistencia: ["asistencia", "clase", "clases", "presencial"],
    evaluaciones: ["evaluacion", "evaluaciones", "prueba", "pruebas", "control", "controles", "examen", "nota"],
    marcha: ["marcha", "movilizacion"],
    pleno: ["pleno", "acuerdo", "acuerdos", "votacion", "fecha", "calendario"],
    contacto: ["contacto", "urgente", "ayuda", "caso"],
  };

  return state.content.faq.items.reduce((best, item) => {
    const haystack = normalizeText(`${item.question} ${item.answer} ${item.status_label} ${item.category}`);
    let score = 0;

    if (haystack.includes(query) || query.includes(normalizeText(item.question))) {
      score += 6;
    }

    tokens.forEach((token) => {
      if (haystack.includes(token)) {
        score += 1;
      }
    });

    const categoryWords = categoryKeywords[item.category] || [];
    if (includesAny(query, categoryWords)) {
      score += 3;
    }

    if (!best || score > best.score) {
      return { item, score };
    }

    return best;
  }, null);
}

function buildStatusReply() {
  const summary = state.content.summary;
  return {
    role: "assistant",
    text:
      `Situacion actual:\n` +
      `Estado: ${getStudentSafeStatus(summary.current_status)}.\n` +
      `Proximo pleno: ${summary.next_plenum}.\n` +
      `Resultado vigente: ${getStudentSafeStatus(summary.current_result)}.\n` +
      `Fuente: ${summary.source_label}.`,
    actions: [
      { label: "Ver acuerdos", action: "open-agreements" },
      { label: "Enviar reporte", action: "open-report" },
    ],
  };
}

function buildReportReply() {
  return {
    role: "assistant",
    text:
      "Si el caso afecta asistencia, evaluaciones, informacion contradictoria, presion docente o un tramite pendiente, conviene dejarlo como reporte. Agrega ramo, fecha y evidencia si tienes.",
    actions: [{ label: "Abrir reporte", action: "open-report" }],
  };
}

function buildChatReply(message) {
  const query = normalizeText(message);
  const wantsReport = includesAny(query, ["reportar", "reporte", "incidencia", "problema", "presion", "evidencia", "tramite"]);

  if (!wantsReport && includesAny(query, ["estado", "hoy", "situacion", "actual", "que sigue", "sigue", "pleno", "acuerdo", "acuerdos", "votacion"])) {
    return buildStatusReply();
  }

  const match = getBestFaqMatch(message);

  if (!wantsReport && match?.score >= 3) {
    const item = match.item;
    return {
      role: "assistant",
      text: `Esto es lo publicado:\n${item.answer}\n\nEstado: ${item.status_label || statusLabelMap[item.status] || "En revision"}.`,
      actions: [
        { label: "Ver en preguntas", action: "open-faq", query: item.question },
        { label: "Enviar reporte", action: "open-report" },
      ],
    };
  }

  if (wantsReport) {
    return buildReportReply();
  }

  return {
    role: "assistant",
    text:
      "No encontre una respuesta directa en las preguntas publicadas. Puedes revisar la FAQ o dejar el caso como reporte si necesitas que quede registrado.",
    actions: [
      { label: "Ver preguntas", action: "open-faq" },
      { label: "Enviar reporte", action: "open-report" },
    ],
  };
}

function submitChatMessage(rawMessage) {
  const message = String(rawMessage || "").trim();
  if (!message) {
    elements.chatInput?.focus();
    return;
  }

  state.chatMessages.push({ role: "user", text: message });
  state.chatMessages.push(buildChatReply(message));
  renderChatMessages();
}

function openFaqFromChat(query = "") {
  setView("faq");
  state.faqCategory = "all";
  state.query = query;
  if (elements.faqSearch) {
    elements.faqSearch.value = query;
  }
  renderFaqCategories();
  renderFaqList();
  document.getElementById("view-faq")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleChatAction(button) {
  const action = button.dataset.chatAction;

  if (action === "open-report") {
    state.selectedIssueType = "issue_other";
    renderIssueTypes();
    focusReportDescription();
    return;
  }

  if (action === "open-agreements") {
    setView("faq");
    document.getElementById("acuerdos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (action === "open-faq") {
    openFaqFromChat(button.dataset.chatQuery || "");
  }
}

function renderStatusSummary() {
  const { summary, faq } = state.content;
  elements.statusCurrent.textContent = summary.current_status;
  elements.statusPlenum.textContent = summary.next_plenum;
  elements.statusResult.textContent = summary.current_result;
  elements.statusSource.textContent = summary.source_label;
  elements.faqUpdatedText.textContent = `Actualizado ${formatDateTime(faq.updated_at)}`;
  elements.faqSourceText.textContent = faq.source_label;
}

function renderIssueTypes() {
  const issueTypes = state.content.reporting.issue_types;

  if (!state.selectedIssueType) {
    state.selectedIssueType = issueTypes[0].id;
  }

  elements.issueTypeGrid.innerHTML = issueTypes
    .map((item) => {
      const selected = item.id === state.selectedIssueType;
      return `
        <label class="issue-option ${selected ? "is-selected" : ""}">
          <input type="radio" name="issue_type" value="${escapeHtml(item.id)}" ${selected ? "checked" : ""}>
          ${iconUse(item.icon || "i-info")}
          <span>${escapeHtml(item.label)}</span>
        </label>
      `;
    })
    .join("");
}

function renderUnitOptions() {
  elements.unitOptions.innerHTML = state.content.reporting.unit_suggestions
    .map((item) => `<option value="${escapeHtml(item)}"></option>`)
    .join("");
}

function renderSubmissionStatus() {
  const fallback = {
    accepts_submissions: false,
    storage_mode: "offline",
    message: "No pudimos revisar el estado del formulario en este momento.",
  };

  const data = state.submissionStatus || fallback;
  const modeLabelMap = {
    webhook: "Formulario disponible",
    filesystem: "Formulario disponible",
    offline: "Formulario no disponible",
    unconfigured: "Formulario no disponible",
  };

  const label = modeLabelMap[data.storage_mode] || "Formulario disponible";
  const defaultMessage =
    data.accepts_submissions
      ? "Puedes enviar tu caso desde aqui."
      : "Por ahora no es posible enviar reportes desde este formulario.";
  const message = data.message || defaultMessage;

  elements.submissionModeBadge.textContent = label;
  elements.submissionModeCopy.textContent = message;
  elements.sidebarSubmissionMode.textContent = label;
  elements.sidebarSubmissionCopy.textContent = message;
}

function renderUploadList() {
  if (!state.selectedFile) {
    elements.uploadList.innerHTML = "";
    return;
  }

  elements.uploadList.innerHTML = `
    <div class="upload-chip">
      <div class="upload-chip__meta">
        ${iconUse("i-paperclip")}
        <div class="upload-chip__text">
          <span class="upload-chip__name">${escapeHtml(state.selectedFile.name)}</span>
          <span class="upload-chip__size">${escapeHtml(formatBytes(state.selectedFile.size))}</span>
        </div>
      </div>
      <button class="upload-chip__remove" type="button" data-action="remove-file">Quitar</button>
    </div>
  `;
}

function getEvidencePicker() {
  if (evidencePicker) {
    return evidencePicker;
  }

  evidencePicker = document.createElement("input");
  evidencePicker.type = "file";
  evidencePicker.accept =
    ".png,.jpg,.jpeg,.webp,.pdf,.doc,.docx,image/png,image/jpeg,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  evidencePicker.hidden = true;
  evidencePicker.addEventListener("change", (event) => {
    const [file] = event.target.files || [];
    const validation = validateFile(file);

    if (!validation.ok) {
      state.selectedFile = null;
      event.target.value = "";
      renderUploadList();
      setFormStatus(validation.message, "error");
      return;
    }

    clearFormStatus();
    state.selectedFile = file || null;
    renderUploadList();
  });
  document.body.appendChild(evidencePicker);

  return evidencePicker;
}

function saveDraft() {
  const formData = new FormData(elements.form);
  const draft = {
    issue_type: state.selectedIssueType,
    unit: formData.get("unit") || "",
    date: formData.get("date") || "",
    description: formData.get("description") || "",
    wants_followup: formData.get("wants_followup") || "yes",
  };

  localStorage.setItem(draftKey, JSON.stringify(draft));
}

function restoreDraft() {
  const raw = localStorage.getItem(draftKey);
  if (!raw) {
    return;
  }

  try {
    const draft = JSON.parse(raw);
    state.selectedIssueType = draft.issue_type || state.selectedIssueType;
    elements.unitInput.value = draft.unit || "";
    elements.dateInput.value = draft.date || "";
    elements.descriptionInput.value = draft.description || "";
    const followupSelector = `input[name="wants_followup"][value="${draft.wants_followup || "yes"}"]`;
    const followup = elements.form.querySelector(followupSelector);
    if (followup) {
      followup.checked = true;
    }
  } catch (error) {
    console.warn("No se pudo restaurar el borrador", error);
  }
}

function clearDraft() {
  localStorage.removeItem(draftKey);
}

function updateChoiceCards() {
  const choiceCards = elements.form.querySelectorAll(".choice-card");
  choiceCards.forEach((card) => {
    const input = card.querySelector("input");
    card.classList.toggle("is-selected", Boolean(input?.checked));
  });
}

function updateDescriptionCount() {
  elements.descriptionCount.textContent = String(elements.descriptionInput.value.length);
}

function setFormStatus(message, kind = "") {
  elements.formStatus.textContent = message;
  elements.formStatus.className = "form-status is-visible";
  if (kind) {
    elements.formStatus.classList.add(`is-${kind}`);
  }
}

function clearFormStatus() {
  elements.formStatus.textContent = "";
  elements.formStatus.className = "form-status";
}

function validateFile(file) {
  if (!file) {
    return { ok: true };
  }

  const allowedTypes = new Set(state.content.reporting.allowed_file_types);
  const allowedExtensions = state.content.reporting.allowed_file_extensions;
  const hasAllowedType = allowedTypes.has(file.type);
  const lowerName = file.name.toLowerCase();
  const hasAllowedExtension = allowedExtensions.some((ext) => lowerName.endsWith(ext));

  if (file.size > state.content.reporting.max_file_size_bytes) {
    return { ok: false, message: "El archivo supera el máximo de 10 MB." };
  }

  if (!hasAllowedType && !hasAllowedExtension) {
    return { ok: false, message: "Formato no permitido. Usa imagen, PDF o Word." };
  }

  return { ok: true };
}

async function loadData() {
  const [contentResponse, submissionResponse] = await Promise.allSettled([
    fetch(contentUrl, { cache: "no-store" }),
    fetch(statusUrl, { cache: "no-store" }),
  ]);

  if (contentResponse.status !== "fulfilled" || !contentResponse.value.ok) {
    throw new Error("No se pudo cargar el contenido CEAL.");
  }

  state.content = await contentResponse.value.json();

  if (submissionResponse.status === "fulfilled" && submissionResponse.value.ok) {
    state.submissionStatus = await submissionResponse.value.json();
  }
}

function renderAll() {
  renderStatusSummary();
  renderFaqCategories();
  renderFaqList();
  renderInfoLists();
  renderChatSuggestions();
  renderChatMessages();
  renderIssueTypes();
  renderUnitOptions();
  renderSubmissionStatus();
  renderUploadList();
  updateDescriptionCount();
  updateChoiceCards();
}

function focusReportDescription() {
  setView("report");
  requestAnimationFrame(() => {
    elements.descriptionInput.focus();
  });
}

async function submitIncident(event) {
  event.preventDefault();
  clearFormStatus();

  const formData = new FormData(elements.form);
  formData.set("issue_type", state.selectedIssueType);

  if (state.selectedFile) {
    formData.set("evidence", state.selectedFile);
  } else {
    formData.delete("evidence");
  }

  const requiredChecks = [
    { valid: Boolean(state.selectedIssueType), message: "Selecciona un tipo de problema." },
    { valid: Boolean(String(formData.get("unit") || "").trim()), message: "Indica la asignatura o unidad." },
    { valid: Boolean(String(formData.get("date") || "").trim()), message: "Selecciona una fecha." },
    { valid: Boolean(String(formData.get("description") || "").trim()), message: "Escribe una descripción breve." },
  ];

  const invalidCheck = requiredChecks.find((item) => !item.valid);
  if (invalidCheck) {
    setFormStatus(invalidCheck.message, "error");
    return;
  }

  if (!state.submissionStatus?.accepts_submissions) {
    setFormStatus(
      "Por ahora este formulario no esta recibiendo reportes. Intentalo de nuevo en un momento.",
      "error",
    );
    return;
  }

  elements.submitButton.disabled = true;
  elements.submitButton.querySelector("span").textContent = "Enviando reporte...";

  try {
    const response = await fetch(statusUrl, {
      method: "POST",
      body: formData,
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || "No se pudo enviar el reporte.");
    }

    elements.form.reset();
    state.selectedFile = null;
    state.selectedIssueType = state.content.reporting.issue_types[0].id;
    clearDraft();
    renderIssueTypes();
    renderUploadList();
    updateChoiceCards();
    updateDescriptionCount();
    setFormStatus(
      `Reporte enviado correctamente. Codigo ${payload.report_id}.`,
      "success",
    );
  } catch (error) {
    setFormStatus(error.message || "No se pudo enviar el reporte.", "error");
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.querySelector("span").textContent = "Enviar reporte";
  }
}

function bindEvents() {
  elements.menuButton?.addEventListener("click", toggleMenu);
  elements.overlay?.addEventListener("click", closeMenu);

  document.addEventListener("click", (event) => {
    const menuClicked = event.target.closest('[data-action="toggle-menu"]');
    const closeMenuButton = event.target.closest('[data-action="close-menu"]');
    const navButton = event.target.closest("[data-view-target]");
    const faqChip = event.target.closest("[data-faq-category]");
    const jumpButton = event.target.closest('[data-action="jump-section"]');
    const questionButton = event.target.closest('[data-action="open-report-question"]');
    const removeFileButton = event.target.closest('[data-action="remove-file"]');
    const chatPrompt = event.target.closest("[data-chat-prompt]");
    const chatAction = event.target.closest("[data-chat-action]");

    if (menuClicked) {
      return;
    }

    if (closeMenuButton) {
      closeMenu();
      return;
    }

    if (navButton) {
      const view = navButton.dataset.viewTarget;
      if (view) {
        setView(view);
      }
      return;
    }

    if (faqChip) {
      state.faqCategory = faqChip.dataset.faqCategory;
      renderFaqCategories();
      renderFaqList();
      return;
    }

    if (chatPrompt) {
      submitChatMessage(chatPrompt.dataset.chatPrompt);
      return;
    }

    if (chatAction) {
      handleChatAction(chatAction);
      return;
    }

    if (jumpButton) {
      event.preventDefault();
      setView("faq");
      const target = document.querySelector(jumpButton.getAttribute("href"));
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (questionButton) {
      state.selectedIssueType = "issue_contradiction";
      renderIssueTypes();
      focusReportDescription();
      return;
    }

    if (removeFileButton) {
      state.selectedFile = null;
      if (evidencePicker) {
        evidencePicker.value = "";
      }
      renderUploadList();
      saveDraft();
    }
  });

  window.addEventListener("hashchange", () => {
    setView(getRouteView());
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 1080) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });

  elements.faqSearch.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderFaqList();
  });

  elements.chatForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const message = elements.chatInput.value;
    elements.chatInput.value = "";
    submitChatMessage(message);
  });

  elements.issueTypeGrid.addEventListener("change", (event) => {
    if (event.target.name === "issue_type") {
      state.selectedIssueType = event.target.value;
      renderIssueTypes();
      saveDraft();
    }
  });

  elements.form.addEventListener("change", (event) => {
    if (event.target.name === "wants_followup") {
      updateChoiceCards();
    }
    saveDraft();
  });

  elements.unitInput.addEventListener("input", saveDraft);
  elements.dateInput.addEventListener("input", saveDraft);

  elements.descriptionInput.addEventListener("input", () => {
    updateDescriptionCount();
    saveDraft();
  });

  elements.evidenceTrigger.addEventListener("click", () => {
    getEvidencePicker().click();
  });

  elements.form.addEventListener("submit", submitIncident);
}

async function init() {
  try {
    elements.dateInput.max = formatDateInputMax();
    await loadData();
    restoreDraft();
    setView(getRouteView());
    renderAll();
    bindEvents();
  } catch (error) {
    console.error(error);
    document.querySelector(".app-main").innerHTML = `
      <section class="view-panel is-active">
        <header class="hero-block">
          <div>
            <p class="kicker">CEAL Ingeniería Civil</p>
            <h1>Error de carga</h1>
            <p class="hero-copy">
              No se pudo abrir esta pagina en este momento. Intenta recargar nuevamente.
            </p>
          </div>
        </header>
      </section>
    `;
  }
}

init();
