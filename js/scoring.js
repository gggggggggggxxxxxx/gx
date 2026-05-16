/**
 * 编程规划智能考核 — 严苛量规引擎（规则 + 文本信号）
 * 三项各 0–10，总分 = 学习×0.4 + 赛考×0.4 + 答疑×0.2
 */

import { auditCourseKnowledge } from "./courseKnowledgeAudit.js";
import { scriptHasOfficialExamRoadmap } from "./courseExamKnowledge.js";

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function tierLabel(score) {
  if (score <= 2) return "不合格";
  if (score <= 5) return "一般";
  if (score <= 7) return "良好";
  if (score <= 9) return "优秀";
  return "卓越";
}

/** 命中数量 */
function countHits(text, patterns) {
  return patterns.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
}

/**
 * @param {object} input
 * @param {string} input.script
 * @param {object} input.student { name, age, grade, province, city }
 * @param {string[]} input.answers
 */
export function scoreAssessment(input) {
  const script = (input.script || "").trim();
  const student = input.student || {};
  const answers = (input.answers || []).map((a) => (a || "").trim());
  const combinedAnswers = answers.join("\n");

  const learning = scoreLearning(script, student);
  const competition = scoreCompetition(script, student);
  const qna = scoreQna(combinedAnswers, script, student);

  const courseAudit = auditCourseKnowledge(script, combinedAnswers, student);
  const { findings: courseKnowledgeFindings, totals: courseDeductions } = courseAudit;

  let learnScore = round2(clamp(learning.score - courseDeductions.learning, 0, 10));
  let compScore = round2(clamp(competition.score - courseDeductions.competition, 0, 10));
  let qnaScore = round2(clamp(qna.score - courseDeductions.qna, 0, 10));

  if (courseDeductions.learning > 0) {
    learning.issues.push(
      `【课程口径】与内置课程体系口径不一致，学习规划项已扣 **${courseDeductions.learning.toFixed(2)}** 分；详见下方「课程知识一致性」清单。`
    );
  }
  if (courseDeductions.competition > 0) {
    competition.issues.push(
      `【课程口径】赛考/课时等表述与口径摘要不一致，赛考规划项已扣 **${courseDeductions.competition.toFixed(2)}** 分；详见清单。`
    );
  }
  if (courseDeductions.qna > 0) {
    qna.issues.push(
      `【课程口径】答疑中出现与课程体系矛盾的信息，答疑项已扣 **${courseDeductions.qna.toFixed(2)}** 分；详见清单。`
    );
  }

  learning.score = learnScore;
  competition.score = compScore;
  qna.score = qnaScore;

  const total = round2(learnScore * 0.4 + compScore * 0.4 + qnaScore * 0.2);

  return {
    total,
    learning: learnScore,
    competition: compScore,
    qna: qnaScore,
    tierLearning: tierLabel(learnScore),
    tierCompetition: tierLabel(compScore),
    tierQna: tierLabel(qnaScore),
    summary: buildSummary(learning, competition, qna, total, courseKnowledgeFindings),
    courseKnowledge: {
      findings: courseKnowledgeFindings,
      deductions: courseDeductions,
    },
    declaration: {
      trackLine: student.trackLine || "",
      courseStage: student.courseStage || "",
    },
    detail: {
      learning: learning,
      competition: competition,
      qna: qna,
    },
  };
}

