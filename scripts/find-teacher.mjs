import fs from "fs";
import { auditCourseKnowledge } from "../js/courseKnowledgeAudit.js";
import { formatDateTimeChina } from "../js/dateFormat.js";

let raw = fs.readFileSync(new URL("./_records.json", import.meta.url), "utf8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
let all = JSON.parse(raw);
if (all && all.value) all = all.value;

const name = process.argv[2] || "杨洋";
const city = process.argv[3] || "西安";

const matches = all.filter((r) => {
  const t = r.teacher || {};
  return t.name === name && String(t.city || "").includes(city);
});

console.log(JSON.stringify({ count: matches.length, ids: matches.map((m) => m.id) }));

if (!matches.length) process.exit(0);

matches.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
const r = matches[0];
const s = r.student || {};
const script = r.script || "";
const combined = (r.answers || []).join("\n");
const audit = auditCourseKnowledge(script, combined, s);

const out = {
  createdAtChina: formatDateTimeChina(r.createdAt),
  teacher: r.teacher,
  student: {
    name: s.name,
    trackLine: s.trackLine,
    courseStage: s.courseStage,
    province: s.province,
    city: s.city,
  },
  total: r.scores?.total,
  deductions: audit.totals,
  findings: audit.findings.map((f) => ({
    id: f.id,
    sources: f.sources,
    message: f.message.replace(/（检出位置：[^）]+）/, ""),
    penalty: f.penalty,
  })),
};

console.log(JSON.stringify(out, null, 2));

// snippets for each finding - search rule-related phrases
for (const f of audit.findings) {
  const id = f.id;
  console.log("\n--- snippet for", id, "---");
  const patterns = {
    "think-scratch-60h": /60\s*课时|六十课时/,
    "kote-scratch-48h-wrong": /48\s*课时/,
    "think-scratch-refund-10": /前\s*10\s*课时.*退/,
    "kote-scratch-refund-8": /前\s*8\s*课时.*退/,
    "ycl-kote-scratch-3m-not-l1": /三.{0,3}月.{0,20}(?!一级|1级|YCL一级)/,
  };
  const re = patterns[id];
  if (re) {
    const m = script.match(re);
    if (m) console.log(script.slice(Math.max(0, m.index - 30), m.index + 80).replace(/\n/g, " "));
  }
}
