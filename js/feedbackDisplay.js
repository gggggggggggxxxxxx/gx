/**
 * 培训师可读版评语（展示层；不改变计分逻辑）
 */

/** @param {string} s */
function stripMd(s) {
  return String(s || "").replace(/\*\*/g, "");
}

/** 封顶规则 id → 人话 */
const CAP_PLAIN = {
  "cap.layer_depth":
    "学习规划得分受限：请写清「分几阶段、每阶段目标」，并补充项目作品、能力拆解或学情描述中的至少两项。",
  "cap.no_shortcoming":
    "学习规划最高约 8.5 分：除表扬外，请写明孩子 1～2 处短板或待提升点（如「基础偏弱」「注意力易分散」）。",
  "cap.risk_long":
    "学习规划要冲更高分：需同时写清「可能的学习卡点/畏难情景」和「长期升学或体系规划」。",
  "cap.local_case_compare":
    "赛考规划得分受限：请同时写清本地政策（结合学员省市）、真实学员案例，以及赛事含金量对比。",
  "cap.time_case": "赛考规划最高约 8 分：请补充明确时间节点，并举例同年级/同学情的获奖或备赛案例。",
  "cap.policy_compliance":
    "赛考与升学挂钩处请加合规表述，例如「以当年官方招生简章为准」「政策以核实为准」，避免过度承诺。",
  "cap.local_worry":
    "赛考要冲更高分：请结合学员所在地区解读政策，并回应家长对投入、认可度、跟风参赛等顾虑。",
  "cap.plan_structure":
    "答疑得分受限：请用「第一、第二…」或步骤分点，并给出可执行的跟踪/复盘安排。",
  "cap.deep_length":
    "答疑最高约 8.5 分：篇幅建议更充分，并预判家长可能的追问或顾虑。",
  "cap.convert":
    "答疑要冲满分：需同时做到「预判后续追问」和「把顾虑转化为可接受的规划建议」。",
};

