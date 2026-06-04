import { chinaFilenameStamp, formatDateTimeChina } from "./dateFormat.js";
import { ensureTraineeFeedback } from "./feedbackDisplay.js";
import {
  ADMIN_PASSWORD,
  clearAdminSession,
  isAdminSessionActive,
  loadRecordById,
  loadRecordSummaries,
  setAdminSession,
  usesRemotePersistence,
} from "./storage.js";

const ADMIN_PAGE_SIZE = 20;

const els = {
  loginSection: document.getElementById("admin-login"),
  loginForm: document.getElementById("admin-login-form"),
  password: document.getElementById("admin-password"),
  panelSection: document.getElementById("admin-panel"),
  panel: document.getElementById("admin-panel-body"),
  logoutBtn: document.getElementById("btn-admin-logout"),
};

const adminSelectedIds = new Set();
const detailCache = new Map();
let adminFilterDebounce = null;
let adminPage = 1;
let lastSummary = { total: 0, page: 1, pageSize: ADMIN_PAGE_SIZE, items: [] };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function toast(msg) {
  const ex = document.querySelector(".error-toast");
  if (ex) ex.remove();
  const div = document.createElement("div");
  div.className = "error-toast";
  div.textContent = msg;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 4200);
}

function showLogin() {
  els.loginSection.classList.remove("hidden");
  els.panelSection.classList.add("hidden");
  els.logoutBtn.classList.add("hidden");
  clearAdminSession();
  adminSelectedIds.clear();
  detailCache.clear();
}

function showPanel() {
  els.loginSection.classList.add("hidden");
  els.panelSection.classList.remove("hidden");
  els.logoutBtn.classList.remove("hidden");
}

function getAdminFilterInputs() {
  const n = document.getElementById("admin-filter-name");
  const c = document.getElementById("admin-filter-city");
  const df = document.getElementById("admin-filter-date-from");
  const dt = document.getElementById("admin-filter-date-to");
  return {
    name: (n && n.value.trim()) || "",
    city: (c && c.value.trim()) || "",
    dateFrom: (df && df.value.trim()) || "",
    dateTo: (dt && dt.value.trim()) || "",
  };
}

function adminFilterDateRangeInvalid(dateFrom, dateTo) {
  return Boolean(dateFrom && dateTo && dateFrom > dateTo);
}

function formatAdminStats(totalCount, pageCount, selectedCount, filters, page, pageCountTotal) {
  const { dateFrom, dateTo } = filters;
  let text = `共 ${totalCount} 条存档 · 当前页 ${pageCount} 条 · 第 ${page}/${pageCountTotal} 页 · 已勾选 ${selectedCount} 条（导出以勾选为准）`;
  if (dateFrom || dateTo) {
    const from = dateFrom || "…";
    const to = dateTo || "…";
    text += ` · 时间：${from}～${to}（中国时区）`;
  }
  if (adminFilterDateRangeInvalid(dateFrom, dateTo)) {
    return `开始日期不能晚于结束日期 · ${text}`;
  }
  return text;
}

function adminListEmptyMessage(filters) {
  if (adminFilterDateRangeInvalid(filters.dateFrom, filters.dateTo)) {
    return "开始日期不能晚于结束日期，请调整后再试。";
  }
  return "没有符合筛选条件的记录，请调整姓名、城市或日期。";
}

function pageCountTotal(total, pageSize) {
  return Math.max(1, Math.ceil(total / pageSize) || 1);
}

