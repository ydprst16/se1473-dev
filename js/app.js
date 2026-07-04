/*
| SE Monitoring Center — app.js v5 (Pencacah + Pengawas)
| PERUBAHAN v5:
|   - Role Pengawas sekarang pakai progressReview
|     (Approved + Edited + Rejected + Revoked) / Assignment
|   - KPI card "Progress Approve" -> "Progress Review"
|   - Comparison (kemarin vs hari ini) ikut pakai progressReview
*/

document.addEventListener("DOMContentLoaded", init);

/* ========= Global state ========= */
let currentRole = "pencacah";
let viewedDate = null;

function apiURL(action, extra = {}) {
  const params = new URLSearchParams({ action, role: currentRole, ...extra });
  return "api/history.php?" + params.toString();
}
const LATEST_URL = () => apiURL("latest-raw");

/* ========= KPI config per role ========= */
const KPI_CONFIG = {
  pencacah: {
    subtitle: "Monitoring Pencacah • Kota Dumai",
    cards: [
      { id: "assignment", title: "Assignment" },
      { id: "open", title: "Open" },
      { id: "draft", title: "Draft" },
      { id: "submitted", title: "Submitted" },
      { id: "approved", title: "Approved" },
      { id: "rejected", title: "Rejected" },
      { id: "revoke", title: "Revoke" },
      { id: "progress", title: "Progress" },
    ],
    rankingTitle: "Top Progress Pencacah",
    tableTitle: "Data Enumerator",
  },
  pengawas: {
    subtitle: "Monitoring Pengawas • Kota Dumai",
    cards: [
      { id: "assignment", title: "Assignment" },
      { id: "open", title: "Open" },
      { id: "draft", title: "Draft" },
      { id: "submitted", title: "Backlog Approval", backlogColor: true },
      { id: "approved", title: "Approved" },
      { id: "rejected", title: "Rejected" },
      { id: "revoke", title: "Revoke" },
      { id: "progress", title: "Progress Review" },   // ← ganti label
    ],
    rankingTitle: "Top Progress Pengawas",
    tableTitle: "Data Pengawas",
  },
};

