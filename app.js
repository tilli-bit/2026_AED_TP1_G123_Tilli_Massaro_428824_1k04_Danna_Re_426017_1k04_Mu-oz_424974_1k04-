/* ═══════════════════════════════════════════════════════
   MyDigest — app.js
   ═══════════════════════════════════════════════════════ */

// ── Theme ─────────────────────────────────────────────────────────────────
const savedTheme = localStorage.getItem("md-theme") || "light";
document.documentElement.setAttribute("data-theme", savedTheme);
setThemeIcon(savedTheme);

function toggleTheme() {
  const cur  = document.documentElement.getAttribute("data-theme");
  const next = cur === "light" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("md-theme", next);
  setThemeIcon(next);
}
function setThemeIcon(t) {
  const el = document.getElementById("theme-icon");
  if (el) el.textContent = t === "dark" ? "🌙" : "☀️";
}

// ── State ─────────────────────────────────────────────────────────────────
let items      = [];
let outputs    = [];
let grupos     = [];
let events     = [];
let pendingFiles  = null;
let pendingBlob   = null;
let selectedGroup = "";
let activeGroupFilter = "";

// Recording
let mediaRecorder = null;
let audioChunks   = [];
let recInterval   = null;
let recSeconds    = 0;
let recBlob       = null;

// Calendar
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();   // 0-based
let selectedDay = null;

// Event modal
let editingEventId = null;
let selectedColor  = "#8b7cf6";

// Slides
let slides = [], slideIdx = 0;

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  grupos = await fetch("/grupos").then(r => r.json());
  buildGroupFilter();
  buildGroupChips();
  setupDrop();
  await loadItems();
  await loadOutputs();
  await loadEvents();
  initNotifications();
  checkOnboarding();
});

// ═══════════════════════════════════════════════════════
//  ONBOARDING
// ═══════════════════════════════════════════════════════
const OB_TOTAL = 7;
let obStep = 0;

function checkOnboarding() {
  if (!localStorage.getItem("md-onboarding-done")) openTutorial();
}

function openTutorial() {
  obStep = 0;
  renderOb();
  document.getElementById("ob-overlay").classList.remove("hidden");
}

function skipTutorial() {
  localStorage.setItem("md-onboarding-done", "1");
  document.getElementById("ob-overlay").classList.add("hidden");
}

function obNext() {
  if (obStep >= OB_TOTAL - 1) { skipTutorial(); return; }
  obStep++;
  renderOb();
}

function obPrev() {
  if (obStep <= 0) return;
  obStep--;
  renderOb();
}

function renderOb() {
  // Steps
  document.querySelectorAll(".ob-step").forEach((s, i) =>
    s.classList.toggle("active", i === obStep));

  // Dots
  const dots = document.getElementById("ob-dots");
  dots.innerHTML = Array.from({length: OB_TOTAL}, (_, i) =>
    `<div class="ob-dot ${i === obStep ? "active" : ""}" onclick="obGoTo(${i})"></div>`
  ).join("");

  // Buttons
  document.getElementById("ob-prev").style.visibility = obStep === 0 ? "hidden" : "visible";
  const nextBtn = document.getElementById("ob-next");
  nextBtn.textContent = obStep === OB_TOTAL - 1 ? "¡Empezar! 🚀" : "Siguiente →";
}

function obGoTo(i) { obStep = i; renderOb(); }

// ═══════════════════════════════════════════════════════
//  SECTION SWITCHING
// ═══════════════════════════════════════════════════════
function showSection(name) {
  ["digest","calendar"].forEach(s => {
    document.getElementById(`section-${s}`).classList.toggle("hidden", s !== name);
  });
  document.querySelectorAll(".nav-tab").forEach(t =>
    t.classList.toggle("active", t.dataset.section === name));

  // show/hide group filter (only for digest)
  document.getElementById("group-filter").style.display = name === "digest" ? "" : "none";

  if (name === "calendar") renderCalendar();
}

// ═══════════════════════════════════════════════════════
//  NOTIFICATIONS
// ═══════════════════════════════════════════════════════
function initNotifications() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    document.getElementById("notif-banner").classList.remove("hidden");
  }
  // Poll every 60 seconds
  setInterval(checkEventNotifications, 60_000);
  checkEventNotifications();
}