function buildSummary(L, C, Q, total, courseFindings) {
  const parts = [];
  parts.push(
    `综合判定：最终总分 **${total} / 10**（学习规划 ${L.score}×40% + 赛考规划 ${C.score}×40% + 答疑能力 ${Q.score}×20%）。量规已按「考试收紧档」校准：信息再完整，凡缺学情短板诊断、学习卡点预判或政策合规锚点，学习与赛考单项均不得虚高；与教研范文同档的逐字稿，常见落在约 8–8.5 分区间。`
  );
  if (courseFindings && courseFindings.length > 0) {
    parts.push(
      `**课程知识一致性**：检出 **${courseFindings.length}** 处与当前内置课程体系/赛考时间线明显不符的表述，已按项扣分并在结果页列出具体矛盾点，请按培训师提供的口径材料修订。`
    );
  }
  if (total < 6) {
    parts.push("整体仍处于「待达标」区间，建议对照分项修改建议重写逐字稿，并强化答疑中的可执行细节。");
  } else if (total < 8) {
    parts.push("具备基础表达与信息覆盖，但距离「可独立面对高要求家长」仍有明显差距，请优先补齐短板维度。");
  } else if (total < 8.75) {
    parts.push("达到「可交付家长」的扎实档，与常见高分范文接近；要突破 9 分，须显式写清短板诊断、卡点预案与政策免责口径。");
  } else {
    parts.push("分项已处高位；若未在稿中写明短板/卡点/以简章为准等硬要求，量规会自动封顶，请核对系统给出的风险提示是否已在下一轮稿中补齐。");
  }
  return parts.join("\n");
}