/** 检查项 / 原文 → 人话（键为完整原文或前缀） */
const ISSUE_PLAIN = [
  [
    "缺少清晰的学习阶段或路径拆分",
    "请把学习路线按阶段写清楚（每学期/每阶段目标），避免只罗列课程或语言名称。",
  ],
  [
    "知识点与能力模块展开不足",
    "请点名具体知识点或模块（如循环、变量、项目类型），并说明怎么练。",
  ],
  ["未体现项目作品与实操成果", "请写出 1～2 个具体项目或作品（如小游戏、科创作品），体现能落地。"],
  [
    "缺少对思维、专注力、科创竞争力",
    "请拆解孩子的思维、专注力或科创相关能力，不要只写「很聪明」。",
  ],
  [
    "几乎未绑定学员个体信息",
    "请结合本学员的姓名、年龄、年级或课堂表现来写，体现一对一沟通。",
  ],
  [
    "缺少学情或表现侧写",
    "请描述孩子当前基础、习惯、进步或课堂表现，让家长感到「你了解我的孩子」。",
  ],
  [
    "仅有辅导/训练营/冲刺",
    "不要只写辅导班、训练营；请预判孩子可能的学习卡点或跟不上的情景。",
  ],
  [
    "缺少学习卡点、畏难或断层",
    "请预判学习难点（如畏难、断层、跟不上），并说明如何应对。",
  ],
  ["长期连贯成长视角偏弱", "请补充长期成长或升学视角（如三五年路径、小升初/中考衔接）。"],
  [
    "可适度嵌入机构课程体系",
    "可结合核桃课程体系、分班或课纲，让规划更贴近实际产品。",
  ],
  ["包过/没问题", "请删除「包过」「没问题」等空洞保证，改用具体方案与边界说明。"],
  ["编程语言名称堆叠", "不要只堆 Python、C++ 等名称；请写清学习顺序与阶段目标。"],
  [
    "缺少阶段目标/分层细节",
    "学习规划得分受限：请写清分阶段目标，并补充项目、能力或学情等实质内容。",
  ],
  [
    "缺少学情/表现侧写或能力落地拆解",
    "学情或能力拆解偏弱，建议在表扬之外补充 1～2 处具体观察。",
  ],
  [
    "未同时满足「学习卡点",
    "要冲更高分：请同时写「学习卡点/难点预判」和「长期升学体系」。",
  ],
  [
    "未出现学情短板、薄弱点",
    "除表扬外，请写明 1～2 处短板或「不足之处」，否则学习规划分数会被压住。",
  ],
  ["未点名具体赛事或考级", "请点名具体赛事或考级（如 YCL、蓝桥、白名单赛事等）。"],
  ["未解释白名单/官方认定", "请说明赛事是否白名单、官方认定或主办背景，体现专业性。"],
  ["科技特长生/小升初/中招", "请把规划与科技特长生、小升初或中招等政策挂钩说明。"],
  ["缺少明确时间节点与节奏", "请写出备赛/考级的时间节点（如几个月、哪学期、寒暑假）。"],
  ["缺少同年级或同学情案例", "请举例同年级或情况相近学员的获奖、证书或备赛经历。"],
  ["缺少含金量对比与择赛建议", "请对比不同赛事含金量，并给出择赛或取舍建议。"],
  [
    "未结合学员所在省市",
    "请结合学员填写的省/市，解读本地科技特长生或升学政策语境。",
  ],
  [
    "未回应家长关于投入/认可度",
    "请回应家长对时间投入、赛事认可度、是否跟风参赛等顾虑。",
  ],
  [
    "本地政策/真实案例/含金量对比",
    "赛考得分受限：请同时加强「本地政策 + 学员案例 + 赛事含金量对比」三方面。",
  ],
  [
    "缺少时间节点或同学情案例",
    "赛考最高约 8 分：请补充时间节点，并写同年级/同学情案例。",
  ],
  [
    "缺少「以官方/当年简章为准」",
    "涉及升学、校情时请加「以官方/当年简章为准」等表述，避免过度承诺。",
  ],
  [
    "未同时做到本地政策精准解读",
    "赛考要冲更高分：请结合本地政策，并回应家长核心顾虑。",
  ],
  ["答疑篇幅过短", "答疑太短，请分点写清思路与可执行方案（建议每题不少于一两百字）。"],
  [
    "答疑偏短，建议分点",
    "答疑偏短，建议按「理解顾虑 → 方案 → 落地节奏 → 复盘」分点书写。",
  ],
  ["结构感弱", "请用「第一、第二…」或步骤列出可执行动作。"],
  ["共情与立场承接不足", "开头请先理解、承接家长顾虑，再给出建议。"],
  [
    "缺少可操作的节奏/跟踪/复盘",
    "请写出具体节奏（周/月）、跟踪方式或复盘安排。",
  ],
  [
    "缺少对「潜在追问」",
    "请预判家长可能追问的情景（如退费、换班、备赛压力），并提前回应。",
  ],
  ["答疑未回扣学员画像", "答疑中请点明本学员的年龄、年级或具体情况。"],
  ["空洞保证型短答", "避免「没问题」「放心」等短答；请给出分点、可核实的方案。"],
  [
    "无可执行方案或缺少清晰结构",
    "答疑得分受限：请分点书写，并给出可执行的跟踪或复盘方式。",
  ],
  [
    "缺少潜在顾虑预判或落地细节",
    "答疑要冲 9 分以上：请预判后续顾虑，并写清落地细节。",
  ],
  [
    "未同时满足：主动预判",
    "答疑要冲满分：需同时「预判追问」和「把顾虑转化为规划建议」。",
  ],
  [
    "【课程口径】",
    "逐字稿或答疑中有表述与公司课程/赛考标准不一致，请查看下方「课程表述」逐条修改。",
  ],
];

/** @param {{ id?: string; reason?: string; cap?: number }} cap */
export function humanizeCap(cap) {
  if (cap?.id && CAP_PLAIN[cap.id]) return CAP_PLAIN[cap.id];
  return humanizeIssue(cap?.reason || "");
}

/** @param {string} text */
export function humanizeIssue(text) {
  const raw = stripMd(text);
  if (!raw) return "";

  for (const [prefix, plain] of ISSUE_PLAIN) {
    if (raw.includes(prefix)) return plain;
  }

  let s = raw
    .replace(/^量规硬性限制：/u, "本项得分受限：")
    .replace(/^量规收紧：/u, "")
    .replace(/按量规[^，。]*/gu, "")
    .replace(/，上限会被量规压低。/u, "，会影响高分。")
    .replace(/，按量规[^，。]*/gu, "")
    .replace(/，高分档不予放行。/u, "，否则难以拿到高分。")
    .replace(/，优秀档[^，。]*/gu, "")
    .replace(/，良好档封顶 \d+。/u, "。")
    .replace(/，9\+ 档受限。/u, "。")
    .replace(/，10 分档关闭。/u, "。")
    .replace(/单项封顶 [\d.]+ 分。/u, "。")
    .replace(/封顶 [\d.]+；/u, "；")
    .replace(/封顶 [\d.]+。/u, "。")
    .replace(/；满分须写全可执行对策。/u, "。")
    .replace(/详见下方「课程知识一致性」清单。/u, "详见下方「课程表述」。")
    .replace(/详见清单。/u, "详见下方「课程表述」。");

  s = s.replace(/\s+/g, " ").trim();
  if (s.endsWith("；")) s = s.slice(0, -1) + "。";
  return s || raw;
}