async function requestNotifPermission() {
  const perm = await Notification.requestPermission();
  document.getElementById("notif-banner").classList.add("hidden");
  if (perm === "granted") {
    showToast("Notificaciones activadas ✓", "success");
    checkEventNotifications();
  } else {
    showToast("Permiso denegado", "warning");
  }
}

function checkEventNotifications() {
  if (Notification.permission !== "granted") return;
  const now = Date.now();
  const notified = JSON.parse(localStorage.getItem("md-notified") || "{}");

  events.forEach(ev => {
    if (!ev.notif_minutos || ev.completado) return;
    const evDate = new Date(`${ev.fecha}T${ev.hora || "09:00"}`);
    const triggerTime = evDate.getTime() - ev.notif_minutos * 60_000;
    const key = `${ev.id}-${ev.notif_minutos}`;

    if (now >= triggerTime && now < evDate.getTime() && !notified[key]) {
      notified[key] = true;
      localStorage.setItem("md-notified", JSON.stringify(notified));

      const mins = ev.notif_minutos;
      const when = mins < 60 ? `${mins} minutos`
        : mins < 1440 ? `${mins/60} hora(s)`
        : mins < 10080 ? `${mins/1440} día(s)`
        : "1 semana";

      new Notification(`📅 ${ev.titulo}`, {
        body: `Empieza en ${when}${ev.descripcion ? "\n" + ev.descripcion : ""}`,
        icon: "/static/icon.png",
        tag: key,
      });
    }
  });
}

// ═══════════════════════════════════════════════════════
//  GROUP FILTER / CHIPS
// ═══════════════════════════════════════════════════════
function buildGroupFilter() {
  const sel = document.getElementById("group-filter");
  grupos.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g.id;
    opt.textContent = `${g.emoji} ${g.label}`;
    sel.appendChild(opt);
  });
}

function filterByGroup(val) {
  activeGroupFilter = val;
  loadItems(val);
}

function buildGroupChips() {
  const wrap = document.getElementById("group-chips-input");
  wrap.innerHTML = "";
  selectedGroup = "";
  grupos.forEach(g => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gchip";
    btn.dataset.id = g.id;
    btn.textContent = `${g.emoji} ${g.label}`;
    btn.onclick = () => selectGroup(g.id);
    wrap.appendChild(btn);
  });
}

function selectGroup(id) {
  selectedGroup = id;
  document.querySelectorAll(".gchip").forEach(b => b.classList.toggle("selected", b.dataset.id === id));
}

// ═══════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  document.getElementById("tab-file").classList.toggle("hidden",  tab !== "file");
  document.getElementById("tab-voice").classList.toggle("hidden", tab !== "voice");
  cancelUpload();
}

// ═══════════════════════════════════════════════════════
//  DRAG & DROP / FILE UPLOAD
// ═══════════════════════════════════════════════════════
function setupDrop() {
  const zone  = document.getElementById("drop-zone");
  const input = document.getElementById("file-input");
  input.addEventListener("change", () => stageFiles(input.files));
  zone.addEventListener("dragover",  e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    stageFiles(e.dataTransfer.files);
  });
}

function stageFiles(fileList) {
  if (!fileList?.length) return;
  pendingFiles = fileList;
  pendingBlob  = null;
  showMetaForm(`📎 ${fileList.length} archivo(s)`);
}

