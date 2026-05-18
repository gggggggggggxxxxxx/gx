import {
  chinaFilenameStamp,
  formatDateTimeChina,
  isCreatedAtInChinaYmdRange,
} from "./dateFormat.js";
import { GRADES, TRACK_LINES, COURSE_STAGES, PROVINCES, citiesForProvince } from "./data.js";
import { pickParentQuestions } from "./questions.js";
import { ensureTraineeFeedback, humanizeIssue } from "./feedbackDisplay.js";
import { scoreAssessment } from "./scoring.js";
import {
  loadRecords,
  saveRecord,
  ADMIN_PASSWORD,
  usesRemotePersistence,
} from "./storage.js";

const MIN_SCRIPT_CHARS = 800;

const els = {
  stepInfo: document.getElementById("step-info"),
  stepScript: document.getElementById("step-script"),
  stepQuestions: document.getElementById("step-questions"),
  stepResult: document.getElementById("step-result"),
  teacherName: document.getElementById("teacher-name"),
  teacherCity: document.getElementById("teacher-city"),
  studentName: document.getElementById("student-name"),
  studentAge: document.getElementById("student-age"),
  studentGender: document.getElementById("student-gender"),
  studentGrade: document.getElementById("student-grade"),
  studentProvince: document.getElementById("student-province"),
  studentCity: document.getElementById("student-city"),
  studentTrackLine: document.getElementById("student-track-line"),
  studentCourseStage: document.getElementById("student-course-stage"),
  scriptText: document.getElementById("script-text"),
  charCount: document.getElementById("char-count"),
  charHint: document.getElementById("char-hint"),
  questionsContainer: document.getElementById("questions-container"),
  scoreBoard: document.getElementById("score-board"),
  feedbackDetail: document.getElementById("feedback-detail"),
  saveStatus: document.getElementById("save-status"),
  modalAdmin: document.getElementById("modal-admin"),
  adminLoginForm: document.getElementById("admin-login-form"),
  adminPassword: document.getElementById("admin-password"),
  adminRecords: document.getElementById("admin-records"),
  mainView: document.getElementById("main-view"),
  pageRules: document.getElementById("page-rules"),
  siteFooter: document.getElementById("site-footer"),
};

let currentQuestions = [];
let lastScorePayload = null;
let lastResult = null;
let recordSaved = false;

/** 管理员勾选导出用的记录 id */
const adminSelectedIds = new Set();
let adminFilterDebounce = null;

function init() {
  fillSelect(els.studentGrade, GRADES);
  fillSelect(els.studentProvince, PROVINCES);
  fillSelect(els.studentTrackLine, TRACK_LINES);
  fillSelect(els.studentCourseStage, COURSE_STAGES);
  els.studentTrackLine.value = "科特线";
  els.studentCourseStage.value = "图形化";
  refreshCitySelect();

  els.studentProvince.addEventListener("change", refreshCitySelect);
  els.scriptText.addEventListener("input", updateCharCount);
  updateCharCount();

  document.getElementById("btn-to-script").addEventListener("click", onToScript);
  document.getElementById("btn-back-info").addEventListener("click", () => showStep("info"));
  document.getElementById("btn-to-questions").addEventListener("click", onToQuestions);
  document.getElementById("btn-back-script").addEventListener("click", () => showStep("script"));
  document.getElementById("btn-run-score").addEventListener("click", onRunScore);
  document.getElementById("btn-new-assessment").addEventListener("click", resetAll);
  document.getElementById("btn-admin-entry").addEventListener("click", openAdminModal);
  document.getElementById("btn-show-rules").addEventListener("click", showRulesPage);
  document.getElementById("btn-back-rules").addEventListener("click", hideRulesPage);

  document.querySelectorAll("[data-close-modal]").forEach((n) => {
    n.addEventListener("click", closeAdminModal);
  });

  els.adminLoginForm.addEventListener("submit", onAdminLogin);
  els.modalAdmin.addEventListener("click", onAdminPanelClick);
  els.modalAdmin.addEventListener("change", onAdminPanelChange);
  els.modalAdmin.addEventListener("input", onAdminPanelInput);
}