/** @param {string} text */
export function humanizeStrength(text) {
  const s = stripMd(text)
    .replace(/，符合高分档硬要求。/u, "。")
    .replace(/有利于突破「纯模板」印象。/u, "。")
    .replace(/，按量规[^，。]*/gu, "");
  return s.trim() || stripMd(text);
}

/** @param {{ issues?: string[]; capReasons?: object[]; displayMissed?: { label: string }[] }} d @param {number} [max] */
export function pickPriorityIssues(d, max = 3) {
  /** @type {string[]} */
  const out = [];
  const seen = new Set();

  const add = (text) => {
    const h = humanizeIssue(text);
    if (!h || seen.has(h)) return;
    seen.add(h);
    out.push(h);
  };

  for (const i of d.issues || []) {
    if (String(i).includes("【课程口径】")) add(i);
  }
  for (const c of d.capReasons || []) add(humanizeCap(c));
  for (const m of d.displayMissed || []) add(m.label);
  for (const i of d.issues || []) add(i);

  return out.slice(0, max);
}

/** @param {{ strengths?: string[] }} d @param {number} [max] */
export function pickStrengths(d, max = 2) {
  const seen = new Set();
  /** @type {string[]} */
  const out = [];
  for (const s of d.strengths || []) {
    const h = humanizeStrength(s);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    out.push(h);
    if (out.length >= max) break;
  }
  return out;
}

/** @param {{ id: string; message: string; sources?: string[] }} finding */
export function humanizeCourseFinding(finding) {
  const msg = stripMd(finding.message || "").replace(/（检出位置：[^）]+）/u, "");
  const src = (finding.sources || []).join("、");
  const where = src ? `（出现在：${src}）` : "";
  return `${msg}${where}`.trim();
}

/**
 * @param {{ score: number }} L
 * @param {{ score: number }} C
 * @param {{ score: number }} Q
 * @param {number} total
 * @param {unknown[]} [courseFindings]
 */
export function buildTraineeSummary(L, C, Q, total, courseFindings) {
  const parts = [];
  parts.push(
    `本次总分 **${total} / 10**（学习 ${L.score}、赛考 ${C.score}、答疑 ${Q.score}，按 4:4:2 加权）。`
  );
  if (courseFindings && courseFindings.length > 0) {
    parts.push(
      `发现 **${courseFindings.length}** 处课程或赛考表述与标准不一致，已在下方列出，请对照培训材料修改。`
    );
  }
  if (total < 6) {
    parts.push("整体尚未达标，请优先按下方各维度的「建议先改」逐条修改，再重写逐字稿与答疑。");
  } else if (total < 8) {
    parts.push("已有基础，但离「能独立应对高要求家长」还有差距，请先补分数最低的那一项。");
  } else if (total < 8.75) {
    parts.push("已达到可交付家长的扎实水平；若要再冲高，请补全短板诊断、学习卡点与政策合规表述。");
  } else {
    parts.push("分项分数已较高；若系统仍提示缺项，请对照下方建议核对下一版稿是否已写全。");
  }
  return parts.join("\n");
}

/**
 * @param {object} res scoreAssessment 返回值
 */
export function buildTraineeFeedback(res) {
  const { detail, courseKnowledge, total, learning, competition, qna } = res;
  const findings = courseKnowledge?.findings || [];

  const dim = (key) => {
    const d = detail[key];
    return {
      priorityIssues: pickPriorityIssues(d, 3),
      strengths: pickStrengths(d, 2),
    };
  };

  return {
    summary: buildTraineeSummary(
      { score: learning },
      { score: competition },
      { score: qna },
      total,
      findings
    ),
    learning: dim("learning"),
    competition: dim("competition"),
    qna: dim("qna"),
    courseFindings: findings.map((f) => ({
      id: f.id,
      text: humanizeCourseFinding(f),
      sources: f.sources,
    })),
    declarationLabel: "您为学员申报的路径",
  };
}

/** @param {object} res */
export function ensureTraineeFeedback(res) {
  if (res.trainee) return res.trainee;
  return buildTraineeFeedback(res);
}
