import { GRADES, TRACK_LINES, COURSE_STAGES, PROVINCES, citiesForProvince } from "./data.js";
import { pickParentQuestions } from "./questions.js";
import { ensureTraineeFeedback, humanizeIssue } from "./feedbackDisplay.js";
import { scoreAssessment } from "./scoring.js";
import {
  saveRecord,
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
  mainView: document.getElementById("main-view"),
  pageRules: document.getElementById("page-rules"),
  siteFooter: document.getElementById("site-footer"),
};

let currentQuestions = [];
let questionsContextKey = "";
/** @type {Map<string, string>} */
let savedAnswersByQid = new Map();
let lastScorePayload = null;
let lastResult = null;
let recordSaved = false;

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
  document.getElementById("btn-back-script").addEventListener("click", onBackToScript);
  document.getElementById("btn-run-score").addEventListener("click", onRunScore);
  document.getElementById("btn-new-assessment").addEventListener("click", resetAll);
  document.getElementById("btn-show-rules").addEventListener("click", showRulesPage);
  document.getElementById("btn-back-rules").addEventListener("click", hideRulesPage);
}

function fillSelect(selectEl, options) {
  selectEl.innerHTML = options.map((o) => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`).join("");
}

function refreshCitySelect() {
  const p = els.studentProvince.value;
  const prevCity = els.studentCity.value;
  const cities = citiesForProvince(p);
  fillSelect(els.studentCity, cities);
  if (prevCity && cities.includes(prevCity)) {
    els.studentCity.value = prevCity;
  }
}

function buildQuestionsContextKey(script, student) {
  return JSON.stringify({
    script: String(script || "").trim(),
    name: student.name,
    age: student.age,
    grade: student.grade,
    province: student.province,
    city: student.city,
    trackLine: student.trackLine,
    courseStage: student.courseStage,
  });
}

function snapshotAnswersFromDom() {
  savedAnswersByQid.clear();
  for (const a of els.questionsContainer.querySelectorAll(".answer-input")) {
    const id = a.getAttribute("data-q-id");
    if (id) savedAnswersByQid.set(id, a.value);
  }
}

function restoreAnswersToDom() {
  for (const a of els.questionsContainer.querySelectorAll(".answer-input")) {
    const id = a.getAttribute("data-q-id");
    if (id && savedAnswersByQid.has(id)) {
      a.value = savedAnswersByQid.get(id);
    }
  }
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

function onBackToScript() {
  snapshotAnswersFromDom();
  showStep("script");
}

function onToQuestions() {
  const script = els.scriptText.value.trim();
  if (script.length < MIN_SCRIPT_CHARS) {
    return toast(`逐字稿字数不足：至少需要 ${MIN_SCRIPT_CHARS} 字。`);
  }
  const student = getStudent();
  const key = buildQuestionsContextKey(script, student);

  snapshotAnswersFromDom();

  if (key === questionsContextKey && currentQuestions.length > 0) {
    showStep("questions");
    return;
  }

  currentQuestions = pickParentQuestions({ script, student });
  questionsContextKey = key;
  renderQuestions();
  restoreAnswersToDom();
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
    schemaVersion: 3,
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
      profile: lastResult.profile,
      tierLearning: lastResult.tierLearning,
      tierCompetition: lastResult.tierCompetition,
      tierQna: lastResult.tierQna,
      tierProfile: lastResult.tierProfile,
    },
    profileMatch: lastResult.profileMatch,
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
    profile,
    tierLearning,
    tierCompetition,
    tierQna,
    tierProfile,
    detail,
    courseKnowledge,
    declaration,
    profileMatch,
  } = res;
  const trainee = ensureTraineeFeedback(res);

  els.scoreBoard.innerHTML = `
    <div class="score-total">
      <div class="big">${total.toFixed(2)}</div>
      <div class="label">最终总分 / 10<br/><span style="font-size:0.78rem;opacity:.85">学习×35% + 赛考×35% + 答疑×20% + 画像×10%</span></div>
    </div>
    <p class="score-declaration muted small" style="margin:12px 0 0;text-align:center;line-height:1.5;">
      ${escapeHtml(trainee.declarationLabel || "您为学员申报的路径")}：<strong>${escapeHtml(declaration?.trackLine || "—")}</strong> · <strong>${escapeHtml(declaration?.courseStage || "—")}</strong>
    </p>
    <div class="score-bars">
      ${barRow("学习规划", learning, 10)}
      ${barRow("赛考规划", competition, 10)}
      ${barRow("答疑能力", qna, 10)}
      ${barRow("画像匹配", profile, 10)}
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

  const profileCard = profileMatch
    ? profileMatchCardHtml(profileMatch, profile, tierProfile)
    : "";

  els.feedbackDetail.innerHTML = `
    <div class="fb-card" style="grid-column:1/-1;background:rgba(61,156,245,0.08);border-color:rgba(61,156,245,0.25);">
      <h3>综合评语</h3>
      <p class="muted" style="margin:0;white-space:pre-wrap;">${formatInlineBold(escapeHtml(trainee.summary))}</p>
    </div>
    ${profileCard}
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
    ["学习规划", detail.learning, trainee?.learning, false],
    ["赛考规划", detail.competition, trainee?.competition, false],
    ["答疑能力", detail.qna, trainee?.qna, false],
    ["画像匹配", detail.profile, trainee?.profile, true],
  ];
  const body = rows
    .map(([label, d, td, profileOnlyScore]) => {
      const hint = profileOnlyScore ? "—" : dimOneLiner(d, td);
      return `<tr><td>${escapeHtml(label)}</td><td class="num">${Number(d.score).toFixed(2)}</td><td class="hint">${escapeHtml(hint)}</td></tr>`;
    })
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

function profileMatchCell(hit) {
  return hit
    ? '<span class="profile-hit" aria-label="已匹配">✓</span>'
    : '<span class="profile-miss" aria-label="未匹配">✗</span>';
}

/** @param {{ script: { name: boolean; age: boolean; city: boolean }; qna: { name: boolean; age: boolean } }} pm */
function profileMatchCardHtml(pm, score, tier) {
  const scoreStr = Number(score).toFixed(2);
  return `
    <div class="fb-card profile-match-card" style="grid-column:1/-1;">
      <h3>学员画像匹配明细 · ${escapeHtml(scoreStr)} 分</h3>
      <span class="tier">${escapeHtml(tier || "")}</span>
      <p class="muted" style="margin:0 0 10px;">系统检测逐字稿与答疑是否绑定步骤 1 填写的姓名（全名/简称）、年龄、城市。</p>
      <table class="profile-match-table" aria-label="画像匹配明细">
        <thead>
          <tr><th>范围</th><th>姓名</th><th>年龄</th><th>城市</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>逐字稿</td>
            <td>${profileMatchCell(pm.script.name)}</td>
            <td>${profileMatchCell(pm.script.age)}</td>
            <td>${profileMatchCell(pm.script.city)}</td>
          </tr>
          <tr>
            <td>答疑</td>
            <td>${profileMatchCell(pm.qna.name)}</td>
            <td>${profileMatchCell(pm.qna.age)}</td>
            <td class="muted">—</td>
          </tr>
        </tbody>
      </table>
    </div>`;
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
  questionsContextKey = "";
  savedAnswersByQid.clear();
  lastScorePayload = null;
  lastResult = null;
  recordSaved = false;
  els.saveStatus.textContent = "";
  els.questionsContainer.innerHTML = "";
  showStep("info");
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