async function confirmUpload() {
  const fecha = document.getElementById("meta-date").value || null;
  const grupo = selectedGroup || null;
  hideMetaForm();
  showBar("Procesando archivos…");

  try {
    if (pendingFiles) {
      const form = new FormData();
      for (const f of pendingFiles) form.append("files", f);
      if (fecha) form.append("fecha_contenido", fecha);
      if (grupo) form.append("grupo", grupo);
      const res  = await fetch("/upload", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const warn = data.items.filter(i => i.warning).length;
      showToast(warn ? `Subidos con ${warn} advertencia(s)` : `${data.items.length} archivo(s) guardado(s)`,
        warn ? "warning" : "success");
    } else if (pendingBlob) {
      const form = new FormData();
      form.append("file", pendingBlob, "memo.webm");
      if (fecha) form.append("fecha_contenido", fecha);
      if (grupo) form.append("grupo", grupo);
      const res  = await fetch("/upload-audio-memo", { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const item = await res.json();
      showToast(item.tiene_texto ? "Nota de voz transcripta ✓" : "Nota guardada (sin transcripción)",
        item.tiene_texto ? "success" : "warning");
    }
    pendingFiles = pendingBlob = null;
    recBlob = null;
    resetRecorder();
    document.getElementById("file-input").value = "";
    await loadItems();
  } catch (err) {
    showToast("Error: " + err.message, "error");
  } finally {
    hideBar();
  }
}

function cancelUpload() {
  pendingFiles = pendingBlob = null;
  hideMetaForm();
  hideBar();
}

function showMetaForm(hint) {
  buildGroupChips();
  document.getElementById("meta-date").value = today();
  document.getElementById("confirm-btn").textContent = `Guardar (${hint})`;
  document.getElementById("meta-form").classList.remove("hidden");
}
function hideMetaForm() { document.getElementById("meta-form").classList.add("hidden"); }
function showBar(msg) {
  document.getElementById("upload-status").textContent = msg;
  document.getElementById("upload-bar").classList.remove("hidden");
}
function hideBar() { document.getElementById("upload-bar").classList.add("hidden"); }

// ═══════════════════════════════════════════════════════
//  VOICE RECORDER
// ═══════════════════════════════════════════════════════
async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") stopRecording();
  else await startRecording();
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = []; recBlob = null; recSeconds = 0;
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      recBlob = new Blob(audioChunks, { type: "audio/webm" });
      stream.getTracks().forEach(t => t.stop());
      document.getElementById("send-btn").classList.remove("hidden");
    };
    mediaRecorder.start();
    document.getElementById("rec-btn").classList.add("recording");
    document.getElementById("rec-icon").textContent = "⏹";
    document.getElementById("rec-hint").textContent = "Grabando… tocá para detener";
    document.getElementById("wave-bars").classList.add("active");
    recInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds/60), s = String(recSeconds%60).padStart(2,"0");
      document.getElementById("rec-timer").textContent = `${m}:${s}`;
    }, 1000);
  } catch { showToast("No se pudo acceder al micrófono", "error"); }
}

function stopRecording() {
  if (mediaRecorder) mediaRecorder.stop();
  clearInterval(recInterval);
  document.getElementById("rec-btn").classList.remove("recording");
  document.getElementById("rec-icon").textContent = "🎤";
  document.getElementById("rec-hint").textContent = "Grabación lista";
  document.getElementById("wave-bars").classList.remove("active");
}

function sendVoiceMemo() {
  if (!recBlob) return;
  pendingBlob  = recBlob;
  pendingFiles = null;
  const m = Math.floor(recSeconds/60), s = recSeconds%60;
  showMetaForm(`🎤 ${m}:${String(s).padStart(2,"0")}`);
}

function resetRecorder() {
  clearInterval(recInterval);
  recSeconds = 0; recBlob = null;
  document.getElementById("rec-timer").textContent = "0:00";
  document.getElementById("rec-btn").classList.remove("recording");
  document.getElementById("rec-icon").textContent = "🎤";
  document.getElementById("rec-hint").textContent = "Tocá para grabar";
  document.getElementById("wave-bars").classList.remove("active");
  document.getElementById("send-btn").classList.add("hidden");
}

// ═══════════════════════════════════════════════════════
//  ITEMS
// ═══════════════════════════════════════════════════════
async function loadItems(grupo = activeGroupFilter) {
  const url = grupo ? `/items?grupo=${encodeURIComponent(grupo)}` : "/items";
  const res  = await fetch(url);
  items = await res.json();
  renderItems();
}

