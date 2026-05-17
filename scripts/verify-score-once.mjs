/**
 * 一次性验证评分流程（stdout 供对话展示）
 */
import { scoreAssessment } from "../js/scoring.js";

function pad(s, n) {
  return String(s).padEnd(n, " ");
}

const student = {
  name: "小明",
  age: 10,
  grade: "小学四年级",
  province: "北京",
  city: "北京市",
  trackLine: "科特线",
  courseStage: "图形化",
};

const script = `
各位家长好，今天结合咱们家小明的情况，说说接下来怎么学。
小明今年10岁，四年级，课堂吸收不错，但逻辑思维在条件嵌套上还有薄弱点，需要多练流程图。
我们按三阶段路径推进科特图形化：启蒙计算思维、赛考衔接、后续可接 Python 初探。
会带智能门铃、闯迷宫这类项目落地，培养编程思维与专注力。
大约三个月后考 YCL 一级，八个月左右冲二级，长期衔接小升初与科技特长生方向。
赛考方面结合北京白名单赛事，去年班上有学员拿省奖；家长担心投入和跟风，我们会控制节奏。
科技特长生政策每年调整，具体以当年官方招生简章为准，请您核实。
`.trim();

const answers = [
  `第一，理解您担心投入和跟风参赛。第二，建议按周跟踪赛考节奏，每月复盘一次，例如先稳住 YCL 一级节点再谈进阶。第三，若后续追问退费，以课程顾问书面政策为准。`,
  `小明目前适合先巩固图形化阶段目标。若家长担心孩子跟不上，可设置阶段性验收；万一畏难，我们会加练流程图与分步任务，避免断层。`,
];

console.log("=== 步骤 1：学员声明 ===");
console.log(JSON.stringify(student, null, 2));
console.log("\n=== 步骤 2：逐字稿（节选 " + script.length + " 字）===");
console.log(script.slice(0, 280) + (script.length > 280 ? "…" : ""));
console.log("\n=== 步骤 3：答疑（2 题，字数 " + answers.map((a) => a.length).join(" / ") + "）===");
answers.forEach((a, i) => console.log(`[Q${i + 1}] ${a.slice(0, 120)}…`));

console.log("\n=== 步骤 4：scoreAssessment() ===");
const res = scoreAssessment({ script, student, answers });

console.log("\n--- 分项得分（实际计分，含课程扣分后）---");
console.log(`学习规划: ${res.learning.toFixed(2)}  (${res.tierLearning})`);
console.log(`赛考规划: ${res.competition.toFixed(2)}  (${res.tierCompetition})`);
console.log(`答疑能力: ${res.qna.toFixed(2)}  (${res.tierQna})`);
console.log(`加权总分: ${res.total.toFixed(2)} / 10`);

console.log("\n--- 摘要表（结果页首屏）---");
for (const [label, key] of [
  ["学习规划", "learning"],
  ["赛考规划", "competition"],
  ["答疑能力", "qna"],
]) {
  const d = res.detail[key];
  const hint =
    (d.displayMissed || [])
      .slice(0, 2)
      .map((m) => m.label.slice(0, 36))
      .join("；") || "主要量规项已覆盖";
  console.log(`${pad(label, 8)} ${d.score.toFixed(2)}   ${hint}`);
}

console.log("\n--- 课程口径审计 ---");
if (!res.courseKnowledge.findings.length) {
  console.log("（无扣分项）");
} else {
  for (const f of res.courseKnowledge.findings) {
    const p = f.penalty;
    console.log(`- ${f.id}: ${f.message.slice(0, 60)}… [学习-${p.learning} 赛考-${p.competition}]`);
  }
}

console.log("\n--- 学习规划：封顶 / 未达标（最多展示 3+3）---");
const L = res.detail.learning;
for (const c of L.capReasons || []) console.log(`[封顶 ${c.cap}] ${c.id}: ${c.reason.slice(0, 50)}…`);
for (const m of (L.displayMissed || []).slice(0, 3)) console.log(`[要点] ${m.id}: ${m.label.slice(0, 50)}`);

console.log("\n--- 赛考规划：封顶 / 要点 ---");
const C = res.detail.competition;
for (const c of C.capReasons || []) console.log(`[封顶 ${c.cap}] ${c.id}`);
for (const m of (C.displayMissed || []).slice(0, 3)) console.log(`[要点] ${m.id}`);

console.log("\n--- 答疑：封顶 / 要点 ---");
const Q = res.detail.qna;
for (const c of Q.capReasons || []) console.log(`[封顶 ${c.cap}] ${c.id}`);
for (const m of (Q.displayMissed || []).slice(0, 3)) console.log(`[要点] ${m.id}`);

console.log("\n--- 学习规划命中加分项（节选）---");
for (const h of (L.hits || []).filter((x) => x.met && x.delta > 0).slice(0, 8)) {
  console.log(`  +${h.delta}  ${h.id}  ${h.label}`);
}

console.log("\n=== 步骤 5：综合评语（节选）===");
console.log(res.summary.split("\n")[0]);