function renderAdminFeedbackDimension(title, td, scoreOverride) {
  if (!td || typeof td !== "object") return "";
  const num =
    scoreOverride != null && scoreOverride !== ""
      ? Number(scoreOverride)
      : Number(td.score ?? 0);
  const scoreStr = Number.isFinite(num) ? num.toFixed(2) : "—";
  const strengths =
    (td.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("") ||
    "<li class=\"muted\">（无）</li>";
  const priority =
    (td.priorityIssues || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("") ||
    "<li class=\"muted\">（无）</li>";
  return `
    <div class="admin-fb-dim">
      <h4 class="admin-fb-dim-title">${escapeHtml(title)} · ${scoreStr} 分</h4>
      <p class="admin-fb-sub">做得好的地方</p>
      <ul class="admin-fb-ul">${strengths}</ul>
      <p class="admin-fb-sub">建议先改</p>
      <ul class="admin-fb-ul">${priority}</ul>
    </div>`;
}

function adminFeedbackDetailSectionHtml(r) {
  const fd = r.feedbackDetail;
  const sc = r.scores || {};
  const trainee = ensureTraineeFeedback({
    detail: fd,
    learning: sc.learning,
    competition: sc.competition,
    qna: sc.qna,
    total: sc.total,
    courseKnowledge: r.scoreResult?.courseKnowledge,
    trainee: r.scoreResult?.trainee,
  });
  if (!fd || !fd.learning) {
    return `
      <div class="detail-block">
        <h4>智能分项点评（详细）</h4>
        <p class="muted">本条为升级前存档，未保存分项点评明细。可让老师重新完成考核并保存；管理员仍可查看逐字稿与家长题作答。</p>
      </div>`;
  }
  return `
    <div class="detail-block">
      <h4>智能分项点评（详细）</h4>
      <div class="admin-fb-grid">
        ${renderAdminFeedbackDimension("学习规划", trainee.learning, sc.learning)}
        ${renderAdminFeedbackDimension("赛考规划", trainee.competition, sc.competition)}
        ${renderAdminFeedbackDimension("答疑能力", trainee.qna, sc.qna)}
      </div>
    </div>`;
}

function adminRecordDetailHtml(r) {
  const qs = Array.isArray(r.questions) ? r.questions : [];
  const as = Array.isArray(r.answers) ? r.answers : [];
  const qaBlocks = [0, 1]
    .map((i) => {
      const q = qs[i];
      const a = as[i];
      if (!q && !a) return "";
      return `
        <div class="qa-pair">
          <div class="q">问题 ${i + 1}：${escapeHtml(q || "（无）")}</div>
          <div class="a">${escapeHtml(a || "（无作答）")}</div>
        </div>`;
    })
    .join("");

  return `
    <div class="detail-block">
      <h4>学习 / 赛考逐字稿（全文）</h4>
      <div class="body">${escapeHtml(r.script || "（无）")}</div>
    </div>
    <div class="detail-block">
      <h4>家长常见问题 · 老师作答</h4>
      <div class="detail-qa">${qaBlocks || "<p class=\"muted\">（无保存的题目或作答）</p>"}</div>
    </div>
    ${adminFeedbackDetailSectionHtml(r)}
    <div class="detail-block">
      <h4>系统综合评语（摘要）</h4>
      <div class="body">${escapeHtml(r.summary || "（无）")}</div>
    </div>`;
}

function adminRecordSummaryHtml(r) {
  const t = r.teacher || {};
  const s = r.student || {};
  const sc = r.scores || {};
  const checked = adminSelectedIds.has(r.id) ? "checked" : "";
  const profilePart =
    sc.profile != null && sc.profile !== "" ? ` · 画像 ${escapeHtml(String(sc.profile))}` : "";

  return `
    <article class="record-item" data-record-id="${escapeAttr(r.id)}">
      <div class="record-item-head">
        <input type="checkbox" class="record-select" data-record-id="${escapeAttr(r.id)}" ${checked} title="加入批量导出" />
        <div class="head-main">
          <header>
            <span>${escapeHtml(t.name || "")} · ${escapeHtml(t.city || "")}</span>
            <span class="meta" title="${escapeAttr(r.createdAt || "")}">${escapeHtml(formatDateTimeChina(r.createdAt))}</span>
          </header>
          <div class="meta">
            学员：${escapeHtml(s.name || "")} / ${escapeHtml(String(s.age || ""))}岁 / ${escapeHtml(s.gender || "")} /
            ${escapeHtml(s.grade || "")} / ${escapeHtml(s.province || "")} ${escapeHtml(s.city || "")} /
            ${escapeHtml(s.trackLine || "—")} · ${escapeHtml(s.courseStage || "—")}
          </div>
          <div class="meta">总分 ${escapeHtml(String(sc.total ?? ""))} · 学习 ${escapeHtml(
    String(sc.learning ?? "")
  )} · 赛考 ${escapeHtml(String(sc.competition ?? ""))} · 答疑 ${escapeHtml(String(sc.qna ?? ""))}${profilePart}</div>
        </div>
      </div>
      <details class="record-detail" data-record-id="${escapeAttr(r.id)}">
        <summary>展开：完整逐字稿、家长题与作答、分项点评、综合评语</summary>
        <div class="record-detail-body">
          <p class="muted admin-detail-hint">点击展开后将加载详情…</p>
        </div>
      </details>
    </article>`;
}

function renderPagination(page, total, pageSize) {
  const pages = pageCountTotal(total, pageSize);
  const prevDisabled = page <= 1 ? "disabled" : "";
  const nextDisabled = page >= pages ? "disabled" : "";
  return `
    <div class="admin-pagination">
      <button type="button" class="btn btn-ghost btn-sm" id="admin-page-prev" ${prevDisabled}>上一页</button>
      <span class="admin-pagination-info">第 ${page} / ${pages} 页</span>
      <button type="button" class="btn btn-ghost btn-sm" id="admin-page-next" ${nextDisabled}>下一页</button>
    </div>`;
}

async function refreshAdminRecordList() {
  const listEl = document.getElementById("admin-record-list");
  if (!listEl) return;

  const filters = getAdminFilterInputs();
  if (adminFilterDateRangeInvalid(filters.dateFrom, filters.dateTo)) {
    lastSummary = { total: 0, page: adminPage, pageSize: ADMIN_PAGE_SIZE, items: [] };
    listEl.innerHTML = `<p class="muted">${escapeHtml(adminListEmptyMessage(filters))}</p>`;
    updateStatsAndPagination(filters);
    return;
  }

  listEl.innerHTML = `<p class="muted admin-detail-loading">加载中…</p>`;
  const result = await loadRecordSummaries({
    page: adminPage,
    pageSize: ADMIN_PAGE_SIZE,
    filters,
  });
  lastSummary = result;

  listEl.innerHTML = result.items.length
    ? result.items.map((r) => adminRecordSummaryHtml(r)).join("")
    : `<p class="muted">${escapeHtml(
        !result.total &&
          !filters.name &&
          !filters.city &&
          !filters.dateFrom &&
          !filters.dateTo
          ? "暂无历史记录。"
          : adminListEmptyMessage(filters)
      )}</p>`;

  updateStatsAndPagination(filters);
}

function updateStatsAndPagination(filters) {
  const statsEl = els.panel.querySelector(".admin-stats");
  if (statsEl) {
    statsEl.textContent = formatAdminStats(
      lastSummary.total,
      lastSummary.items.length,
      adminSelectedIds.size,
      filters,
      lastSummary.page,
      pageCountTotal(lastSummary.total, lastSummary.pageSize)
    );
  }
  const pagEl = document.getElementById("admin-pagination");
  if (pagEl) {
    pagEl.innerHTML = renderPagination(
      lastSummary.page,
      lastSummary.total,
      lastSummary.pageSize
    );
    pagEl.querySelector("#admin-page-prev")?.addEventListener("click", onPagePrev);
    pagEl.querySelector("#admin-page-next")?.addEventListener("click", onPageNext);
  }
}

function onPagePrev() {
  if (adminPage <= 1) return;
  adminPage -= 1;
  void refreshAdminRecordList();
}

function onPageNext() {
  const pages = pageCountTotal(lastSummary.total, lastSummary.pageSize);
  if (adminPage >= pages) return;
  adminPage += 1;
  void refreshAdminRecordList();
}

async function renderAdminPanel() {
  const prev = getAdminFilterInputs();

  els.panel.innerHTML = `
    <div class="admin-toolbar">
      <div class="admin-filters">
        <label class="field full">
          <span>筛选 · 老师姓名（模糊）</span>
          <input type="text" id="admin-filter-name" value="${escapeAttr(prev.name)}" placeholder="例如：张" autocomplete="off" />
        </label>
        <label class="field full">
          <span>筛选 · 所在城市（模糊）</span>
          <input type="text" id="admin-filter-city" value="${escapeAttr(prev.city)}" placeholder="例如：郑州" autocomplete="off" />
        </label>
        <label class="field full">
          <span>筛选 · 开始日期（中国时区）</span>
          <input type="date" id="admin-filter-date-from" value="${escapeAttr(prev.dateFrom)}" />
        </label>
        <label class="field full">
          <span>筛选 · 结束日期</span>
          <input type="date" id="admin-filter-date-to" value="${escapeAttr(prev.dateTo)}" />
        </label>
      </div>
      <div class="admin-actions">
        <button type="button" class="btn btn-ghost btn-sm" id="admin-select-page">全选本页</button>
        <button type="button" class="btn btn-ghost btn-sm" id="admin-clear-selection">取消全部勾选</button>
        <button type="button" class="btn btn-primary btn-sm" id="admin-download-json">批量下载 JSON</button>
        <button type="button" class="btn btn-primary btn-sm" id="admin-download-csv">批量下载 CSV</button>
      </div>
      <p class="muted admin-stats"></p>
      <div id="admin-pagination"></div>
    </div>
    <div id="admin-record-list"></div>
  `;

  await refreshAdminRecordList();
}

async function loadDetailIntoDetails(detailsEl) {
  const id = detailsEl.getAttribute("data-record-id");
  if (!id || detailsEl.dataset.loaded === "1") return;

  const body = detailsEl.querySelector(".record-detail-body");
  if (!body) return;
  body.innerHTML = `<p class="muted admin-detail-loading">加载详情中…</p>`;

  let record = detailCache.get(id);
  if (!record) {
    record = await loadRecordById(id);
    if (record) detailCache.set(id, record);
  }

  if (!record) {
    body.innerHTML = `<p class="muted">加载失败，请稍后重试。</p>`;
    return;
  }

  body.innerHTML = adminRecordDetailHtml(record);
  detailsEl.dataset.loaded = "1";
}

async function onAdminPanelClick(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  if (t.id === "admin-select-page") {
    lastSummary.items.forEach((r) => adminSelectedIds.add(r.id));
    await refreshAdminRecordList();
    toast(`已勾选本页 ${lastSummary.items.length} 条。`);
    return;
  }

  if (t.id === "admin-clear-selection") {
    adminSelectedIds.clear();
    await refreshAdminRecordList();
    return;
  }

  if (t.id === "admin-download-json") {
    await exportAdminJson();
    return;
  }

  if (t.id === "admin-download-csv") {
    await exportAdminCsv();
  }
}

function onAdminPanelChange(e) {
  const t = e.target;
  if (t instanceof HTMLInputElement && t.classList.contains("record-select")) {
    const id = t.getAttribute("data-record-id");
    if (!id) return;
    if (t.checked) adminSelectedIds.add(id);
    else adminSelectedIds.delete(id);
    updateStatsAndPagination(getAdminFilterInputs());
    return;
  }
  if (t.id === "admin-filter-date-from" || t.id === "admin-filter-date-to") {
    adminPage = 1;
    void refreshAdminRecordList();
  }
}

function onAdminPanelInput(e) {
  const t = e.target;
  const filterIds = [
    "admin-filter-name",
    "admin-filter-city",
    "admin-filter-date-from",
    "admin-filter-date-to",
  ];
  if (!filterIds.includes(t.id)) return;
  clearTimeout(adminFilterDebounce);
  adminFilterDebounce = setTimeout(() => {
    adminPage = 1;
    void refreshAdminRecordList();
  }, 220);
}

function onDetailsToggle(e) {
  const details = e.target;
  if (!(details instanceof HTMLDetailsElement) || !details.classList.contains("record-detail")) return;
  if (!details.open) return;
  void loadDetailIntoDetails(details);
}

async function getSelectedRecordsOrdered() {
  const out = [];
  for (const id of adminSelectedIds) {
    let r = detailCache.get(id);
    if (!r) {
      r = await loadRecordById(id);
      if (r) detailCache.set(id, r);
    }
    if (r) out.push(r);
  }
  out.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return out;
}

async function exportAdminJson() {
  const rows = await getSelectedRecordsOrdered();
  if (!rows.length) return toast("请先勾选要导出的记录。");
  const stamp = chinaFilenameStamp();
  const text = JSON.stringify(rows, null, 2);
  downloadBlob(`编程规划考核导出_${rows.length}条_${stamp}.json`, text, "application/json;charset=utf-8");
  toast(`已下载 JSON，共 ${rows.length} 条。`);
}

async function exportAdminCsv() {
  const rows = await getSelectedRecordsOrdered();
  if (!rows.length) return toast("请先勾选要导出的记录。");

  const headers = [
    "record_id",
    "created_at",
    "teacher_name",
    "teacher_city",
    "student_name",
    "student_age",
    "student_gender",
    "student_grade",
    "student_province",
    "student_city",
    "student_track_line",
    "student_course_stage",
    "score_total",
    "score_learning",
    "score_competition",
    "score_qna",
    "score_profile",
    "summary",
    "script_full",
    "question_1",
    "answer_1",
    "question_2",
    "answer_2",
    "tier_learning",
    "tier_competition",
    "tier_qna",
    "tier_profile",
    "feedback_detail_json",
  ];

  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    const t = r.teacher || {};
    const s = r.student || {};
    const sc = r.scores || {};
    const qs = Array.isArray(r.questions) ? r.questions : [];
    const as = Array.isArray(r.answers) ? r.answers : [];
    const row = [
      r.id,
      formatDateTimeChina(r.createdAt),
      t.name,
      t.city,
      s.name,
      s.age,
      s.gender,
      s.grade,
      s.province,
      s.city,
      s.trackLine ?? "",
      s.courseStage ?? "",
      sc.total,
      sc.learning,
      sc.competition,
      sc.qna,
      sc.profile ?? "",
      r.summary,
      r.script,
      qs[0] || "",
      as[0] || "",
      qs[1] || "",
      as[1] || "",
      sc.tierLearning ?? "",
      sc.tierCompetition ?? "",
      sc.tierQna ?? "",
      sc.tierProfile ?? "",
      r.feedbackDetail ? JSON.stringify(r.feedbackDetail) : "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }

  const stamp = chinaFilenameStamp();
  const bom = "\uFEFF";
  downloadBlob(`编程规划考核导出_${rows.length}条_${stamp}.csv`, bom + lines.join("\r\n"), "text/csv;charset=utf-8");
  toast(`已下载 CSV，共 ${rows.length} 条（UTF-8，可用 Excel 打开）。`);
}

function csvEscape(val) {
  const str = val == null ? "" : String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadBlob(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function onAdminLogin(e) {
  e.preventDefault();
  const pw = els.password.value.trim();
  if (pw !== ADMIN_PASSWORD) {
    return toast("密码错误。");
  }
  setAdminSession(pw);
  adminSelectedIds.clear();
  detailCache.clear();
  adminPage = 1;
  showPanel();
  await renderAdminPanel();
}

async function bootstrapAuthed() {
  showPanel();
  adminPage = 1;
  await renderAdminPanel();
}

function init() {
  if (usesRemotePersistence()) {
    const hint = document.createElement("p");
    hint.className = "muted admin-persist-hint";
    hint.textContent = "当前为服务端模式：记录从 Turso 数据库加载。";
    els.loginSection.querySelector("h2")?.after(hint);
  }

  els.loginForm.addEventListener("submit", onAdminLogin);
  els.logoutBtn.addEventListener("click", () => {
    showLogin();
    els.password.value = "";
    els.panel.innerHTML = "";
  });

  els.panelSection.addEventListener("click", onAdminPanelClick);
  els.panelSection.addEventListener("change", onAdminPanelChange);
  els.panelSection.addEventListener("input", onAdminPanelInput);
  els.panelSection.addEventListener("toggle", onDetailsToggle, true);

  if (isAdminSessionActive()) {
    void bootstrapAuthed();
  } else {
    showLogin();
  }
}

init();