function scoreLearning(script, student) {
  const issues = [];
  const strengths = [];
  let score = 3.35;

  /** 路径：含分阶段、启蒙、月龄学时等 */
  const rePath =
    /阶段|路径|阶梯|分阶|路线图|规划|学期|学年|寒暑假|第[一二三四五六七八九十\d]+|思维阶段|算法阶段|启蒙|图形化|学完|下册/u;
  const reKnowledge =
    /知识点|模块|单元|语法|循环|变量|函数|算法|数据结构|面向对象|顺序|条件|坐标|负数|克隆|广播|流程图|随机数|正负数|输入输出|列表|字符串/u;
  const reProject =
    /项目|作品|实操|落地|课设|展示|答辩|科创|智能风扇|电子秤|小游戏|闯迷宫|飞机大战|打地鼠|计步器|红外警报|氛围灯|自动驾驶|智能门铃|密码锁|BMI|任务清单/u;
  const reAbility = /思维|逻辑|专注|创造力|解决问题|综合素养|竞争力|迁移|举一反三|编程思维/u;
  /** 学情侧写（表扬型）；高分还须 reShortcoming */
  const reSituation =
    /学情|基础|短板|薄弱|优势|性格|习惯|课堂表现|吸收|认真|兴趣|进步|思路清晰|越来越/u;
  /** 真实学习风险/卡点预判（与单纯「有辅导」区分） */
  const reRiskPedagogy =
    /卡点|畏难|厌学|断层|踩坑|瓶颈|反复|跟不上|吃力|难点|风险点|若.*(落后|不足)|万一.*(掉|落)/u;
  const reSupportOnly = /辅导|训练营|冲刺|备赛|稳步|查漏补缺|尽力|付费/u;
  const reLong = /长期|体系|连贯|三年|五年|升学|成长曲线|小升初|中考|高考|强基|后续.*[Pp]ython|C\+\+|python/u;
  const reWalnut =
    /核桃|课程体系|课纲|教研|标准课|班上|教学实力|种子班|科特|科技特长生实验班|思维线|图形化计算思维|软编|硬件课|赛考课|赛考专项|Python初探|趣味C\+\+|常规C\+\+|信奥/u;
  const reTeachingGrain =
    /工信部|工信|教育与考试中心|电子教育学会|双章|通过率|主办|光华|基金会|部.*直属|中央/u;
  /** 显式短板/不足诊断（考试档 8.5+ 硬条件） */
  const reShortcoming = /短板|薄弱点|不足之处|待提升|哪里.*(不够|偏弱)|掌握不牢|基础不牢|诊断/u;

  const personalized =
    script.includes(String(student.age)) ||
    script.includes(student.grade || "") ||
    script.includes(student.name || "") ||
    /咱们家|这位同学|孩子目前|以他|以她|结合.*年级/u.test(script);

  if (rePath.test(script)) {
    score += 1.05;
    strengths.push("出现阶段化/路径化表述，具备基本学习规划骨架。");
  } else {
    issues.push("缺少清晰的学习阶段或路径拆分，易被判定为「机械罗列」。");
    score -= 1.5;
  }

  if (reKnowledge.test(script)) {
    score += 0.65;
    strengths.push("对知识点或能力模块有一定展开，而非空泛口号。");
  } else {
    issues.push("知识点与能力模块展开不足，建议点名具体技能树与训练方式。");
    score -= 1;
  }

  if (reProject.test(script)) {
    score += 1.05;
    strengths.push("提及项目/作品/实操落地，有利于突破「纯模板」印象。");
  } else {
    issues.push("未体现项目作品与实操成果，按量规易被判为模板化规划。");
    score -= 1.2;
  }

  if (reAbility.test(script)) {
    score += 0.75;
    strengths.push("对思维品质或综合竞争力有描述。");
  } else {
    issues.push("缺少对思维、专注力、科创竞争力等可感知能力的拆解。");
    score -= 0.8;
  }

  if (personalized) {
    score += 0.95;
    strengths.push("文本与学员年龄/年级/姓名有一定绑定，体现个性化沟通意识。");
  } else {
    issues.push("几乎未绑定学员个体信息，个性化不足，上限会被量规压低。");
    score -= 1.5;
  }

  if (reSituation.test(script)) {
    score += 1.05;
    strengths.push("包含学情或课堂/兴趣侧写。");
  } else {
    issues.push("缺少学情或表现侧写：优秀档建议点名孩子当前状态与变化。");
    score -= 1.2;
  }

  if (reRiskPedagogy.test(script)) {
    score += 1.15;
    strengths.push("对学习难点、卡点或畏难场景有预判，符合高分档硬要求。");
  } else if (reSupportOnly.test(script)) {
    score += 0.42;
    strengths.push("有备赛、辅导或付费产品边界说明，但尚不足以替代「学习风险」预判。");
    issues.push("量规收紧：仅有辅导/训练营/冲刺等支持话术、未写清孩子可能的学习卡点或失败情景，不得按旧规则等同「风险预判」。");
  } else {
    issues.push("缺少学习卡点、畏难或断层类预判，高分档不予放行。");
    score -= 1.05;
  }

  if (reLong.test(script) && reWalnut.test(script)) {
    score += 0.72;
    strengths.push("兼顾长期体系与课程品牌语境。");
  } else {
    if (!reLong.test(script)) issues.push("长期连贯成长视角偏弱，卓越档需补全。");
    if (!reWalnut.test(script)) issues.push("可适度嵌入机构课程体系与分阶标准，增强专业闭环。");
    score -= 0.5;
  }

  if (reTeachingGrain.test(script)) {
    score += 0.38;
    strengths.push("出现主办/部委语境、通过率或权威认证等可验证颗粒度。");
  }

  // 模板化空洞短语惩罚
  const hollow = /没问题|放心好了|肯定能|包过|百分百|随便学学/u;
  if (hollow.test(script)) {
    issues.push("检测到「包过/没问题」等空洞承诺型话术，严重伤害专业可信度。");
    score -= 2;
  }

  // 机械罗列：大量枚举语言名但无路径
  const langEnum = (script.match(/Python|C\+\+|Scratch|图形化|JavaScript/gi) || []).length;
  if (langEnum >= 3 && !rePath.test(script)) {
    issues.push("编程语言名称堆叠但缺少学习路径，符合「机械罗列」特征。");
    score -= 1.5;
  }

  score = clamp(score, 0, 10);

  // 硬性封顶：无细节/分层/深度（「分层」兼容：显式目标 或 阶段+时间/考级锚点）
  const hasExplicitGoals = /目标|里程碑|成果|阶段目标|KPI|验收|达成|终极/u.test(script) && rePath.test(script);
  const hasPhaseTimeAnchor =
    rePath.test(script) &&
    /个月|年左右|学完|下册|考级|YCL|一级|阶段/u.test(script);
  const hasLayer = hasExplicitGoals || hasPhaseTimeAnchor;
  const hasDepth = countHits(script, [reProject, reAbility, reSituation]) >= 2;
  if (!hasLayer || !hasDepth) {
    const cap = 7;
    if (score > cap) {
      issues.push("量规硬性限制：缺少阶段目标/分层细节或深度阐述，学习规划单项封顶 7 分。");
      score = cap;
    }
  }

  if (!reSituation.test(script) || !reAbility.test(script)) {
    if (score > 8) {
      issues.push("缺少学情/表现侧写或能力落地拆解，按量规从优秀档下压 1–2 分。");
      score = clamp(score - 1.5, 0, 8.5);
    }
  }

  if (!reRiskPedagogy.test(script) || !reLong.test(script)) {
    if (score > 9.25) {
      issues.push("未同时满足「学习卡点/难点类预判」+ 长期升学体系时，学习规划封顶 9.25；满分须写全可执行对策。");
      score = Math.min(score, 9.25);
    }
  }

  // 考试收紧：无显式短板/不足诊断，学习规划不得超过 8.5（与教研高分范文同档常见）
  if (!reShortcoming.test(script)) {
    if (score > 8.5) {
      issues.push("量规收紧：未出现学情短板、薄弱点或「不足之处」等显式诊断，即便表扬充分，学习规划封顶 8.5。");
      score = Math.min(score, 8.5);
    }
  }

  score = round2(clamp(score, 0, 10));

  return {
    score,
    tier: tierLabel(score),
    strengths,
    issues,
  };
}

