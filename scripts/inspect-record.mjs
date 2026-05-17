import { config } from "dotenv";
import { fileURLToPath } from "url";
import path from "path";
import { createClient } from "@libsql/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../server/.env") });
import { auditCourseKnowledge } from "../js/courseKnowledgeAudit.js";
import { scoreAssessment } from "../js/scoring.js";
import { formatDateTimeChina } from "../js/dateFormat.js";

const teacherName = process.argv[2] || "杨洋";
const teacherCity = process.argv[3] || "西安";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("缺少 TURSO 环境变量");
  process.exit(1);
}

const client = createClient({ url, authToken });
const rs = await client.execute(
  "SELECT payload, created_at FROM assessment_records ORDER BY created_at DESC"
);

const matches = [];
for (const row of rs.rows) {
  const raw = row.payload ?? row[0];
  if (!raw) continue;
  let r;
  try {
    r = JSON.parse(raw);
  } catch {
    continue;
  }
  const t = r.teacher || {};
  if (
    String(t.name || "").includes(teacherName) &&
    String(t.city || "").includes(teacherCity)
  ) {
    matches.push({ ...r, _created_at: row.created_at });
  }
}

if (!matches.length) {
  console.log(`未找到老师「${teacherName}」城市「${teacherCity}」的记录`);
  process.exit(0);
}

console.log(`共 ${matches.length} 条匹配记录，分析最新一条：\n`);

const r = matches[0];
const t = r.teacher || {};
const s = r.student || {};
const script = r.script || "";
const answers = r.answers || [];
const combined = answers.join("\n");

console.log("--- 基本信息 ---");
console.log("时间(中国):", formatDateTimeChina(r.createdAt || r._created_at));
console.log("老师:", t.name, t.city);
console.log("学员:", s.name, s.age, s.grade, s.trackLine, s.courseStage, s.province, s.city);
console.log("总分:", r.scores?.total);

const audit = auditCourseKnowledge(script, combined, s);
const scored = scoreAssessment({ script, student: s, answers });

console.log("\n--- 课程口径扣分 ---");
console.log(
  "合计扣分 → 学习",
  audit.totals.learning,
  "赛考",
  audit.totals.competition,
  "答疑",
  audit.totals.qna
);

if (!audit.findings.length) {
  console.log("（无课程口径 finding）");
} else {
  audit.findings.forEach((f, i) => {
    console.log(`\n[${i + 1}] id: ${f.id}`);
    console.log("    位置:", f.sources?.join("、"));
    console.log("    说明:", f.message);
    console.log(
      "    扣分: 学习",
      f.penalty.learning,
      "赛考",
      f.penalty.competition,
      "答疑",
      f.penalty.qna
    );
  });
}

console.log("\n--- 逐字稿相关片段（含关键词检索）---");
const keys = [
  "课时",
  "48",
  "60",
  "退费",
  "YCL",
  "三个月",
  "四个月",
  "一级",
  "二级",
  "四级",
  "思维",
  "科特",
  "国家级",
  "张",
];
for (const k of keys) {
  const idx = script.indexOf(k);
  if (idx >= 0) {
    const snip = script.slice(Math.max(0, idx - 40), idx + 60).replace(/\s+/g, " ");
    console.log(`「${k}」…${snip}…`);
  }
}

console.log("\n--- 完整 findings（scoreAssessment）---");
const ck = scored.courseKnowledge;
if (ck?.findings?.length) {
  ck.findings.forEach((f) => console.log("-", f.id, "|", f.message.slice(0, 120)));
} else {
  console.log("（与 audit 一致：无）");
}