function renderItems() {
  const el = document.getElementById("items-list");
  if (!items.length) {
    el.innerHTML = `<div class="empty"><span class="empty-icon">🗂</span>Aún no hay contenido guardado.</div>`;
    return;
  }
  el.innerHTML = items.map(item => {
    const g = grupos.find(x => x.id === item.grupo);
    const isAudio  = item.tipo === "Audio";
    const canView  = !!item.file_url && !isAudio;
    return `
    <div class="item-row ${item.incluido_en_digest ? "" : "excluded"}" id="item-${item.id}">
      <label class="item-check">
        <input type="checkbox" ${item.incluido_en_digest ? "checked" : ""} onchange="toggleItem(${item.id},this.checked)" />
        <div class="check-box">✓</div>
      </label>
      <div class="item-body">
        <div class="item-name" title="${esc(item.titulo)}">${esc(item.titulo)}</div>
        <div class="item-meta">
          <span class="chip ${chipClass(item.tipo)}">${esc(item.tipo)}</span>
          ${g ? `<span class="chip chip-grupo">${g.emoji} ${g.label}</span>` : ""}
          ${item.fecha_contenido ? `<span class="chip-date">📅 ${fmtSimpleDate(item.fecha_contenido)}</span>` : ""}
          ${!item.tiene_texto ? `<span class="no-text">⚠ Sin texto</span>` : ""}
        </div>
        ${item.preview ? `<div class="item-preview">${esc(item.preview)}…</div>` : ""}
        ${isAudio && item.file_url ? `<audio class="item-audio-inline" controls src="${item.file_url}" preload="none"></audio>` : ""}
      </div>
      ${canView ? `<div class="item-actions">
        <button class="item-action-btn" title="Ver archivo" onclick='openFileViewer(${JSON.stringify(item)})'>👁</button>
      </div>` : ""}
    </div>`;
  }).join("");
}