function scoreCompetition(script, student) {
  const issues = [];
  const strengths = [];
  let score = 3.35;

  /** 政策/升学承诺的合规锚点（防过度承诺；高分硬条件） */
  const rePolicyCompliance =
    /简章.{0,8}为准|官方.{0,8}为准|公示.{0,8}为准|最终以|核实|政策.{0,8}(调整|变化)|以.{0,6}当年.{0,8}简章|存在.{0,6}不确定|录取.{0,6}以/u;

  const reEvent =
    /YCL|YCL一级|YCL二级|YCL四级|YCL五级|图灵杯|蓝桥|青科赛|NOC|人工智能创新赛|信息素养|电子学会|GESP|等级考试|考级|CSP|NOIP|NOI|信奥|白名单|竞赛|赛事|国家级证书|赛考效率/u;
  const reWhite = /白名单|教育部|公示|认定/u;
  const rePolicy = /科技特长生|点招|自主招生|综评|综合素质|小升初|中招|强基|政策|招生简章|认定范围|科创班|实验班|简历|双减/u;
  const reTime =
    /\d{4}年|\d{2}年|\d{1,2}个月|\d{1,2}月|上学期|下学期|暑假|寒假|学期|季度|节点|时间线|倒计时|个月|左右|下册|届时|去年|近年/u;
  const reCase =
    /案例|学员|获奖|证书|省一|省二|市奖|铜奖|银奖|金奖|晋级|入围|往届|班上|名学员|国赛|一等奖/u;
  const reCompare = /含金量|对比|横向|优先级|择赛|取舍|性价比|适配|挑战性|难度较大|更难|更易|国家级/u;
  const reWorry = /投入|精力|备考|认可度|跟风|焦虑|风险|理性|付费|额外|摇号|简历|担心|压力|竞争|上万|别担|不用担/u;

  const local =
    (student.province && script.includes(student.province)) ||
    (student.city && script.includes(student.city));

  if (reEvent.test(script)) {
    score += 1.05;
    strengths.push("出现具体赛事/考级/白名单语境，脱离「空泛参赛」。");
  } else {
    issues.push("未点名具体赛事或考级通道，赛考规划极易被判不合格档。");
    score -= 2;
  }

  if (reWhite.test(script)) {
    score += 0.58;
    strengths.push("提及白名单或官方公示语境，有利于建立信任。");
  } else {
    issues.push("未解释白名单/官方认定，择赛专业性不足。");
    score -= 0.6;
  }

  if (rePolicy.test(script)) {
    score += 0.95;
    strengths.push("关联科技特长生或升学政策关键词。");
  } else {
    issues.push("科技特长生/小升初/中招等政策挂钩偏弱。");
    score -= 1;
  }

  if (reTime.test(script)) {
    score += 0.85;
    strengths.push("出现可感知的时间节点或节奏安排。");
  } else {
    issues.push("缺少明确时间节点与节奏，优秀档会被下压。");
    score -= 1.2;
  }

  if (reCase.test(script)) {
    score += 0.95;
    strengths.push("有案例/获奖/学员故事支撑，增强可信度。");
  } else {
    issues.push("缺少同年级或同学情案例，按量规难以突破 8 分。");
    score -= 1.2;
  }

  if (reCompare.test(script)) {
    score += 0.72;
    strengths.push("对赛事含金量或择赛策略有横向对比。");
  } else {
    issues.push("缺少含金量对比与择赛建议，良好档封顶 7。");
    score -= 0.8;
  }

  if (local) {
    score += 0.65;
    strengths.push("文本显式绑定学员所在省份/城市，利于本地政策叙事。");
  } else {
    issues.push("未结合学员所在省市解读本地语境，本地政策颗粒度不足。");
    score -= 0.7;
  }

  if (reWorry.test(script)) {
    score += 0.55;
    strengths.push("对投入、认可度、跟风等家长顾虑有回应迹象。");
  } else {
    issues.push("未回应家长关于投入/认可度/跟风参赛等核心顾虑，10 分档关闭。");
    score -= 0.6;
  }

  const reSchoolDetail = /招生|简章|特长生|市重点|省重点|降分|\d+人|5\+2|强基|保送/u;
  if (local && reSchoolDetail.test(script)) {
    score += 0.28;
    strengths.push("出现本地校名/招生人数、分数线或简章条件级表述。");
  }

  const reDataCred = /\d{2,}%|\d{3,}名|名学员|人获奖|晋级/u;
  if (reDataCred.test(script)) {
    score += 0.22;
    strengths.push("含通过率、获奖规模等可复核数据。");
  }

  if (scriptHasOfficialExamRoadmap(script)) {
    score += 0.42;
    strengths.push("出现课程体系口径的赛考里程碑（思维/科特 × 图形化或 Python + YCL 等级 +「N 个月」节点），节奏与预期管理更具体。");
  }

  score = clamp(score, 0, 10);

  // 良好封顶 7：缺本地政策、案例、含金量对比
  if (!local || !reCase.test(script) || !reCompare.test(script)) {
    if (score > 7) {
      issues.push("量规硬性限制：本地政策/真实案例/含金量对比任一偏弱时，赛考规划封顶 7 分。");
      score = 7;
    }
  }

  // 优秀硬性：无时间节点或案例 → 最高 8
  if (!reTime.test(script) || !reCase.test(script)) {
    if (score > 8) {
      issues.push("缺少时间节点或同学情案例，按量规赛考规划最高 8 分。");
      score = 8;
    }
  }

  // 考试收紧：升学/政策挂钩处未落「以官方简章为准」类合规锚点，赛考封顶 8.5（与教研范文同档常见）
  if (!rePolicyCompliance.test(script)) {
    if (score > 8.5) {
      issues.push(
        "量规收紧：赛考与升学、校情挂钩处缺少「以官方/当年简章为准」「政策动态核实」等合规表述，信息再具体也封顶 8.5，防止过度承诺。"
      );
      score = Math.min(score, 8.5);
    }
  }

  if (!local || !reWorry.test(script)) {
    if (score > 9.25) {
      issues.push("未同时做到本地政策精准解读 + 家长核心顾虑回应，赛考规划封顶 9.25。");
      score = Math.min(score, 9.25);
    }
  }

  score = round2(clamp(score, 0, 10));

  return {
    score,
    tier: tierLabel(score),
    strengths,
    issues,
  };
}

