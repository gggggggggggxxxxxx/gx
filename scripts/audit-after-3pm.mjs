/**
 * 列出指定时间（中国时区）之后所有提交的课程口径扣分
 * 用法: node scripts/audit-after-3pm.mjs [YYYY-MM-DD] [HH:mm]
 */
import fs from "fs";
import { auditCourseKnowledge } from "../js/courseKnowledgeAudit.js";
import { formatDateTimeChina } from "../js/dateFormat.js";

const dateArg = process.argv[2] || "2026-05-17";
const timeArg = process.argv[3] || "15:00";
const [y, mo, d] = dateArg.split("-").map(Number);
const [hh, mm] = timeArg.split(":").map(Number);
/** 中国 15:00 = UTC 07:00（当日无 DST） */
const cutoff = new Date(Date.UTC(y, mo - 1, d, hh - 8, mm, 0, 0));

let raw = fs.readFileSync(new URL("./_records.json", import.meta.url), "utf8");
if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
let all = JSON.parse(raw);
if (all?.value) all = all.value;

const after = all
  .filter((r) => new Date(r.createdAt) > cutoff)
  .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

const RULE_LABELS = {
  "scratch-think-60h": "思维线图形化误写60课时（应为48）",
  "scratch-kote-48h": "科特图形化误写48课时（应为60）",
  "py-think-60h": "思维线Python误写60课时（应为48）",
  "py-kote-total-48": "科特Python整阶段误写共48课时（应为60）",
  "refund-scratch-think-p10": "思维图形化退费节点误写前10课时（应为前8）",
  "refund-scratch-kote-p8": "科特图形化退费节点误写前8课时（应为前10）",
  "refund-python-p10": "Python退费节点误写前10课时（应为前8）",
  "fun-cpp-56": "趣味C++误写56课时（应为60）",
  "regular-cpp-60": "常规C++误写60课时（应为56）",
  "ycl-think-scratch-3m": "思维图形化：3个月对接任意YCL等级（应为约4个月一级）",
  "ycl-think-scratch-4m-l2": "思维图形化：4个月应对齐一级，却写了非一级",
  "ycl-kote-scratch-4m-l1": "科特图形化：4个月对接任意YCL（首张应为约3个月一级）",
  "ycl-kote-scratch-3m-not-l1": "科特图形化：3个月对接非一级（首张应为约3个月一级）",
  "ycl-think-py-3m4": "思维Python：3个月对接任意YCL（应为约4个月四级）",
  "ycl-think-py-4m-l5": "思维Python：4个月应对齐四级，却写了非四级",
  "ycl-kote-py-4m-l4": "科特Python：4个月对接任意YCL（首张应为约3个月四级）",
  "ycl-kote-py-3m-not-l4": "科特Python：3个月对接非四级（首张应为约3个月四级）",
  "cert-annual-national-over4": "声称一年5张及以上国家级证书（超出产品线节奏）",
  "cert-half-year-national-3plus": "声称半年3张及以上国家级证书",
  "cert-kote-annual-4": "科特线声称一年仅4张国家级（口径边界）",
};

function snippetForFinding(script, answers, findingId) {
  const text = [script, answers].filter(Boolean).join("\n");
  const hints = {
    "ycl-kote-scratch-3m-not-l1": /三个月[\s\S]{0,120}YCL|YCL[\s\S]{0,120}三个月/iu,
    "ycl-kote-scratch-4m-l1": /四个月[\s\S]{0,120}YCL|YCL[\s\S]{0,120}四个月/iu,
    "ycl-think-scratch-4m-l2": /四个月[\s\S]{0,120}YCL|YCL[\s\S]{0,120}四个月/iu,
    "cert-annual-national-over4": /一年[\s\S]{0,80}[五六七八九十\d]+\s*张/iu,
    "cert-half-year-national-3plus": /半年[\s\S]{0,80}[三四五六七八九十\d]+\s*张/iu,
  };
  const re = hints[findingId] || /YCL|课时|退费|国家级|半年|一年/u;
  const m = re.exec(text);
  if (!m) return "";
  const at = m.index;
  return text.slice(Math.max(0, at - 40), Math.min(text.length, at + 100)).replace(/\s+/g, " ");
}

const withFindings = [];
let noFinding = 0;

for (const r of after) {
  const s = r.student || {};
  const script = r.script || "";
  const combined = (r.answers || []).join("\n");
  const audit = auditCourseKnowledge(script, combined, s);
  if (!audit.findings.length) {
    noFinding++;
    continue;
  }
  withFindings.push({
    time: formatDateTimeChina(r.createdAt),
    teacher: `${r.teacher?.name || "—"} · ${r.teacher?.city || ""}`,
    student: `${s.name || "—"} · ${s.trackLine || "—"} · ${s.courseStage || "—"}`,
    total: r.scores?.total,
    deductions: audit.totals,
    findings: audit.findings.map((f) => ({
      id: f.id,
      label: RULE_LABELS[f.id] || f.id,
      sources: f.sources,
      penalty: f.penalty,
      snippet: snippetForFinding(script, combined, f.id),
      message: f.message.replace(/（检出位置：[^）]+）/u, "").slice(0, 200),
    })),
  });
}

const report = {
  cutoffChina: `${dateArg} ${timeArg}`,
  cutoffUtc: cutoff.toISOString(),
  scanned: after.length,
  withCourseFindings: withFindings.length,
  clean: noFinding,
  records: withFindings,
};

const outPath = new URL("./_audit-3pm.json", import.meta.url);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

const byId = {};
for (const r of withFindings) {
  for (const f of r.findings) byId[f.id] = (byId[f.id] || 0) + 1;
}
console.log(
  `scanned=${report.scanned} withFindings=${report.withCourseFindings} clean=${report.clean}`
);
console.log("byRule", JSON.stringify(byId));