async function toggleItem(id, checked) {
  document.getElementById(`item-${id}`)?.classList.toggle("excluded", !checked);
  await fetch(`/items/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ incluido_en_digest: checked }),
  });
  const item = items.find(i => i.id === id);
  if (item) item.incluido_en_digest = checked;
}

async function toggleAll(state) {
  await Promise.all(items.filter(i => i.incluido_en_digest !== state).map(i => toggleItem(i.id, state)));
  items.forEach(i => i.incluido_en_digest = state);
  renderItems();
}

// ═══════════════════════════════════════════════════════
//  GENERATE
// ═══════════════════════════════════════════════════════
async function generate() {
  const tipo = document.querySelector('input[name="gen-tipo"]:checked')?.value || "podcast";
  const btn  = document.getElementById("gen-btn");
  const hint = document.getElementById("gen-hint");

  if (!items.filter(i => i.incluido_en_digest && i.tiene_texto).length) {
    showToast("Seleccioná al menos un ítem con texto", "warning"); return;
  }

  btn.disabled = true;
  document.getElementById("gen-btn-icon").outerHTML = `<div class="spinner md" id="gen-btn-icon"></div>`;
  document.getElementById("gen-btn-label").textContent = "Generando…";
  hint.textContent = "Esto puede tardar un minuto o dos…";

  try {
    const res = await fetch("/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo }),
    });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || res.statusText); }
    const data = await res.json();
    showToast("Generado correctamente ✓", "success");
    await loadOutputs();
    if (tipo === "resumen")      openSummaryModal(data);
    if (tipo === "diapositivas") openSlideModal(data);
  } catch (e) {
    showToast("Error: " + e.message, "error");
  } finally {
    btn.disabled = false;
    document.getElementById("gen-btn-icon").outerHTML = `<span id="gen-btn-icon">✨</span>`;
    document.getElementById("gen-btn-label").textContent = "Generar";
    hint.textContent = "Seleccioná los ítems y el tipo de salida.";
  }
}

// ═══════════════════════════════════════════════════════
//  OUTPUTS
// ═══════════════════════════════════════════════════════
async function loadOutputs() {
  outputs = await fetch("/outputs").then(r => r.json());
  renderOutputs();
}

function renderOutputs() {
  const el = document.getElementById("outputs-list");
  if (!outputs.length) {
    el.innerHTML = `<div class="empty"><span class="empty-icon">🎧</span>Aún no generaste nada.</div>`; return;
  }
  const icons  = { podcast:"🎙", resumen:"📄", diapositivas:"🖼" };
  const labels = { podcast:"Podcast", resumen:"Resumen", diapositivas:"Slides" };
  el.innerHTML = outputs.map(o => `
    <div class="output-row">
      <div class="output-icon">${icons[o.tipo]||"📦"}</div>
      <div class="output-body">
        <div class="output-title">${labels[o.tipo]||o.tipo} · ${fmtDate(o.fecha)}</div>
        <div class="output-meta">${o.items_incluidos.length} ítems${o.duracion_estimada ? " · "+o.duracion_estimada : ""}</div>
        ${o.tipo==="podcast" && o.archivo_path ? `<audio class="output-audio" controls src="${o.archivo_path}"></audio>` : ""}
      </div>
      ${o.tipo!=="podcast" ? `<div class="output-actions">
        <button class="btn-out" onclick='openOutput(${JSON.stringify(o)})'>Ver →</button>
      </div>` : ""}
    </div>`).join("");
}

function openOutput(o) {
  if (o.tipo === "resumen")      openSummaryModal(o);
  if (o.tipo === "diapositivas") openSlideModal(o);
}

// ═══════════════════════════════════════════════════════
//  CALENDAR
// ═══════════════════════════════════════════════════════
async function loadEvents() {
  events = await fetch("/events").then(r => r.json());
  renderUpcoming();
}

function renderCalendar() {
  renderCalGrid();
  renderDayEvents(selectedDay);
  renderUpcoming();
}

const DOW = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function renderCalGrid() {
  document.getElementById("cal-month-label").textContent = `${MONTHS[calMonth]} ${calYear}`;
  const grid = document.getElementById("cal-grid");
  grid.innerHTML = "";

  // Day-of-week headers (Mon first)
  DOW.forEach(d => {
    const el = document.createElement("div");
    el.className = "cal-dow"; el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(calYear, calMonth, 1);
  // Monday=0 offset
  let startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
  const todayStr    = today();

  const eventsThisMonth = events.filter(e => {
    const [y,m] = e.fecha.split("-");
    return +y === calYear && +m-1 === calMonth;
  });

  const eventsByDay = {};
  eventsThisMonth.forEach(e => {
    const d = +e.fecha.split("-")[2];
    if (!eventsByDay[d]) eventsByDay[d] = [];
    eventsByDay[d].push(e);
  });

  // Prev month days
  for (let i = startOffset - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const el  = makeDayEl(day, calYear, calMonth-1, false, todayStr, [], null);
    el.classList.add("other-month");
    grid.appendChild(el);
  }

  // This month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${pad(calMonth+1)}-${pad(d)}`;
    const evs     = eventsByDay[d] || [];
    const el      = makeDayEl(d, calYear, calMonth, true, todayStr, evs, dateStr);
    if (dateStr === selectedDay) el.classList.add("selected");
    grid.appendChild(el);
  }

  // Next month filler
  const total = startOffset + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    const el = makeDayEl(d, calYear, calMonth+1, false, todayStr, [], null);
    el.classList.add("other-month");
    grid.appendChild(el);
  }
}

function makeDayEl(day, year, month, clickable, todayStr, evs, dateStr) {
  const el = document.createElement("div");
  el.className = "cal-day";
  if (evs.length) el.classList.add("has-events");

  const dateIso = `${year}-${pad(month+1)}-${pad(day)}`;
  if (dateIso === todayStr) el.classList.add("today");

  const num = document.createElement("span");
  num.textContent = day;
  el.appendChild(num);

  if (evs.length) {
    const dots = document.createElement("div");
    dots.className = "event-dots";
    evs.slice(0,3).forEach(e => {
      const dot = document.createElement("div");
      dot.className = "event-dot";
      dot.style.background = e.color || "var(--accent)";
      dots.appendChild(dot);
    });
    el.appendChild(dots);
  }

  if (clickable && dateStr) {
    el.onclick = () => {
      selectedDay = dateStr;
      renderCalGrid();
      renderDayEvents(dateStr);
    };
  }
  return el;
}