function scoreQna(combinedAnswers, script, student) {
  const issues = [];
  const strengths = [];
  let score = 4.5;

  const len = combinedAnswers.length;
  if (len < 80) {
    issues.push("答疑篇幅过短，难以展现完整思路与可执行方案。");
    score -= 2.5;
  } else if (len < 180) {
    issues.push("答疑偏短，建议分点给出「认知—方案—落地—复盘」结构。");
    score -= 1;
  } else {
    strengths.push("答疑篇幅充足，有展开空间。");
    score += 0.4;
  }

  const reStructure = /第一|第二|第三|首先|其次|最后|步骤|建议|方案|具体|例如|比如|可以这样做/u;
  if (reStructure.test(combinedAnswers)) {
    score += 1.2;
    strengths.push("使用分点或步骤化结构，逻辑可读性较好。");
  } else {
    issues.push("结构感弱，建议用分点列出可执行动作。");
    score -= 1;
  }

  const reEmpathy = /理解|担心|顾虑|很正常|我们一起|您放心在|从经验/u;
  if (reEmpathy.test(combinedAnswers)) {
    score += 0.7;
    strengths.push("具备共情与安抚话术，利于缓解家长焦虑。");
  } else {
    issues.push("共情与立场承接不足，容易显得生硬。");
    score -= 0.5;
  }

  const rePlan = /节奏|调整|排期|课表|周|月|阶段性|复盘|跟踪|反馈/u;
  if (rePlan.test(combinedAnswers)) {
    score += 1;
    strengths.push("给出可操作的节奏或跟踪方式，接近优秀答疑。");
  } else {
    issues.push("缺少可操作的节奏/跟踪/复盘机制，良好档封顶 7。");
    score -= 1;
  }

  const reDeep = /潜在|后续|如果|万一|另一种|备案|底线|上限|最低|冲刺/u;
  if (reDeep.test(combinedAnswers)) {
    score += 1.1;
    strengths.push("对后续追问或情境分支有预判。");
  } else {
    issues.push("缺少对「潜在追问」或情境分支的预判，9+ 档受限。");
    score -= 0.9;
  }

  const bind =
    combinedAnswers.includes(student.grade || "") ||
    combinedAnswers.includes(student.name || "") ||
    combinedAnswers.includes(String(student.age)) ||
    /孩子|学员|同学/u.test(combinedAnswers);
  if (bind) {
    score += 0.8;
    strengths.push("答疑内容与学员个体信息有绑定。");
  } else {
    issues.push("答疑未回扣学员画像，针对性一般。");
    score -= 0.8;
  }

  const hollowAns = /^[\s\S]{0,40}(没问题|放心|肯定|包过|可以的)[\s\S]{0,40}$/u;
  if (hollowAns.test(combinedAnswers) || /没问题|放心|包过/u.test(combinedAnswers) && len < 120) {
    issues.push("空洞保证型短答，按量规属于不合格风险区。");
    score -= 2.5;
  }

  score = clamp(score, 0, 10);

  // 良好封顶 7：方案不完整、无可操作性
  if (!rePlan.test(combinedAnswers) || !reStructure.test(combinedAnswers)) {
    if (score > 7) {
      issues.push("量规硬性限制：无可执行方案或缺少清晰结构时，答疑封顶 7 分。");
      score = 7;
    }
  }

  // 优秀：潜在顾虑 + 细节
  if (!reDeep.test(combinedAnswers) || len < 200) {
    if (score > 8.5) {
      issues.push("缺少潜在顾虑预判或落地细节，按量规无法给到 9 分以上。");
      score = 8.5;
    }
  }

  // 卓越：增值 + 转化
  const reConvert = /信任|长期|体系|课程|规划|更适合|不建议|理性|优先级/u;
  if (!reDeep.test(combinedAnswers) || !reConvert.test(combinedAnswers)) {
    if (score > 9.5) {
      issues.push("未同时满足：主动预判 + 顾虑转化/增值建议，答疑不予满分。");
      score = 9;
    }
  }

  score = round2(clamp(score, 0, 10));

  return {
    score,
    tier: tierLabel(score),
    strengths,
    issues,
  };
}
