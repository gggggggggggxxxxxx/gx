import fs from "fs";
import { auditCourseKnowledge } from "../js/courseKnowledgeAudit.js";

let raw = fs.readFileSync(new URL("./_records.json", import.meta.url), "utf8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
let all = JSON.parse(raw);
if (all?.value) all = all.value;

const r = all.find((x) => x.id === "2e7872d7-b1c9-4f69-baa2-3c1b80b2555b");
if (!r) {
  console.log("record not found");
  process.exit(1);
}

const script = r.script || "";
const s = r.student || {};
const combined = (r.answers || []).join("\n");

console.log("学员声明:", s.trackLine, s.courseStage);
console.log("稿长:", script.length);

const patterns = [
  /三个月[\s\S]{0,120}/g,
  /四个月[\s\S]{0,120}/g,
  /YCL[^。\n]{0,40}/g,
  /Python[\s\S]{0,80}/gi,
  /一级|二级|三级|四级|五级|六级|七级|八级|九级/g,
];

for (const re of patterns) {
  console.log("\n===", re.source.slice(0, 40), "===");
  let m;
  let n = 0;
  while ((m = re.exec(script)) && n < 12) {
    console.log(`[${m.index}]`, m[0].replace(/\s+/g, " ").slice(0, 100));
    n++;
  }
}

const audit = auditCourseKnowledge(script, combined, s);
console.log("\n=== findings ===");
for (const f of audit.findings) {
  console.log(f.id, f.penalty, f.message.slice(0, 100));
}

// check both records for 杨洋
const yang = all.filter((x) => x.teacher?.name === "杨洋" && x.teacher?.city === "西安");
for (const rec of yang) {
  const a = auditCourseKnowledge(rec.script, (rec.answers || []).join("\n"), rec.student);
  console.log("\n记录", rec.id.slice(0, 8), formatDate(rec.createdAt), "findings", a.findings.map((f) => f.id));
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(iso))
    .replace(/\//g, "-");
}