function renderDayEvents(dateStr) {
  const label = document.getElementById("cal-day-label");
  const list  = document.getElementById("cal-events-list");

  if (!dateStr) {
    label.textContent = "Próximos eventos";
    list.innerHTML = `<div class="empty"><span class="empty-icon">📅</span>Seleccioná un día.</div>`;
    return;
  }
  const [y,m,d] = dateStr.split("-").map(Number);
  label.textContent = `${d} de ${MONTHS[m-1]} ${y}`;

  const dayEvents = events.filter(e => e.fecha === dateStr);
  if (!dayEvents.length) {
    list.innerHTML = `<div class="empty"><span class="empty-icon">📅</span>Sin eventos para este día.</div>`;
    return;
  }
  list.innerHTML = dayEvents.map(e => eventRowHtml(e)).join("");
}

function renderUpcoming() {
  const list = document.getElementById("upcoming-list");
  const todayStr = today();
  const upcoming = events
    .filter(e => e.fecha >= todayStr && !e.completado)
    .sort((a,b) => a.fecha.localeCompare(b.fecha) || (a.hora||"").localeCompare(b.hora||""))
    .slice(0, 8);

  if (!upcoming.length) {
    list.innerHTML = `<div class="empty"><span class="empty-icon">⏰</span>Sin eventos próximos.</div>`; return;
  }
  list.innerHTML = upcoming.map(e => {
    const [y,m,d] = e.fecha.split("-");
    return `<div class="upcoming-item">
      <div class="upcoming-date" style="border-color:${e.color}22">
        <div class="upcoming-day" style="color:${e.color}">${+d}</div>
        <div class="upcoming-mon">${MONTHS[+m-1].slice(0,3)}</div>
      </div>
      <div class="upcoming-body">
        <div class="upcoming-title">${esc(e.titulo)}</div>
        <div class="upcoming-time">${e.hora || "Todo el día"}${e.notif_minutos ? " · 🔔" : ""}</div>
      </div>
      <div class="event-actions">
        <button class="event-edit-btn" title="Editar" onclick='openEventModal(${JSON.stringify(e)})'>✏️</button>
      </div>
    </div>`;
  }).join("");
}

function eventRowHtml(e) {
  const props = e.propiedades ? Object.entries(e.propiedades) : [];
  return `<div class="event-item ${e.completado ? "done" : ""}">
    <div class="event-dot-big" style="background:${e.color}"></div>
    <div class="event-body">
      <div class="event-title">${esc(e.titulo)}</div>
      <div class="event-meta">
        ${e.hora ? `<span>⏰ ${e.hora}</span>` : "<span>Todo el día</span>"}
        ${e.notif_minutos ? `<span>🔔 Recordatorio</span>` : ""}
      </div>
      ${e.descripcion ? `<div class="event-desc">${esc(e.descripcion)}</div>` : ""}
      ${props.length ? `<div class="event-props">${props.map(([k,v]) =>
        `<span class="prop-tag">${esc(k)}: ${esc(String(v))}</span>`).join("")}</div>` : ""}
    </div>
    <div class="event-actions">
      <button class="event-edit-btn" onclick='openEventModal(${JSON.stringify(e)})'>✏️</button>
      <button class="event-edit-btn" onclick="toggleEventDone(${e.id},${!e.completado})" title="Marcar">
        ${e.completado ? "↩" : "✓"}
      </button>
    </div>
  </div>`;
}

function calPrev() {
  calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalGrid();
}
function calNext() {
  calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalGrid();
}

// ── Event CRUD ─────────────────────────────────────────────────────────────
function openEventModal(ev = null) {
  editingEventId = ev ? ev.id : null;
  selectedColor  = ev ? ev.color : "#8b7cf6";

  document.getElementById("event-modal-title").textContent = ev ? "Editar evento" : "Nuevo evento";
  document.getElementById("ef-titulo").value    = ev?.titulo || "";
  document.getElementById("ef-desc").value      = ev?.descripcion || "";
  document.getElementById("ef-fecha").value     = ev?.fecha || (selectedDay || today());
  document.getElementById("ef-hora").value      = ev?.hora || "";
  document.getElementById("ef-notif").value     = ev?.notif_minutos ? String(ev.notif_minutos) : "";

  // Color
  document.querySelectorAll(".swatch").forEach(s =>
    s.classList.toggle("selected", s.dataset.color === selectedColor));

  // Delete button
  document.getElementById("ef-delete").classList.toggle("hidden", !ev);

  // Properties
  const propsEl = document.getElementById("props-list");
  propsEl.innerHTML = "";
  if (ev?.propiedades) {
    Object.entries(ev.propiedades).forEach(([k,v]) => addPropertyRow(k, String(v)));
  }

  document.getElementById("event-modal").classList.remove("hidden");
}