function fillSelect(selectEl, options) {
  selectEl.innerHTML = options.map((o) => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join("");
}

function refreshCitySelect() {
  const p = els.studentProvince.value;
  const cities = citiesForProvince(p);
  fillSelect(els.studentCity, cities);
}

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

function cloneForRecord(obj) {
  try {
    return typeof structuredClone === "function"
      ? structuredClone(obj)
      : JSON.parse(JSON.stringify(obj));
  } catch {
    return null;
  }
}

function updateCharCount() {
  const n = els.scriptText.value.length;
  els.charCount.textContent = `当前字数：${n}`;
  els.charCount.classList.toggle("ok", n >= MIN_SCRIPT_CHARS);
  const diff = MIN_SCRIPT_CHARS - n;
  if (n >= MIN_SCRIPT_CHARS) {
    els.charHint.textContent = "已达到最低字数要求";
    els.charHint.classList.remove("warn");
  } else {
    els.charHint.textContent = `距离最低要求还差 ${diff} 字`;
    els.charHint.classList.add("warn");
  }
}

function showStep(name) {
  els.stepInfo.classList.toggle("hidden", name !== "info");
  els.stepScript.classList.toggle("hidden", name !== "script");
  els.stepQuestions.classList.toggle("hidden", name !== "questions");
  els.stepResult.classList.toggle("hidden", name !== "result");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getTeacher() {
  return {
    name: els.teacherName.value.trim(),
    city: els.teacherCity.value.trim(),
  };
}

function getStudent() {
  return {
    name: els.studentName.value.trim(),
    age: Number(els.studentAge.value),
    gender: els.studentGender.value,
    grade: els.studentGrade.value,
    province: els.studentProvince.value,
    city: els.studentCity.value,
    trackLine: els.studentTrackLine.value,
    courseStage: els.studentCourseStage.value,
  };
}

function validateInfo() {
  const t = getTeacher();
  const s = getStudent();
  if (!t.name || !t.city) return "请填写考核老师的姓名与所在城市。";
  if (!s.name) return "请填写学员姓名。";
  if (!Number.isFinite(s.age) || s.age < 3 || s.age > 18) return "学员年龄需在 3–18 岁之间。";
  if (!s.trackLine || !TRACK_LINES.includes(s.trackLine)) return "请选择学员本次考核主线对应的线路（思维线 / 科特线）。";
  if (!s.courseStage || !COURSE_STAGES.includes(s.courseStage)) return "请选择学员本次考核主线对应的阶段（图形化 / Python）。";
  return null;
}

function onToScript() {
  const err = validateInfo();
  if (err) return toast(err);
  showStep("script");
}

function onToQuestions() {
  const script = els.scriptText.value.trim();
  if (script.length < MIN_SCRIPT_CHARS) {
    return toast(`逐字稿字数不足：至少需要 ${MIN_SCRIPT_CHARS} 字。`);
  }
  const student = getStudent();
  currentQuestions = pickParentQuestions({ script, student });
  renderQuestions();
  showStep("questions");
}

function renderQuestions() {
  els.questionsContainer.innerHTML = currentQuestions
    .map(
      (q, idx) => `
    <div class="q-card" data-q-index="${idx}">
      <h3>问题 ${idx + 1}</h3>
      <p class="muted" style="margin:0 0 10px;white-space:pre-wrap;">${escapeHtml(q.text)}</p>
      <label class="field full">
        <span>您的书面回答</span>
        <textarea class="answer-input" rows="6" data-q-id="${escapeAttr(q.id)}" placeholder="请分点给出可执行方案，避免空泛保证。"></textarea>
      </label>
    </div>`
    )
    .join("");
}

function collectAnswers() {
  const areas = [...els.questionsContainer.querySelectorAll(".answer-input")];
  return areas.map((a) => a.value.trim());
}

function buildAssessmentRecord() {
  const teacher = getTeacher();
  const student = getStudent();
  const script = lastScorePayload.script;
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    schemaVersion: 2,
    teacher,
    student,
    script,
    scriptMeta: {
      charCount: script.length,
      minRequiredChars: MIN_SCRIPT_CHARS,
    },
    questions: lastScorePayload.questions,
    questionItems: currentQuestions.map((q) => ({ id: q.id, text: q.text })),
    answers: lastScorePayload.answers,
    scores: {
      total: lastResult.total,
      learning: lastResult.learning,
      competition: lastResult.competition,
      qna: lastResult.qna,
      tierLearning: lastResult.tierLearning,
      tierCompetition: lastResult.tierCompetition,
      tierQna: lastResult.tierQna,
    },
    summary: lastResult.trainee?.summary || lastResult.summary,
    feedbackDetail: lastResult.detail,
    scoreResult: cloneForRecord(lastResult),
  };
}

async function persistAssessmentRecord() {
  if (!lastScorePayload || !lastResult) return;
  const err = validateInfo();
  if (err) {
    recordSaved = false;
    els.saveStatus.textContent = `未存档：${err}`;
    toast(`评分已生成，因信息未通过校验未存档：${err}`);
    return;
  }
  const rec = buildAssessmentRecord();
  try {
    await saveRecord(rec);
    recordSaved = true;
    els.saveStatus.textContent = usesRemotePersistence()
      ? "本次考核已自动保存至服务器数据库。可在「管理员入口」查看历史。"
      : "本次考核已自动保存至本机浏览器。可在「管理员入口」查看历史。";
  } catch (e) {
    recordSaved = false;
    els.saveStatus.textContent = "";
    toast(`评分已生成，但存档失败：${e?.message || e}`);
  }
}

function onRunScore() {
  const infoErr = validateInfo();
  if (infoErr) return toast(infoErr);

  const answers = collectAnswers();
  if (answers.some((a) => a.length < 20)) {
    return toast("每个问题的回答建议不少于 20 字，请补充后再生成评分。");
  }
  const script = els.scriptText.value.trim();
  const student = getStudent();
  const questions = currentQuestions.map((q) => q.text);
  lastScorePayload = { script, student, answers, questions };

  lastResult = scoreAssessment({ script, student, answers });

  recordSaved = false;
  renderResult(lastResult);
  els.saveStatus.textContent = "正在保存考核记录…";
  showStep("result");
  void persistAssessmentRecord();
}

function renderResult(res) {
  const {
    total,
    learning,
    competition,
    qna,
    tierLearning,
    tierCompetition,
    tierQna,
    detail,
    courseKnowledge,
    declaration,
  } = res;
  const trainee = ensureTraineeFeedback(res);

  els.scoreBoard.innerHTML = `
    <div class="score-total">
      <div class="big">${total.toFixed(2)}</div>
      <div class="label">最终总分 / 10<br/><span style="font-size:0.78rem;opacity:.85">学习×40% + 赛考×40% + 答疑×20%</span></div>
    </div>
    <p class="score-declaration muted small" style="margin:12px 0 0;text-align:center;line-height:1.5;">
      ${escapeHtml(trainee.declarationLabel || "您为学员申报的路径")}：<strong>${escapeHtml(declaration?.trackLine || "—")}</strong> · <strong>${escapeHtml(declaration?.courseStage || "—")}</strong>
    </p>
    <div class="score-bars">
      ${barRow("学习规划", learning, 10)}
      ${barRow("赛考规划", competition, 10)}
      ${barRow("答疑能力", qna, 10)}
    </div>
    ${scoreExplainSummaryHtml(detail, trainee)}
  `;

  const blocks = [
    fb("学习规划", tierLearning, learning, trainee.learning),
    fb("赛考规划", tierCompetition, competition, trainee.competition),
    fb("答疑能力", tierQna, qna, trainee.qna),
  ];

  const courseKbCard =
    courseKnowledge && courseKnowledge.findings && courseKnowledge.findings.length > 0
      ? courseKnowledgeCardHtml(courseKnowledge, trainee.courseFindings)
      : "";

  els.feedbackDetail.innerHTML = `
    <div class="fb-card" style="grid-column:1/-1;background:rgba(61,156,245,0.08);border-color:rgba(61,156,245,0.25);">
      <h3>综合评语</h3>
      <p class="muted" style="margin:0;white-space:pre-wrap;">${formatInlineBold(escapeHtml(trainee.summary))}</p>
    </div>
    ${courseKbCard}
    ${blocks.join("")}
  `;
}

function dimOneLiner(d, traineeDim) {
  const priority = traineeDim?.priorityIssues || [];
  if (priority.length > 0) {
    return priority[0].slice(0, 36) + (priority[0].length > 36 ? "…" : "");
  }
  const missed = d?.displayMissed || [];
  if (missed.length === 0) {
    const hitCount = (d?.hits || []).filter((h) => h.met && h.delta > 0).length;
    return hitCount >= 4 ? "主要要点已覆盖" : "还有要点待补充";
  }
  return missed
    .slice(0, 1)
    .map((m) => humanizeIssue(m.label).slice(0, 36))
    .join("；");
}

function scoreExplainSummaryHtml(detail, trainee) {
  const rows = [
    ["学习规划", detail.learning, trainee?.learning],
    ["赛考规划", detail.competition, trainee?.competition],
    ["答疑能力", detail.qna, trainee?.qna],
  ];
  const body = rows
    .map(
      ([label, d, td]) =>
        `<tr><td>${escapeHtml(label)}</td><td class="num">${Number(d.score).toFixed(2)}</td><td class="hint">${escapeHtml(dimOneLiner(d, td))}</td></tr>`
    )
    .join("");
  return `
    <table class="score-explain-table" aria-label="分项计分摘要">
      <thead><tr><th>维度</th><th>得分</th><th>要点</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function barRow(label, value, max) {
  const pct = Math.round((value / max) * 100);
  return `
    <div class="score-row">
      <span>${escapeHtml(label)}</span>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <span class="num">${value.toFixed(2)}</span>
    </div>`;
}

function fb(title, tier, score, td) {
  const strengths =
    (td.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("") ||
    "<li class=\"muted\">（暂无突出亮点，按下方建议补充即可）</li>";
  const priority =
    (td.priorityIssues || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("") ||
    "<li class=\"muted\">（本项暂无额外修改建议）</li>";
  return `
    <div class="fb-card">
      <h3>${escapeHtml(title)} · ${score.toFixed(2)} 分</h3>
      <span class="tier">${escapeHtml(tier)}</span>
      <p class="muted" style="margin:8px 0 6px;font-weight:600;">做得好的地方</p>
      <ul>${strengths}</ul>
      <p class="muted" style="margin:12px 0 6px;font-weight:600;">建议先改（最多 3 条）</p>
      <ul>${priority}</ul>
    </div>`;
}

/** 将已转义文本中的 **片段** 转为 <strong>（仅用于本系统生成的固定文案） */
function formatInlineBold(escaped) {
  return escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function courseKnowledgeCardHtml(ck, traineeFindings) {
  const d = ck.deductions || { learning: 0, competition: 0, qna: 0 };
  const headParts = [];
  if (d.learning > 0) headParts.push(`学习规划扣 ${d.learning.toFixed(2)} 分`);
  if (d.competition > 0) headParts.push(`赛考规划扣 ${d.competition.toFixed(2)} 分`);
  if (d.qna > 0) headParts.push(`答疑扣 ${d.qna.toFixed(2)} 分`);
  const head = headParts.join(" · ") || "已计入总分";
  const items = (traineeFindings || [])
    .map((f) => `<li class="course-kb-msg">${escapeHtml(f.text || "")}</li>`)
    .join("");
  return `
    <div class="fb-card fb-card--course-kb" style="grid-column:1/-1;">
      <h3>课程表述需修改</h3>
      <p class="muted" style="margin:0 0 10px;">以下内容与公司课程/赛考标准不一致，请对照培训材料修改。出现在逐字稿的问题主要扣学习与赛考；仅出现在答疑的问题主要扣答疑。</p>
      <p class="course-kb-head">${escapeHtml(head)}</p>
      <ul class="course-kb-list">${items}</ul>
    </div>`;
}

function resetAll() {
  hideRulesPage();
  els.teacherName.value = "";
  els.teacherCity.value = "";
  els.studentName.value = "";
  els.studentAge.value = "10";
  els.studentGender.value = "男";
  els.studentGrade.selectedIndex = 0;
  els.studentProvince.selectedIndex = 0;
  refreshCitySelect();
  els.studentTrackLine.value = "科特线";
  els.studentCourseStage.value = "图形化";
  els.scriptText.value = "";
  updateCharCount();
  currentQuestions = [];
  lastScorePayload = null;
  lastResult = null;
  recordSaved = false;
  els.saveStatus.textContent = "";
  els.questionsContainer.innerHTML = "";
  showStep("info");
}

function openAdminModal() {
  delete window.__PPAIS_ADMIN_TOKEN__;
  els.modalAdmin.classList.remove("hidden");
  els.adminPassword.value = "";
  els.adminRecords.classList.add("hidden");
  els.adminLoginForm.classList.remove("hidden");
  adminSelectedIds.clear();
  els.adminPassword.focus();
}

function closeAdminModal() {
  delete window.__PPAIS_ADMIN_TOKEN__;
  els.modalAdmin.classList.add("hidden");
  adminSelectedIds.clear();
}

async function onAdminLogin(e) {
  e.preventDefault();
  const pw = els.adminPassword.value.trim();
  if (pw !== ADMIN_PASSWORD) {
    return toast("密码错误。");
  }
  window.__PPAIS_ADMIN_TOKEN__ = pw;
  els.adminLoginForm.classList.add("hidden");
  els.adminRecords.classList.remove("hidden");
  adminSelectedIds.clear();
  await renderAdminRecords();
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

function filterAdminRecords(list, { name, city, dateFrom, dateTo }) {
  if (adminFilterDateRangeInvalid(dateFrom, dateTo)) return [];
  return list.filter((r) => {
    const t = r.teacher || {};
    const tn = String(t.name || "");
    const tc = String(t.city || "");
    if (name && !tn.includes(name)) return false;
    if (city && !tc.includes(city)) return false;
    if (!isCreatedAtInChinaYmdRange(r.createdAt, dateFrom, dateTo)) return false;
    return true;
  });
}

function formatAdminStats(allCount, filteredCount, selectedCount, filters) {
  const { dateFrom, dateTo } = filters;
  let text = `共 ${allCount} 条存档 · 当前筛选 ${filteredCount} 条 · 已勾选 ${selectedCount} 条（导出以勾选为准）`;
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

/** 仅刷新列表与统计条，不重建筛选输入框（避免输入时丢焦点） */
async function refreshAdminRecordList() {
  const listEl = document.getElementById("admin-record-list");
  if (!listEl) return;

  const all = await loadRecords();
  if (!all.length) return;

  const filters = getAdminFilterInputs();
  const filtered = filterAdminRecords(all, filters);

  listEl.innerHTML = filtered.length
    ? filtered.map((r) => adminRecordHtml(r)).join("")
    : `<p class="muted">${escapeHtml(adminListEmptyMessage(filters))}</p>`;

  const statsEl = els.adminRecords.querySelector(".admin-stats");
  if (statsEl) {
    statsEl.textContent = formatAdminStats(
      all.length,
      filtered.length,
      adminSelectedIds.size,
      filters
    );
  }
}

async function renderAdminRecords() {
  const all = await loadRecords();
  const prev = getAdminFilterInputs();

  if (!all.length) {
    els.adminRecords.innerHTML = "<p class=\"muted\">暂无历史记录。</p>";
    return;
  }

  els.adminRecords.innerHTML = `
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
        <button type="button" class="btn btn-ghost btn-sm" id="admin-select-filtered">全选当前列表</button>
        <button type="button" class="btn btn-ghost btn-sm" id="admin-clear-selection">取消全部勾选</button>
        <button type="button" class="btn btn-primary btn-sm" id="admin-download-json">批量下载 JSON</button>
        <button type="button" class="btn btn-primary btn-sm" id="admin-download-csv">批量下载 CSV</button>
      </div>
      <p class="muted admin-stats"></p>
    </div>
    <div id="admin-record-list"></div>
  `;

  await refreshAdminRecordList();
}

async function onAdminPanelClick(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  if (t.id === "admin-select-filtered") {
    const all = await loadRecords();
    const filters = getAdminFilterInputs();
    adminSelectedIds.clear();
    filterAdminRecords(all, filters).forEach((r) => adminSelectedIds.add(r.id));
    await renderAdminRecords();
    toast(`已勾选当前筛选列表中的 ${adminSelectedIds.size} 条。`);
    return;
  }

  if (t.id === "admin-clear-selection") {
    adminSelectedIds.clear();
    await renderAdminRecords();
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
    void updateAdminStatsOnly();
    return;
  }
  if (t.id === "admin-filter-date-from" || t.id === "admin-filter-date-to") {
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
    void refreshAdminRecordList();
  }, 220);
}

async function updateAdminStatsOnly() {
  const el = els.adminRecords.querySelector(".admin-stats");
  if (!el) return;
  const all = await loadRecords();
  if (!all.length) return;
  const filters = getAdminFilterInputs();
  const filtered = filterAdminRecords(all, filters);
  el.textContent = formatAdminStats(all.length, filtered.length, adminSelectedIds.size, filters);
}

async function getSelectedRecordsOrdered() {
  const all = await loadRecords();
  const map = new Map(all.map((r) => [r.id, r]));
  const out = [];
  for (const id of adminSelectedIds) {
    const r = map.get(id);
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
    "summary",
    "script_full",
    "question_1",
    "answer_1",
    "question_2",
    "answer_2",
    "tier_learning",
    "tier_competition",
    "tier_qna",
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
      r.summary,
      r.script,
      qs[0] || "",
      as[0] || "",
      qs[1] || "",
      as[1] || "",
      sc.tierLearning ?? "",
      sc.tierCompetition ?? "",
      sc.tierQna ?? "",
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

function adminRecordHtml(r) {
  const t = r.teacher || {};
  const s = r.student || {};
  const sc = r.scores || {};
  const qs = Array.isArray(r.questions) ? r.questions : [];
  const as = Array.isArray(r.answers) ? r.answers : [];
  const checked = adminSelectedIds.has(r.id) ? "checked" : "";

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
  )} · 赛考 ${escapeHtml(String(sc.competition ?? ""))} · 答疑 ${escapeHtml(String(sc.qna ?? ""))}</div>
        </div>
      </div>
      <details class="record-detail">
        <summary>展开：完整逐字稿、家长题与作答、分项点评、综合评语</summary>
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
        </div>
      </details>
    </article>`;
}

function showRulesPage() {
  els.mainView.classList.add("hidden");
  els.pageRules.classList.remove("hidden");
  if (els.siteFooter) els.siteFooter.classList.add("hidden");
  window.scrollTo(0, 0);
}

function hideRulesPage() {
  els.pageRules.classList.add("hidden");
  els.mainView.classList.remove("hidden");
  if (els.siteFooter) els.siteFooter.classList.remove("hidden");
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

init();