/* ========= Helpers ========= */
function formatDateID(d) {
  if (!d) return "-";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return "-";
  const bulan = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${bulan[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toYMDinJakarta(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function todayYMD() { return toYMDinJakarta(new Date()); }

/* ========= Helper: ambil field progress sesuai role ========= */
function progressForRole(obj) {
  if (!obj) return 0;
  return currentRole === "pengawas"
    ? (obj.progressReview ?? 0)   // ← ganti dari progressApprove
    : (obj.progressTotal  ?? 0);
}

/* ========= Load data ========= */
async function loadByDate(date) {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    viewedDate = date;
    await loadDashboard(apiURL("get", { date }));
    return;
  }
  viewedDate = null;
  try {
    const head = await fetch(LATEST_URL(), { method: "HEAD", cache: "no-store" });
    if (head.ok) { await loadDashboard(LATEST_URL()); return; }
  } catch (_) { /* fallthrough */ }
  const res = await fetch(apiURL("latest"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Belum ada data ${currentRole}`);
  const p = await res.json();
  if (p.status !== "ok" || !Array.isArray(p.data))
    throw new Error(p.message || "Format tidak valid");
  if (p.source === "history" && p.date) {
    viewedDate = p.date;
    await loadDashboard(apiURL("get", { date: p.date }));
  } else {
    await loadDashboard(LATEST_URL());
  }
}

/* ========= Last Update ========= */
async function updateLastUpdate() {
  const el = document.getElementById("lastUpdate");
  if (!el) return;

  if (viewedDate) {
    try {
      const res = await fetch(apiURL("snapshot-meta", { date: viewedDate }), { cache: "no-store" });
      if (res.ok) {
        const meta = await res.json();
        if (meta.status === "ok" && meta.mtime) {
          el.textContent = formatDateID(new Date(meta.mtime)) + " (snapshot)";
          return;
        }
      }
    } catch (e) { console.warn("[lastUpdate] snapshot-meta:", e); }
    el.textContent = formatDateID(new Date(viewedDate + "T00:00:00")) + " (snapshot)";
    return;
  }

  try {
    const res = await fetch(apiURL("latest-meta"), { cache: "no-store" });
    if (res.ok) {
      const meta = await res.json();
      if (meta.status === "ok" && meta.mtime) {
        el.textContent = formatDateID(new Date(meta.mtime));
        return;
      }
    }
  } catch (e) { console.warn("[lastUpdate]:", e); }
  const t = (Dashboard && Dashboard.meta && Dashboard.meta.loadedAt) || new Date();
  el.textContent = formatDateID(t);
}

async function isLatestUpdatedToday() {
  try {
    const res = await fetch(apiURL("latest-meta"), { cache: "no-store" });
    if (!res.ok) return false;
    const meta = await res.json();
    if (meta.status !== "ok" || !meta.mtime) return false;
    return toYMDinJakarta(new Date(meta.mtime)) === todayYMD();
  } catch { return false; }
}

/* ========= Render All ========= */
async function renderAll() {
  if (!viewedDate && typeof autoSnapshotToday === "function") {
    if (await isLatestUpdatedToday()) await autoSnapshotToday();
  }
  if (typeof loadPreviousDay === "function") {
    await loadPreviousDay(viewedDate || todayYMD());
  }
  applyRoleUI();
  renderCards();
  renderProgress();
  await updateLastUpdate();
  if (typeof renderCharts === "function") renderCharts();
  if (typeof renderTable === "function") renderTable();
  if (typeof renderComparison === "function") renderComparison();
}

async function init() {
  bindEvents();
  applyRoleUI();
  try {
    showLoading();
    await loadByDate(null);
    await populateViewDateOptions();
    await renderAll();
    hideLoading();
  } catch (err) {
    hideLoading();
    console.warn("[init] Data awal gagal di-load:", err);
    Swal.fire({
      icon: "info", title: "Belum ada data",
      text: "Silakan upload file JSON untuk memulai.",
      timer: 3500, showConfirmButton: false,
    });
  }
}

/* ========= Dropdown snapshot ========= */
async function populateViewDateOptions() {
  const sel = document.getElementById("viewDate");
  if (!sel) return;
  try {
    const res = await fetch(apiURL("list"), { cache: "no-store" });
    const j = await res.json();
    const items = j && j.status === "ok" && Array.isArray(j.items) ? j.items : [];
    const bln = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    let html = `<option value="">— Data Terbaru —</option>`;
    items.forEach((it) => {
      const [y, m, d] = it.date.split("-");
      html += `<option value="${it.date}">${d} ${bln[parseInt(m, 10) - 1]} ${y}</option>`;
    });
    sel.innerHTML = html;
    if (viewedDate) sel.value = viewedDate;
  } catch (e) { console.warn("[viewDate]:", e); }
}

/* ========= Apply role UI ========= */
function applyRoleUI() {
  const cfg = KPI_CONFIG[currentRole];
  const sub = document.querySelector(".logo .sub-title");
  if (sub) sub.textContent = cfg.subtitle;

  cfg.cards.forEach((c) => {
    const valueEl = document.getElementById(c.id);
    if (!valueEl) return;
    const card = valueEl.closest(".kpi-card");
    if (!card) return;
    const titleEl = card.querySelector(".kpi-title");
    if (titleEl) titleEl.textContent = c.title;
    card.dataset.backlogColor = c.backlogColor ? "1" : "0";
  });

  const rank = document.getElementById("rankingTitle");
  if (rank) rank.textContent = cfg.rankingTitle;
  const tbl = document.getElementById("tableTitle");
  if (tbl) tbl.textContent = cfg.tableTitle;

  document.querySelectorAll("[data-role-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.roleTab === currentRole);
  });
}

/* ========= KPI cards ========= */
function renderCards() {
  const s = Dashboard.summary;
  setText("assignment", formatNumber(s.assignment));
  setText("open", formatNumber(s.open));
  setText("draft", formatNumber(s.draft));
  setText("submitted", formatNumber(s.submitted));
  setText("approved", formatNumber(s.approved));
  setText("rejected", formatNumber(s.rejected));
  setText("revoke", formatNumber(s.revoked));

  const prog = progressForRole(s);      // ← role-aware
  setText("progress", prog.toFixed(2) + "%");

  applyBacklogColor(s.submitted);

  const prev = typeof Comparison !== "undefined" ? Comparison.previousSummary : null;
  renderChange("assignmentChange", s.assignment, prev ? prev.assignment : null);
  renderChange("openChange",       s.open,       prev ? prev.open : null);
  renderChange("draftChange",      s.draft,      prev ? prev.draft : null);
  renderChange("submittedChange",  s.submitted,  prev ? prev.submitted : null);
  renderChange("approvedChange",   s.approved,   prev ? prev.approved : null);
  renderChange("rejectedChange",   s.rejected,   prev ? prev.rejected : null);
  renderChange("revokeChange",     s.revoked,    prev ? prev.revoked : null);

  const prevProg = prev ? progressForRole(prev) : null;
  renderChange("progressChange", prog, prevProg, true);
}

function applyBacklogColor(count) {
  const el = document.getElementById("submitted");
  if (!el) return;
  const card = el.closest(".kpi-card");
  if (!card) return;
  el.style.color = "";
  card.classList.remove("backlog-green", "backlog-yellow", "backlog-red");
  if (card.dataset.backlogColor !== "1") return;
  let cls, color;
  if (count < 10)      { cls = "backlog-green";  color = "#22c55e"; }
  else if (count < 50) { cls = "backlog-yellow"; color = "#f59e0b"; }
  else                 { cls = "backlog-red";    color = "#ef4444"; }
  card.classList.add(cls);
  el.style.color = color;
}

function renderChange(id, today, yesterday, isPercent = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (yesterday === null || typeof yesterday !== "number") {
    el.className = "kpi-change";
    el.style.color = "#9ca3af";
    el.textContent = "—";
    return;
  }
  const diff = today - yesterday;
  const rounded = isPercent ? Number(diff.toFixed(2)) : Math.round(diff);
  if (rounded === 0) {
    el.className = "kpi-change";
    el.style.color = "#9ca3af";
    el.textContent = isPercent ? "▬ 0%" : "▬ 0";
    return;
  }
  const up = rounded > 0;
  el.className = "kpi-change " + (up ? "up" : "down");
  el.style.color = up ? "#22c55e" : "#ef4444";
  el.textContent = up
    ? isPercent ? "▲ +" + rounded.toFixed(2) + "%" : "▲ +" + formatNumber(rounded)
    : isPercent ? "▼ " + rounded.toFixed(2) + "%"  : "▼ -" + formatNumber(Math.abs(rounded));
}

function renderProgress() {
  const s = Dashboard.summary;
  const progress = progressForRole(s);       // ← role-aware
  const bar = document.getElementById("overallProgress");
  if (!bar) return;
  bar.style.width = progress + "%";
  bar.innerHTML = progress.toFixed(2) + "%";
  const txt = document.getElementById("progressText");
  if (txt) txt.innerHTML = progress.toFixed(2) + "%";
}

/* ========= Switch Role ========= */
async function switchRole(newRole) {
  if (newRole === currentRole) return;
  currentRole = newRole;
  viewedDate = null;

  applyRoleUI();
  const viewDateEl = document.getElementById("viewDate");
  if (viewDateEl) viewDateEl.value = "";

  try {
    showLoading();
    await loadByDate(null);
    await populateViewDateOptions();
    await renderAll();
    hideLoading();
    toast("info", `Menampilkan data ${newRole === "pengawas" ? "Pengawas" : "Pencacah"}`);
  } catch (err) {
    hideLoading();
    if (typeof Dashboard !== "undefined") {
      Dashboard.summary = {
        assignment: 0, open: 0, draft: 0, submitted: 0,
        approved: 0, edited: 0, rejected: 0, revoked: 0,
        reviewed: 0, completed: 0, remaining: 0,
        progressTotal: 0, progressApprove: 0, progressReview: 0, progressSubmit: 0,
      };
      Dashboard.enumerators = [];
    }
    renderCards();
    renderProgress();
    if (typeof Comparison !== "undefined") {
      Comparison.previousMap = {};
      Comparison.previousSummary = null;
      Comparison.available = false;
    }
    if (typeof renderComparison === "function") renderComparison();
    if (typeof renderTable === "function") renderTable();
    if (typeof renderCharts === "function") renderCharts();
    await updateLastUpdate();
    await populateViewDateOptions();

    Swal.fire({
      icon: "info",
      title: `Belum ada data ${newRole === "pengawas" ? "Pengawas" : "Pencacah"}`,
      text: `Upload file JSON ${newRole} untuk mulai.`,
      timer: 3000, showConfirmButton: false,
    });
  }
}

/* ========= Events ========= */
function bindEvents() {
  document.querySelectorAll("[data-role-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchRole(btn.dataset.roleTab));
  });

  const viewDateEl = document.getElementById("viewDate");
  if (viewDateEl) {
    viewDateEl.addEventListener("change", async (e) => {
      const d = e.target.value;
      if (!d) return;
      try {
        showLoading();
        await loadByDate(d);
        await renderAll();
        hideLoading();
        toast("info", `Menampilkan ${currentRole} ${d}`);
      } catch (err) {
        hideLoading();
        Swal.fire({ icon: "error", title: "Snapshot tidak ditemukan",
          text: `Tidak ada data ${currentRole} untuk ${d}.` });
        viewDateEl.value = "";
        viewedDate = null;
      }
    });
  }

  const btnViewLatest = document.getElementById("btnViewLatest");
  if (btnViewLatest)
    btnViewLatest.addEventListener("click", async () => {
      try {
        showLoading();
        if (viewDateEl) viewDateEl.value = "";
        await loadByDate(null);
        await renderAll();
        hideLoading();
        toast("success", "Kembali ke data terbaru");
      } catch (e) {
        hideLoading();
        Swal.fire({ icon: "error", title: "Gagal", text: e.message });
      }
    });

  const refresh = document.getElementById("btnRefresh");
  if (refresh)
    refresh.addEventListener("click", async () => {
      try {
        showLoading();
        await loadByDate(viewedDate);
        await renderAll();
        hideLoading();
        toast("success", "Data berhasil dimuat ulang");
      } catch (e) {
        hideLoading();
        Swal.fire({ icon: "error", title: "Gagal Refresh", text: e.message });
      }
    });

  const btnOpen = document.getElementById("btnOpenUpload");
  if (btnOpen)
    btnOpen.addEventListener("click", async () => {
      const fileInput = document.getElementById("jsonFile");
      const dateInput = document.getElementById("jsonDate");
      if (fileInput) fileInput.value = "";
      if (dateInput) dateInput.value = todayYMD();
      await refreshSnapshotList();
      new bootstrap.Modal(document.getElementById("uploadModal")).show();
    });

  const fileInputChange = document.getElementById("jsonFile");
  if (fileInputChange)
    fileInputChange.addEventListener("change", () => {
      const f = fileInputChange.files && fileInputChange.files[0];
      if (!f) return;
      const m = f.name.match(/(\d{4}-\d{2}-\d{2})/);
      if (m) {
        const dateInput = document.getElementById("jsonDate");
        if (dateInput) dateInput.value = m[1];
      }
    });

  const btnUpload = document.getElementById("btnUpload");
  if (btnUpload)
    btnUpload.addEventListener("click", async () => {
      const fileInput = document.getElementById("jsonFile");
      const dateInput = document.getElementById("jsonDate");
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        Swal.fire({ icon: "warning", title: "File belum dipilih", text: "Pilih file .json dulu" });
        return;
      }
      if (!/\.json$/i.test(file.name)) {
        Swal.fire({ icon: "warning", title: "Format salah", text: "File harus .json" });
        return;
      }

      const pickedDate = (dateInput && dateInput.value) || todayYMD();
      const today = todayYMD();
      const isToday = pickedDate === today;
      if (pickedDate > today) {
        Swal.fire({ icon: "warning", title: "Tanggal tidak valid", text: "Tidak boleh masa depan." });
        return;
      }

      try {
        btnUpload.disabled = true;
        btnUpload.innerHTML = "Mengunggah...";
        let result;
        if (isToday) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("api/history.php?action=upload-latest", { method: "POST", body: fd });
          result = await res.json();
          if (!res.ok || result.status !== "ok") throw new Error(result.message || `HTTP ${res.status}`);
        } else {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("date", pickedDate);
          const res = await fetch("api/history.php?action=upload", { method: "POST", body: fd });
          result = await res.json();
          if (!res.ok || result.status !== "ok") throw new Error(result.message || `HTTP ${res.status}`);
        }

        const detectedRole = result.role || currentRole;
        const modalEl = document.getElementById("uploadModal");
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        showLoading();
        if (detectedRole !== currentRole) currentRole = detectedRole;
        if (isToday) {
          viewedDate = null;
          const vde = document.getElementById("viewDate");
          if (vde) vde.value = "";
        }
        applyRoleUI();
        await loadByDate(viewedDate);
        await populateViewDateOptions();
        await renderAll();
        hideLoading();
        toast("success", isToday
          ? `Upload sukses — ${detectedRole} hari ini (${pickedDate})`
          : `Snapshot ${detectedRole} ${pickedDate} tersimpan`);
      } catch (err) {
        Swal.fire({ icon: "error", title: "Upload Gagal", text: err.message });
      } finally {
        btnUpload.disabled = false;
        btnUpload.innerHTML = "Upload";
      }
    });

  const btnDark = document.getElementById("btnDarkMode");
  if (btnDark)
    btnDark.addEventListener("click", () => {
      const html = document.documentElement;
      const cur = html.getAttribute("data-bs-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      html.setAttribute("data-bs-theme", next);
      btnDark.innerHTML = next === "dark" ? `<i class="fa fa-moon"></i>` : `<i class="fa fa-sun"></i>`;
    });

  const btnFs = document.getElementById("btnFullscreen");
  if (btnFs)
    btnFs.addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
}

/* ========= Utils ========= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function toast(icon, title) {
  if (typeof Swal === "undefined") return;
  Swal.fire({ toast: true, position: "top-end", icon, title, timer: 2500, showConfirmButton: false });
}
function showLoading() { document.body.style.cursor = "wait"; }
function hideLoading() { document.body.style.cursor = "default"; }

async function refreshSnapshotList() {
  const el = document.getElementById("snapshotList");
  if (!el) return;
  el.textContent = "memuat...";
  try {
    const res = await fetch(apiURL("list"), { cache: "no-store" });
    const j = await res.json();
    if (j.status === "ok" && Array.isArray(j.items) && j.items.length) {
      el.textContent = j.items.map((x) => x.date).join(", ");
    } else {
      el.textContent = "(belum ada snapshot)";
    }
  } catch { el.textContent = "(gagal memuat)"; }
}📄 processor.js (Full Code)
/*
|--------------------------------------------------------------------------
| SE Monitoring Center
| processor.js  (v2 — Pengawas Progress Review support)
|--------------------------------------------------------------------------
| Bertugas mengubah raw JSON menjadi object Dashboard
| yang siap dipakai oleh Cards, Charts dan Grid.
|
| PERUBAHAN v2:
|   1. Menambah bucket "edited" (gabungan "EDITED BY Admin Kabupaten"
|      dan "EDITED BY Pengawas").
|   2. Progress Pengawas baru: progressReview
|      = (approved + edited + rejected + revoked) / assignment.
|   3. progressTotal (Pencacah) sekarang juga memperhitungkan edited.
|   4. buildRankings & buildDistribution sekarang role-aware
|      (memakai currentRole global dari app.js).
|--------------------------------------------------------------------------
*/

const Dashboard = {
  raw: [],

  summary: {
    assignment: 0,
    open: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    edited: 0,          // NEW
    rejected: 0,
    revoked: 0,
    reviewed: 0,        // NEW  = approved + edited + rejected + revoked
    completed: 0,       // = submitted + reviewed
    remaining: 0,
    progressSubmit: 0,
    progressApprove: 0,
    progressReview: 0,  // NEW — dipakai role Pengawas
    progressTotal: 0,   // dipakai role Pencacah
  },

  enumerators: [],
  districts: [],

  rankings: {
    topProgress: [],
    bottomProgress: [],
    topSubmit: [],
    topApprove: [],
    topReview: [],       // NEW — ranking Pengawas
    topAssignment: [],
  },

  distribution: {
    "0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0,
  },

  status: [],
  filters: { districts: [], usernames: [] },
  searchIndex: {},

  meta: {
    source: null,
    loadedAt: null,
    totalEnumerator: 0,
    totalDistrict: 0,
    version: "2.0.0",
  },
};

const STATUS_MAP = {
  OPEN: "open",
  DRAFT: "draft",
  "SUBMITTED BY Pencacah": "submitted",
  "APPROVED BY Pengawas": "approved",
  "REJECTED BY Pengawas": "rejected",
  "REVOKED BY Pengawas": "revoked",
  "EDITED BY Admin Kabupaten": "edited", // NEW
  "EDITED BY Pengawas": "edited",        // NEW
};

const PROGRESS_BUCKETS = ["0-20", "20-40", "40-60", "60-80", "80-100"];

const REGION_MAP = {
  1473010: "BUKIT KAPUR",
  1473011: "MEDANG KAMPAI",
  1473012: "SUNGAI SEMBILAN",
  1473020: "DUMAI BARAT",
  1473021: "DUMAI SELATAN",
  1473030: "DUMAI TIMUR",
  1473031: "DUMAI KOTA",
};

/* Helper: role saat ini (dari app.js) */
function getRole() {
  return typeof currentRole !== "undefined" ? currentRole : "pencacah";
}

/* Helper: pilih field progress sesuai role */
function pickProgress(item) {
  return getRole() === "pengawas"
    ? (item.progressReview ?? 0)
    : (item.progressTotal ?? 0);
}

function getStatusCount(statusBreakdown, statusName) {
  const status = statusBreakdown.find((item) => item.status === statusName);
  return status ? Number(status.count) : 0;
}

function percentage(value, total) {
  if (total === 0) return 0;
  return Number(((value / total) * 100).toFixed(2));
}

/* ==========================================================================
 | Memuat file JSON
 |========================================================================== */
async function loadDashboard(jsonFile = "data/latest.json") {
  try {
    Dashboard.meta.source = jsonFile;
    Dashboard.meta.loadedAt = new Date();

    const response = await fetch(jsonFile, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("Format JSON harus berupa Array.");

    Dashboard.raw = data;
    processDashboard();
    return Dashboard;
  } catch (err) {
    console.error("Gagal memuat dashboard :", err);
    Dashboard.raw = [];
    resetDashboard();
    if (typeof Swal !== "undefined") {
      Swal.fire({ icon: "error", title: "Gagal Memuat Data", text: err.message });
    }
  }
}

/* ==========================================================================
 | Reset seluruh object dashboard
 |========================================================================== */
function resetDashboard() {
  Dashboard.summary = {
    assignment: 0, open: 0, draft: 0, submitted: 0,
    approved: 0, edited: 0, rejected: 0, revoked: 0,
    reviewed: 0, completed: 0, remaining: 0,
    progressSubmit: 0, progressApprove: 0, progressReview: 0, progressTotal: 0,
  };

  Dashboard.enumerators = [];
  Dashboard.districts = [];

  Dashboard.rankings = {
    topProgress: [], bottomProgress: [],
    topSubmit: [], topApprove: [], topReview: [], topAssignment: [],
  };

  Dashboard.distribution = { "0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 };
  Dashboard.status = [];
  Dashboard.filters = { districts: [], usernames: [] };
  Dashboard.searchIndex = {};
  Dashboard.meta.totalEnumerator = 0;
  Dashboard.meta.totalDistrict = 0;
}

/* ==========================================================================
 | Main Processor
 |========================================================================== */
function processDashboard() {
  console.clear();
  console.time("Process Dashboard");
  resetDashboard();

  if (!Dashboard.raw || Dashboard.raw.length === 0) {
    console.warn("Dashboard.raw kosong");
    return;
  }

  Dashboard.raw.forEach((user) => processEnumerator(user));
  buildDistrict();
  calculateSummary();
  buildRankings();
  buildDistribution();
  buildStatus();
  buildFilters();
  buildSearchIndex();
  validateData();
  buildMeta();

  console.timeEnd("Process Dashboard");
  console.log("========== FINAL DASHBOARD ==========", Dashboard);
}

/* ==========================================================================
 | Build Rankings (ROLE-AWARE)
 |========================================================================== */
function buildRankings() {
  const data = [...Dashboard.enumerators];
  const role = getRole();

  const progressGetter = (x) =>
    role === "pengawas" ? (x.progressReview ?? 0) : (x.progressTotal ?? 0);

  Dashboard.rankings.topProgress = [...data]
    .sort((a, b) => progressGetter(b) - progressGetter(a))
    .slice(0, 10);

  Dashboard.rankings.bottomProgress = [...data]
    .sort((a, b) => progressGetter(a) - progressGetter(b))
    .slice(0, 10);

  Dashboard.rankings.topSubmit = [...data]
    .sort((a, b) => b.submitted - a.submitted).slice(0, 10);

  Dashboard.rankings.topApprove = [...data]
    .sort((a, b) => b.approved - a.approved).slice(0, 10);

  Dashboard.rankings.topReview = [...data]
    .sort((a, b) => b.reviewed - a.reviewed).slice(0, 10);

  Dashboard.rankings.topAssignment = [...data]
    .sort((a, b) => b.assignment - a.assignment).slice(0, 10);
}

/* ==========================================================================
 | Build Distribution (ROLE-AWARE)
 |========================================================================== */
function buildDistribution() {
  Dashboard.distribution = { "0-20": 0, "20-40": 0, "40-60": 0, "60-80": 0, "80-100": 0 };

  Dashboard.enumerators.forEach((item) => {
    const p = pickProgress(item);
    if (p < 20)      Dashboard.distribution["0-20"]++;
    else if (p < 40) Dashboard.distribution["20-40"]++;
    else if (p < 60) Dashboard.distribution["40-60"]++;
    else if (p < 80) Dashboard.distribution["60-80"]++;
    else             Dashboard.distribution["80-100"]++;
  });
}

/* ==========================================================================
 | Build Status Dataset (7 kolom)
 | Urutan: open, draft, submitted, approved, edited, rejected, revoked
 |========================================================================== */
function buildStatus() {
  const s = Dashboard.summary;
  Dashboard.status = [
    s.open, s.draft, s.submitted,
    s.approved, s.edited, s.rejected, s.revoked,
  ];
}

/* ==========================================================================
 | Build Filters
 |========================================================================== */
function buildFilters() {
  Dashboard.filters.usernames = Dashboard.enumerators
    .map((item) => item.username)
    .sort((a, b) => a.localeCompare(b));

  Dashboard.filters.districts = Dashboard.districts
    .map((item) => ({ value: item.regionCode, label: item.name ?? item.regionCode }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/* ==========================================================================
 | Build Search Index
 |========================================================================== */
function buildSearchIndex() {
  Dashboard.searchIndex = {};
  Dashboard.enumerators.forEach((item, index) => {
    Dashboard.searchIndex[item.username.toLowerCase()] = index;
  });
}

/* ==========================================================================
 | Validate
 |========================================================================== */
function validateData() {
  Dashboard.enumerators.forEach((item) => {
    if (item.assignment <= 0)             console.warn(`[${item.username}] Assignment = 0`);
    if (item.approved  > item.assignment) console.warn(`[${item.username}] Approved melebihi Assignment`);
    if (item.submitted > item.assignment) console.warn(`[${item.username}] Submitted melebihi Assignment`);
    if (item.edited    > item.assignment) console.warn(`[${item.username}] Edited melebihi Assignment`);
    if (item.reviewed  > item.assignment) console.warn(`[${item.username}] Reviewed melebihi Assignment`);
  });
}

/* ==========================================================================
 | Build Metadata
 |========================================================================== */
function buildMeta() {
  Dashboard.meta.totalEnumerator = Dashboard.enumerators.length;
  Dashboard.meta.totalDistrict   = Dashboard.districts.length;
  Dashboard.meta.generatedAt     = new Date().toISOString();
}

/* ==========================================================================
 | Process 1 User
 |========================================================================== */
function processEnumerator(user) {
  const enumerator = {
    username: user.username,
    assignment: safeNumber(user.total),

    open: 0, draft: 0, submitted: 0,
    approved: 0, edited: 0, rejected: 0, revoked: 0,
    reviewed: 0, completed: 0,

    progressSubmit: 0, progressApprove: 0,
    progressReview: 0, progressTotal: 0,

    regions: [],
  };

  Dashboard.summary.assignment += enumerator.assignment;

  user.regionSummary.forEach((region) => {
    const result = processRegion(region);
    enumerator.open       += result.open;
    enumerator.draft      += result.draft;
    enumerator.submitted  += result.submitted;
    enumerator.approved   += result.approved;
    enumerator.edited     += result.edited;
    enumerator.rejected   += result.rejected;
    enumerator.revoked    += result.revoked;
    enumerator.regions.push(result);
  });

  Dashboard.summary.open       += enumerator.open;
  Dashboard.summary.draft      += enumerator.draft;
  Dashboard.summary.submitted  += enumerator.submitted;
  Dashboard.summary.approved   += enumerator.approved;
  Dashboard.summary.edited     += enumerator.edited;
  Dashboard.summary.rejected   += enumerator.rejected;
  Dashboard.summary.revoked    += enumerator.revoked;

  calculateProgress(enumerator);
  Dashboard.enumerators.push(enumerator);
}

/* ==========================================================================
 | Process 1 Kecamatan
 |========================================================================== */
function processRegion(region) {
  return {
    kdsubsls: String(region.regionCode),
    regionCode: Number(String(region.regionCode).substring(0, 7)),
    assignment: safeNumber(region.total),
    open:      getStatusCount(region.statusBreakdown, "OPEN"),
    draft:     getStatusCount(region.statusBreakdown, "DRAFT"),
    submitted: getStatusCount(region.statusBreakdown, "SUBMITTED BY Pencacah"),
    approved:  getStatusCount(region.statusBreakdown, "APPROVED BY Pengawas"),
    rejected:  getStatusCount(region.statusBreakdown, "REJECTED BY Pengawas"),
    revoked:   getStatusCount(region.statusBreakdown, "REVOKED BY Pengawas"),
    edited:
      getStatusCount(region.statusBreakdown, "EDITED BY Admin Kabupaten") +
      getStatusCount(region.statusBreakdown, "EDITED BY Pengawas"),
  };
}

/* ==========================================================================
 | Hitung Progress Enumerator / Pengawas
 |
 | Progress Submit  = Submitted / Assignment
 | Progress Approve = Approved  / Assignment
 | Progress Review  = (Approved + Edited + Rejected + Revoked) / Assignment
 |                    → Dashboard Pengawas
 | Progress Total   = (Submitted + Approved + Edited + Rejected + Revoked)
 |                    / Assignment
 |                    → Dashboard Pencacah
 |========================================================================== */
function calculateProgress(item) {
  if (item.assignment <= 0) {
    item.progressSubmit = 0;
    item.progressApprove = 0;
    item.progressReview = 0;
    item.progressTotal = 0;
    item.reviewed = 0;
    item.completed = 0;
    return;
  }

  item.reviewed  = item.approved + item.edited + item.rejected + item.revoked;
  item.completed = item.submitted + item.reviewed;

  item.progressSubmit  = percentage(item.submitted, item.assignment);
  item.progressApprove = percentage(item.approved,  item.assignment);
  item.progressReview  = percentage(item.reviewed,  item.assignment);
  item.progressTotal   = percentage(item.completed, item.assignment);
}

/* ==========================================================================
 | Build District Summary
 |========================================================================== */
function buildDistrict() {
  const districtMap = new Map();

  Dashboard.enumerators.forEach((enumerator) => {
    enumerator.regions.forEach((region) => {
      if (!districtMap.has(region.regionCode)) {
        districtMap.set(region.regionCode, {
          regionCode: region.regionCode,
          name: REGION_MAP[region.regionCode] ?? region.regionCode,
          assignment: 0,
          open: 0, draft: 0, submitted: 0,
          approved: 0, edited: 0, rejected: 0, revoked: 0,
          reviewed: 0, completed: 0,
          progressSubmit: 0, progressApprove: 0,
          progressReview: 0, progressTotal: 0,
          enumerators: 0,
        });
      }

      const d = districtMap.get(region.regionCode);
      d.assignment += region.assignment;
      d.open       += region.open;
      d.draft      += region.draft;
      d.submitted  += region.submitted;
      d.approved   += region.approved;
      d.edited     += region.edited;
      d.rejected   += region.rejected;
      d.revoked    += region.revoked;
      d.reviewed   += region.approved + region.edited + region.rejected + region.revoked;
      d.completed  += region.submitted + region.approved + region.edited + region.rejected + region.revoked;
      d.enumerators++;
    });
  });

  Dashboard.districts = Array.from(districtMap.values());

  Dashboard.districts.forEach((d) => {
    d.progressSubmit  = percentage(d.submitted, d.assignment);
    d.progressApprove = percentage(d.approved,  d.assignment);
    d.progressReview  = percentage(d.reviewed,  d.assignment);
    d.progressTotal   = percentage(d.completed, d.assignment);
  });
}

/* ==========================================================================
 | Calculate National Summary
 |
 | PENCACAH  : progressTotal   = completed / assignment
 |             completed       = submitted + approved + edited + rejected + revoked
 |
 | PENGAWAS  : progressReview  = reviewed  / assignment
 |             reviewed        = approved + edited + rejected + revoked
 |========================================================================== */
function calculateSummary() {
  const s = Dashboard.summary;
  s.reviewed  = s.approved + s.edited + s.rejected + s.revoked;
  s.completed = s.submitted + s.reviewed;

  s.progressSubmit  = percentage(s.submitted, s.assignment);
  s.progressApprove = percentage(s.approved,  s.assignment);
  s.progressReview  = percentage(s.reviewed,  s.assignment); // dashboard Pengawas
  s.progressTotal   = percentage(s.completed, s.assignment); // dashboard Pencacah

  s.remaining = Math.max(0, s.assignment - s.completed);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function reloadDashboard() {
  return loadDashboard(Dashboard.meta.source);
}
📄 app.js (Full Code)
/*
| SE Monitoring Center — app.js v5 (Pencacah + Pengawas)
| PERUBAHAN v5:
|   - Role Pengawas sekarang pakai progressReview
|     (Approved + Edited + Rejected + Revoked) / Assignment
|   - KPI card "Progress Approve" -> "Progress Review"
|   - Comparison (kemarin vs hari ini) ikut pakai progressReview
*/

document.addEventListener("DOMContentLoaded", init);

/* ========= Global state ========= */
let currentRole = "pencacah";
let viewedDate = null;

function apiURL(action, extra = {}) {
  const params = new URLSearchParams({ action, role: currentRole, ...extra });
  return "api/history.php?" + params.toString();
}
const LATEST_URL = () => apiURL("latest-raw");

/* ========= KPI config per role ========= */
const KPI_CONFIG = {
  pencacah: {
    subtitle: "Monitoring Pencacah • Kota Dumai",
    cards: [
      { id: "assignment", title: "Assignment" },
      { id: "open", title: "Open" },
      { id: "draft", title: "Draft" },
      { id: "submitted", title: "Submitted" },
      { id: "approved", title: "Approved" },
      { id: "rejected", title: "Rejected" },
      { id: "revoke", title: "Revoke" },
      { id: "progress", title: "Progress" },
    ],
    rankingTitle: "Top Progress Pencacah",
    tableTitle: "Data Enumerator",
  },
  pengawas: {
    subtitle: "Monitoring Pengawas • Kota Dumai",
    cards: [
      { id: "assignment", title: "Assignment" },
      { id: "open", title: "Open" },
      { id: "draft", title: "Draft" },
      { id: "submitted", title: "Backlog Approval", backlogColor: true },
      { id: "approved", title: "Approved" },
      { id: "rejected", title: "Rejected" },
      { id: "revoke", title: "Revoke" },
      { id: "progress", title: "Progress Review" },   // ← ganti label
    ],
    rankingTitle: "Top Progress Pengawas",
    tableTitle: "Data Pengawas",
  },
};

/* ========= Helpers ========= */
function formatDateID(d) {
  if (!d) return "-";
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return "-";
  const bulan = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${bulan[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toYMDinJakarta(d) {
  if (!(d instanceof Date)) d = new Date(d);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}
function todayYMD() { return toYMDinJakarta(new Date()); }

/* ========= Helper: ambil field progress sesuai role ========= */
function progressForRole(obj) {
  if (!obj) return 0;
  return currentRole === "pengawas"
    ? (obj.progressReview ?? 0)   // ← ganti dari progressApprove
    : (obj.progressTotal  ?? 0);
}

/* ========= Load data ========= */
async function loadByDate(date) {
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    viewedDate = date;
    await loadDashboard(apiURL("get", { date }));
    return;
  }
  viewedDate = null;
  try {
    const head = await fetch(LATEST_URL(), { method: "HEAD", cache: "no-store" });
    if (head.ok) { await loadDashboard(LATEST_URL()); return; }
  } catch (_) { /* fallthrough */ }
  const res = await fetch(apiURL("latest"), { cache: "no-store" });
  if (!res.ok) throw new Error(`Belum ada data ${currentRole}`);
  const p = await res.json();
  if (p.status !== "ok" || !Array.isArray(p.data))
    throw new Error(p.message || "Format tidak valid");
  if (p.source === "history" && p.date) {
    viewedDate = p.date;
    await loadDashboard(apiURL("get", { date: p.date }));
  } else {
    await loadDashboard(LATEST_URL());
  }
}

/* ========= Last Update ========= */
async function updateLastUpdate() {
  const el = document.getElementById("lastUpdate");
  if (!el) return;

  if (viewedDate) {
    try {
      const res = await fetch(apiURL("snapshot-meta", { date: viewedDate }), { cache: "no-store" });
      if (res.ok) {
        const meta = await res.json();
        if (meta.status === "ok" && meta.mtime) {
          el.textContent = formatDateID(new Date(meta.mtime)) + " (snapshot)";
          return;
        }
      }
    } catch (e) { console.warn("[lastUpdate] snapshot-meta:", e); }
    el.textContent = formatDateID(new Date(viewedDate + "T00:00:00")) + " (snapshot)";
    return;
  }

  try {
    const res = await fetch(apiURL("latest-meta"), { cache: "no-store" });
    if (res.ok) {
      const meta = await res.json();
      if (meta.status === "ok" && meta.mtime) {
        el.textContent = formatDateID(new Date(meta.mtime));
        return;
      }
    }
  } catch (e) { console.warn("[lastUpdate]:", e); }
  const t = (Dashboard && Dashboard.meta && Dashboard.meta.loadedAt) || new Date();
  el.textContent = formatDateID(t);
}

async function isLatestUpdatedToday() {
  try {
    const res = await fetch(apiURL("latest-meta"), { cache: "no-store" });
    if (!res.ok) return false;
    const meta = await res.json();
    if (meta.status !== "ok" || !meta.mtime) return false;
    return toYMDinJakarta(new Date(meta.mtime)) === todayYMD();
  } catch { return false; }
}

/* ========= Render All ========= */
async function renderAll() {
  if (!viewedDate && typeof autoSnapshotToday === "function") {
    if (await isLatestUpdatedToday()) await autoSnapshotToday();
  }
  if (typeof loadPreviousDay === "function") {
    await loadPreviousDay(viewedDate || todayYMD());
  }
  applyRoleUI();
  renderCards();
  renderProgress();
  await updateLastUpdate();
  if (typeof renderCharts === "function") renderCharts();
  if (typeof renderTable === "function") renderTable();
  if (typeof renderComparison === "function") renderComparison();
}

async function init() {
  bindEvents();
  applyRoleUI();
  try {
    showLoading();
    await loadByDate(null);
    await populateViewDateOptions();
    await renderAll();
    hideLoading();
  } catch (err) {
    hideLoading();
    console.warn("[init] Data awal gagal di-load:", err);
    Swal.fire({
      icon: "info", title: "Belum ada data",
      text: "Silakan upload file JSON untuk memulai.",
      timer: 3500, showConfirmButton: false,
    });
  }
}

/* ========= Dropdown snapshot ========= */
async function populateViewDateOptions() {
  const sel = document.getElementById("viewDate");
  if (!sel) return;
  try {
    const res = await fetch(apiURL("list"), { cache: "no-store" });
    const j = await res.json();
    const items = j && j.status === "ok" && Array.isArray(j.items) ? j.items : [];
    const bln = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
    let html = `<option value="">— Data Terbaru —</option>`;
    items.forEach((it) => {
      const [y, m, d] = it.date.split("-");
      html += `<option value="${it.date}">${d} ${bln[parseInt(m, 10) - 1]} ${y}</option>`;
    });
    sel.innerHTML = html;
    if (viewedDate) sel.value = viewedDate;
  } catch (e) { console.warn("[viewDate]:", e); }
}

/* ========= Apply role UI ========= */
function applyRoleUI() {
  const cfg = KPI_CONFIG[currentRole];
  const sub = document.querySelector(".logo .sub-title");
  if (sub) sub.textContent = cfg.subtitle;

  cfg.cards.forEach((c) => {
    const valueEl = document.getElementById(c.id);
    if (!valueEl) return;
    const card = valueEl.closest(".kpi-card");
    if (!card) return;
    const titleEl = card.querySelector(".kpi-title");
    if (titleEl) titleEl.textContent = c.title;
    card.dataset.backlogColor = c.backlogColor ? "1" : "0";
  });

  const rank = document.getElementById("rankingTitle");
  if (rank) rank.textContent = cfg.rankingTitle;
  const tbl = document.getElementById("tableTitle");
  if (tbl) tbl.textContent = cfg.tableTitle;

  document.querySelectorAll("[data-role-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.roleTab === currentRole);
  });
}

/* ========= KPI cards ========= */
function renderCards() {
  const s = Dashboard.summary;
  setText("assignment", formatNumber(s.assignment));
  setText("open", formatNumber(s.open));
  setText("draft", formatNumber(s.draft));
  setText("submitted", formatNumber(s.submitted));
  setText("approved", formatNumber(s.approved));
  setText("rejected", formatNumber(s.rejected));
  setText("revoke", formatNumber(s.revoked));

  const prog = progressForRole(s);      // ← role-aware
  setText("progress", prog.toFixed(2) + "%");

  applyBacklogColor(s.submitted);

  const prev = typeof Comparison !== "undefined" ? Comparison.previousSummary : null;
  renderChange("assignmentChange", s.assignment, prev ? prev.assignment : null);
  renderChange("openChange",       s.open,       prev ? prev.open : null);
  renderChange("draftChange",      s.draft,      prev ? prev.draft : null);
  renderChange("submittedChange",  s.submitted,  prev ? prev.submitted : null);
  renderChange("approvedChange",   s.approved,   prev ? prev.approved : null);
  renderChange("rejectedChange",   s.rejected,   prev ? prev.rejected : null);
  renderChange("revokeChange",     s.revoked,    prev ? prev.revoked : null);

  const prevProg = prev ? progressForRole(prev) : null;
  renderChange("progressChange", prog, prevProg, true);
}

function applyBacklogColor(count) {
  const el = document.getElementById("submitted");
  if (!el) return;
  const card = el.closest(".kpi-card");
  if (!card) return;
  el.style.color = "";
  card.classList.remove("backlog-green", "backlog-yellow", "backlog-red");
  if (card.dataset.backlogColor !== "1") return;
  let cls, color;
  if (count < 10)      { cls = "backlog-green";  color = "#22c55e"; }
  else if (count < 50) { cls = "backlog-yellow"; color = "#f59e0b"; }
  else                 { cls = "backlog-red";    color = "#ef4444"; }
  card.classList.add(cls);
  el.style.color = color;
}

function renderChange(id, today, yesterday, isPercent = false) {
  const el = document.getElementById(id);
  if (!el) return;
  if (yesterday === null || typeof yesterday !== "number") {
    el.className = "kpi-change";
    el.style.color = "#9ca3af";
    el.textContent = "—";
    return;
  }
  const diff = today - yesterday;
  const rounded = isPercent ? Number(diff.toFixed(2)) : Math.round(diff);
  if (rounded === 0) {
    el.className = "kpi-change";
    el.style.color = "#9ca3af";
    el.textContent = isPercent ? "▬ 0%" : "▬ 0";
    return;
  }
  const up = rounded > 0;
  el.className = "kpi-change " + (up ? "up" : "down");
  el.style.color = up ? "#22c55e" : "#ef4444";
  el.textContent = up
    ? isPercent ? "▲ +" + rounded.toFixed(2) + "%" : "▲ +" + formatNumber(rounded)
    : isPercent ? "▼ " + rounded.toFixed(2) + "%"  : "▼ -" + formatNumber(Math.abs(rounded));
}

function renderProgress() {
  const s = Dashboard.summary;
  const progress = progressForRole(s);       // ← role-aware
  const bar = document.getElementById("overallProgress");
  if (!bar) return;
  bar.style.width = progress + "%";
  bar.innerHTML = progress.toFixed(2) + "%";
  const txt = document.getElementById("progressText");
  if (txt) txt.innerHTML = progress.toFixed(2) + "%";
}

/* ========= Switch Role ========= */
async function switchRole(newRole) {
  if (newRole === currentRole) return;
  currentRole = newRole;
  viewedDate = null;

  applyRoleUI();
  const viewDateEl = document.getElementById("viewDate");
  if (viewDateEl) viewDateEl.value = "";

  try {
    showLoading();
    await loadByDate(null);
    await populateViewDateOptions();
    await renderAll();
    hideLoading();
    toast("info", `Menampilkan data ${newRole === "pengawas" ? "Pengawas" : "Pencacah"}`);
  } catch (err) {
    hideLoading();
    if (typeof Dashboard !== "undefined") {
      Dashboard.summary = {
        assignment: 0, open: 0, draft: 0, submitted: 0,
        approved: 0, edited: 0, rejected: 0, revoked: 0,
        reviewed: 0, completed: 0, remaining: 0,
        progressTotal: 0, progressApprove: 0, progressReview: 0, progressSubmit: 0,
      };
      Dashboard.enumerators = [];
    }
    renderCards();
    renderProgress();
    if (typeof Comparison !== "undefined") {
      Comparison.previousMap = {};
      Comparison.previousSummary = null;
      Comparison.available = false;
    }
    if (typeof renderComparison === "function") renderComparison();
    if (typeof renderTable === "function") renderTable();
    if (typeof renderCharts === "function") renderCharts();
    await updateLastUpdate();
    await populateViewDateOptions();

    Swal.fire({
      icon: "info",
      title: `Belum ada data ${newRole === "pengawas" ? "Pengawas" : "Pencacah"}`,
      text: `Upload file JSON ${newRole} untuk mulai.`,
      timer: 3000, showConfirmButton: false,
    });
  }
}

/* ========= Events ========= */
function bindEvents() {
  document.querySelectorAll("[data-role-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchRole(btn.dataset.roleTab));
  });

  const viewDateEl = document.getElementById("viewDate");
  if (viewDateEl) {
    viewDateEl.addEventListener("change", async (e) => {
      const d = e.target.value;
      if (!d) return;
      try {
        showLoading();
        await loadByDate(d);
        await renderAll();
        hideLoading();
        toast("info", `Menampilkan ${currentRole} ${d}`);
      } catch (err) {
        hideLoading();
        Swal.fire({ icon: "error", title: "Snapshot tidak ditemukan",
          text: `Tidak ada data ${currentRole} untuk ${d}.` });
        viewDateEl.value = "";
        viewedDate = null;
      }
    });
  }

  const btnViewLatest = document.getElementById("btnViewLatest");
  if (btnViewLatest)
    btnViewLatest.addEventListener("click", async () => {
      try {
        showLoading();
        if (viewDateEl) viewDateEl.value = "";
        await loadByDate(null);
        await renderAll();
        hideLoading();
        toast("success", "Kembali ke data terbaru");
      } catch (e) {
        hideLoading();
        Swal.fire({ icon: "error", title: "Gagal", text: e.message });
      }
    });

  const refresh = document.getElementById("btnRefresh");
  if (refresh)
    refresh.addEventListener("click", async () => {
      try {
        showLoading();
        await loadByDate(viewedDate);
        await renderAll();
        hideLoading();
        toast("success", "Data berhasil dimuat ulang");
      } catch (e) {
        hideLoading();
        Swal.fire({ icon: "error", title: "Gagal Refresh", text: e.message });
      }
    });

  const btnOpen = document.getElementById("btnOpenUpload");
  if (btnOpen)
    btnOpen.addEventListener("click", async () => {
      const fileInput = document.getElementById("jsonFile");
      const dateInput = document.getElementById("jsonDate");
      if (fileInput) fileInput.value = "";
      if (dateInput) dateInput.value = todayYMD();
      await refreshSnapshotList();
      new bootstrap.Modal(document.getElementById("uploadModal")).show();
    });

  const fileInputChange = document.getElementById("jsonFile");
  if (fileInputChange)
    fileInputChange.addEventListener("change", () => {
      const f = fileInputChange.files && fileInputChange.files[0];
      if (!f) return;
      const m = f.name.match(/(\d{4}-\d{2}-\d{2})/);
      if (m) {
        const dateInput = document.getElementById("jsonDate");
        if (dateInput) dateInput.value = m[1];
      }
    });

  const btnUpload = document.getElementById("btnUpload");
  if (btnUpload)
    btnUpload.addEventListener("click", async () => {
      const fileInput = document.getElementById("jsonFile");
      const dateInput = document.getElementById("jsonDate");
      const file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) {
        Swal.fire({ icon: "warning", title: "File belum dipilih", text: "Pilih file .json dulu" });
        return;
      }
      if (!/\.json$/i.test(file.name)) {
        Swal.fire({ icon: "warning", title: "Format salah", text: "File harus .json" });
        return;
      }

      const pickedDate = (dateInput && dateInput.value) || todayYMD();
      const today = todayYMD();
      const isToday = pickedDate === today;
      if (pickedDate > today) {
        Swal.fire({ icon: "warning", title: "Tanggal tidak valid", text: "Tidak boleh masa depan." });
        return;
      }

      try {
        btnUpload.disabled = true;
        btnUpload.innerHTML = "Mengunggah...";
        let result;
        if (isToday) {
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch("api/history.php?action=upload-latest", { method: "POST", body: fd });
          result = await res.json();
          if (!res.ok || result.status !== "ok") throw new Error(result.message || `HTTP ${res.status}`);
        } else {
          const fd = new FormData();
          fd.append("file", file);
          fd.append("date", pickedDate);
          const res = await fetch("api/history.php?action=upload", { method: "POST", body: fd });
          result = await res.json();
          if (!res.ok || result.status !== "ok") throw new Error(result.message || `HTTP ${res.status}`);
        }

        const detectedRole = result.role || currentRole;
        const modalEl = document.getElementById("uploadModal");
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        showLoading();
        if (detectedRole !== currentRole) currentRole = detectedRole;
        if (isToday) {
          viewedDate = null;
          const vde = document.getElementById("viewDate");
          if (vde) vde.value = "";
        }
        applyRoleUI();
        await loadByDate(viewedDate);
        await populateViewDateOptions();
        await renderAll();
        hideLoading();
        toast("success", isToday
          ? `Upload sukses — ${detectedRole} hari ini (${pickedDate})`
          : `Snapshot ${detectedRole} ${pickedDate} tersimpan`);
      } catch (err) {
        Swal.fire({ icon: "error", title: "Upload Gagal", text: err.message });
      } finally {
        btnUpload.disabled = false;
        btnUpload.innerHTML = "Upload";
      }
    });

  const btnDark = document.getElementById("btnDarkMode");
  if (btnDark)
    btnDark.addEventListener("click", () => {
      const html = document.documentElement;
      const cur = html.getAttribute("data-bs-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      html.setAttribute("data-bs-theme", next);
      btnDark.innerHTML = next === "dark" ? `<i class="fa fa-moon"></i>` : `<i class="fa fa-sun"></i>`;
    });

  const btnFs = document.getElementById("btnFullscreen");
  if (btnFs)
    btnFs.addEventListener("click", () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
      else document.exitFullscreen?.();
    });
}

/* ========= Utils ========= */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
function toast(icon, title) {
  if (typeof Swal === "undefined") return;
  Swal.fire({ toast: true, position: "top-end", icon, title, timer: 2500, showConfirmButton: false });
}
function showLoading() { document.body.style.cursor = "wait"; }
function hideLoading() { document.body.style.cursor = "default"; }

async function refreshSnapshotList() {
  const el = document.getElementById("snapshotList");
  if (!el) return;
  el.textContent = "memuat...";
  try {
    const res = await fetch(apiURL("list"), { cache: "no-store" });
    const j = await res.json();
    if (j.status === "ok" && Array.isArray(j.items) && j.items.length) {
      el.textContent = j.items.map((x) => x.date).join(", ");
    } else {
      el.textContent = "(belum ada snapshot)";
    }
  } catch { el.textContent = "(gagal memuat)"; }
}