function closeEventModal() {
  document.getElementById("event-modal").classList.add("hidden");
  editingEventId = null;
}

function selectColor(color, btn) {
  selectedColor = color;
  document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("selected", s.dataset.color === color));
}

function addProperty(key="", val="") { addPropertyRow(key, val); }

function addPropertyRow(key="", val="") {
  const list = document.getElementById("props-list");
  const row  = document.createElement("div");
  row.className = "prop-row";
  row.innerHTML = `
    <input class="prop-key" placeholder="Clave" value="${esc(key)}" />
    <input class="prop-val" placeholder="Valor" value="${esc(val)}" />
    <button class="prop-del" onclick="this.parentElement.remove()">×</button>`;
  list.appendChild(row);
}

async function saveEvent() {
  const titulo = document.getElementById("ef-titulo").value.trim();
  const fecha  = document.getElementById("ef-fecha").value;
  if (!titulo) { showToast("El título es obligatorio", "warning"); return; }
  if (!fecha)  { showToast("La fecha es obligatoria", "warning"); return; }

  const propRows   = document.querySelectorAll("#props-list .prop-row");
  const propiedades = {};
  propRows.forEach(row => {
    const k = row.querySelector(".prop-key").value.trim();
    const v = row.querySelector(".prop-val").value.trim();
    if (k) propiedades[k] = v;
  });

  const notifVal = document.getElementById("ef-notif").value;
  const body = {
    titulo,
    descripcion:   document.getElementById("ef-desc").value.trim() || null,
    fecha,
    hora:          document.getElementById("ef-hora").value || null,
    color:         selectedColor,
    notif_minutos: notifVal ? parseInt(notifVal) : null,
    propiedades,
  };

  try {
    if (editingEventId) {
      await fetch(`/events/${editingEventId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      showToast("Evento actualizado ✓", "success");
    } else {
      await fetch("/events", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      showToast("Evento creado ✓", "success");
    }
    closeEventModal();
    await loadEvents();
    renderCalendar();
  } catch (e) {
    showToast("Error al guardar", "error");
  }
}

async function deleteEventFromModal() {
  if (!editingEventId) return;
  if (!confirm("¿Eliminar este evento?")) return;
  await fetch(`/events/${editingEventId}`, { method: "DELETE" });
  showToast("Evento eliminado", "success");
  closeEventModal();
  await loadEvents();
  renderCalendar();
}

async function toggleEventDone(id, done) {
  await fetch(`/events/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completado: done }),
  });
  await loadEvents();
  renderCalendar();
}

// ═══════════════════════════════════════════════════════
//  MODALS — Slide / Summary / File
// ═══════════════════════════════════════════════════════
function openSlideModal(data) {
  const viewer = document.getElementById("slide-viewer");
  const doc    = new DOMParser().parseFromString(`<div>${data.contenido}</div>`, "text/html");
  const raw    = Array.from(doc.querySelectorAll("section.slide"));
  if (!raw.length) { showToast("No se encontraron diapositivas", "warning"); return; }
  slides = raw; slideIdx = 0;
  viewer.innerHTML = "";
  raw.forEach((s,i) => { s.classList.toggle("active", i===0); viewer.appendChild(s); });
  document.getElementById("slide-modal-title").textContent = data.titulo || "Diapositivas";
  updateSlideCounter();
  document.getElementById("slide-modal").classList.remove("hidden");
}
function closeSlideModal() { document.getElementById("slide-modal").classList.add("hidden"); }
function prevSlide() { if (slideIdx>0) { slideIdx--; showSlide(); } }
function nextSlide() { if (slideIdx<slides.length-1) { slideIdx++; showSlide(); } }
function showSlide() { slides.forEach((s,i) => s.classList.toggle("active", i===slideIdx)); updateSlideCounter(); }
function updateSlideCounter() { document.getElementById("slide-counter").textContent = `${slideIdx+1} / ${slides.length}`; }

function openSummaryModal(data) {
  document.getElementById("summary-modal-title").textContent = data.titulo || "Resumen";
  document.getElementById("summary-body").innerHTML = data.contenido || "<p>Sin contenido.</p>";
  document.getElementById("summary-modal").classList.remove("hidden");
}
function closeSummaryModal() { document.getElementById("summary-modal").classList.add("hidden"); }

// File viewer
const AUDIO_EXTS = new Set([".mp3",".wav",".m4a",".webm",".ogg"]);
const PDF_EXTS   = new Set([".pdf"]);
const TEXT_EXTS  = new Set([".txt",".md",".eml"]);

function openFileViewer(item) {
  const ext  = (item.extension || "").toLowerCase();
  const url  = item.file_url;
  const body = document.getElementById("file-modal-body");
  const dl   = document.getElementById("file-modal-download");
  document.getElementById("file-modal-title").textContent = item.titulo;
  dl.href = url; dl.download = item.titulo;
  body.innerHTML = "";

  if (PDF_EXTS.has(ext)) {
    body.innerHTML = `<iframe src="${url}" title="${esc(item.titulo)}"></iframe>`;
  } else if (TEXT_EXTS.has(ext)) {
    body.innerHTML = `<div class="file-text-wrap" id="ftw">Cargando…</div>`;
    fetch(url).then(r=>r.text()).then(t => document.getElementById("ftw").textContent = t)
              .catch(() => document.getElementById("ftw").textContent = "No se pudo cargar.");
  } else if (ext===".xlsx"||ext===".xls") {
    body.innerHTML = `<div style="padding:20px 24px">
      <p style="font-size:12px;color:var(--tx2);margin-bottom:12px">Vista previa del texto extraído.</p>
      <div class="file-text-wrap">${esc(item.preview||"")}…</div></div>`;
  } else {
    body.innerHTML = `<div class="file-audio-wrap">
      <div class="file-audio-icon">📄</div>
      <div class="file-audio-name">${esc(item.titulo)}</div>
      <p style="color:var(--tx2);font-size:13px;text-align:center">Descargá el archivo para abrirlo.</p></div>`;
  }
  document.getElementById("file-modal").classList.remove("hidden");
}
function closeFileModal() {
  document.getElementById("file-modal-body").querySelectorAll("audio,video,iframe").forEach(el => {
    try { el.src=""; } catch(_){}
  });
  document.getElementById("file-modal").classList.add("hidden");
}

// Keyboard
document.addEventListener("keydown", e => {
  if (!document.getElementById("slide-modal").classList.contains("hidden")) {
    if (e.key==="ArrowRight"||e.key==="ArrowDown") nextSlide();
    if (e.key==="ArrowLeft" ||e.key==="ArrowUp")   prevSlide();
    if (e.key==="Escape") closeSlideModal();
  }
  if (!document.getElementById("summary-modal").classList.contains("hidden") && e.key==="Escape") closeSummaryModal();
  if (!document.getElementById("file-modal").classList.contains("hidden")    && e.key==="Escape") closeFileModal();
  if (!document.getElementById("event-modal").classList.contains("hidden")   && e.key==="Escape") closeEventModal();
});

// Overlay click
["slide-modal","summary-modal","file-modal","event-modal"].forEach(id => {
  document.getElementById(id).addEventListener("click", e => {
    if (e.target.id === id) {
      if (id==="slide-modal")   closeSlideModal();
      if (id==="summary-modal") closeSummaryModal();
      if (id==="file-modal")    closeFileModal();
      if (id==="event-modal")   closeEventModal();
    }
  });
});

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════
function chipClass(tipo) {
  return {PDF:"chip-pdf",Audio:"chip-audio",Excel:"chip-excel",
    CSV:"chip-csv",Texto:"chip-texto",Markdown:"chip-markdown",Email:"chip-email"}[tipo]||"chip-otro";
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}
function fmtSimpleDate(iso) {
  const [y,m,d] = iso.split("-"); return `${d}/${m}/${y}`;
}
function today() { return new Date().toISOString().split("T")[0]; }
function pad(n)  { return String(n).padStart(2,"0"); }
function esc(s)  {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

let toastTimer;
function showToast(msg, type="info") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3600);
}
