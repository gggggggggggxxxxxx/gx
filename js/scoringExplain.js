/**
 * 各维度可解释性（与 scoring.js 量规一致）
 */

import { scriptHasOfficialExamRoadmap } from "./courseExamKnowledge.js";
import { runRubric, topMissedForDisplay } from "./rubricEngine.js";
import { clamp, scriptBindsStudentRegion, tierLabel } from "./scoringShared.js";

function countHits(text, patterns) {
  return patterns.reduce((acc, re) => acc + (re.test(text) ? 1 : 0), 0);
}

export function explainLearning(script, student) {
  const rePath =
    /阶段|路径|阶梯|分阶|路线图|规划|学期|学年|寒暑假|第[一二三四五六七八九十\d]+|思维阶段|算法阶段|启蒙|图形化|学完|下册/u;
  const reKnowledge =
    /知识点|模块|单元|语法|循环|变量|函数|算法|数据结构|面向对象|顺序|条件|坐标|负数|克隆|广播|流程图|随机数|正负数|输入输出|列表|字符串/u;
  const reProject =
    /项目|作品|实操|落地|课设|展示|答辩|科创|智能风扇|电子秤|小游戏|闯迷宫|飞机大战|打地鼠|计步器|红外警报|氛围灯|自动驾驶|智能门铃|密码锁|BMI|任务清单/u;
  const reAbility = /思维|逻辑|专注|创造力|解决问题|综合素养|竞争力|迁移|举一反三|编程思维/u;
  const reSituation =
    /学情|基础|短板|薄弱|优势|性格|习惯|课堂表现|吸收|认真|兴趣|进步|思路清晰|越来越/u;
  const reRiskPedagogy =
    /卡点|畏难|厌学|断层|踩坑|瓶颈|反复|跟不上|吃力|难点|风险点|若.*(落后|不足)|万一.*(掉|落)/u;
  const reSupportOnly = /辅导|训练营|冲刺|备赛|稳步|查漏补缺|尽力|付费/u;
  const reLong = /长期|体系|连贯|三年|五年|升学|成长曲线|小升初|中考|高考|强基|后续.*[Pp]ython|C\+\+|python/u;
  const reWalnut =
    /核桃|课程体系|课纲|教研|标准课|班上|教学实力|种子班|科特|科技特长生实验班|思维线|图形化计算思维|软编|硬件课|赛考课|赛考专项|Python初探|趣味C\+\+|常规C\+\+|信奥/u;
  const reTeachingGrain =
    /工信部|工信|教育与考试中心|电子教育学会|双章|通过率|主办|光华|基金会|部.*直属|中央/u;
  const reShortcoming = /短板|薄弱点|不足之处|待提升|哪里.*(不够|偏弱)|掌握不牢|基础不牢|诊断/u;
  const hollow = /没问题|放心好了|肯定能|包过|百分百|随便学学/u;

  const personalized =
    script.includes(String(student.age)) ||
    script.includes(student.grade || "") ||
    script.includes(student.name || "") ||
    /咱们家|这位同学|孩子目前|以他|以她|结合.*年级/u.test(script);

  const hasExplicitGoals = /目标|里程碑|成果|阶段目标|KPI|验收|达成|终极/u.test(script) && rePath.test(script);
  const hasPhaseTimeAnchor = rePath.test(script) && /个月|年左右|学完|下册|考级|YCL|一级|阶段/u.test(script);
  const hasLayer = hasExplicitGoals || hasPhaseTimeAnchor;
  const hasDepth = countHits(script, [reProject, reAbility, reSituation]) >= 2;
  const langEnum = (script.match(/Python|C\+\+|Scratch|图形化|JavaScript/gi) || []).length;

  const result = runRubric({
    base: 3.35,
    checks: [
      {
        id: "learn.path",
        label: "分阶段学习路径",
        delta: 1.05,
        failDelta: -1.5,
        test: () => rePath.test(script),
        passNote: "出现阶段化/路径化表述，具备基本学习规划骨架。",
        failNote: "缺少清晰的学习阶段或路径拆分，易被判定为「机械罗列」。",
      },
      {
        id: "learn.knowledge",
        label: "知识点/模块展开",
        delta: 0.65,
        failDelta: -1,
        test: () => reKnowledge.test(script),
        passNote: "对知识点或能力模块有一定展开，而非空泛口号。",
        failNote: "知识点与能力模块展开不足，建议点名具体技能树与训练方式。",
      },
      {
        id: "learn.project",
        label: "项目/作品落地",
        delta: 1.05,
        failDelta: -1.2,
        test: () => reProject.test(script),
        passNote: "提及项目/作品/实操落地，有利于突破「纯模板」印象。",
        failNote: "未体现项目作品与实操成果，按量规易被判为模板化规划。",
      },
      {
        id: "learn.ability",
        label: "思维/能力拆解",
        delta: 0.75,
        failDelta: -0.8,
        test: () => reAbility.test(script),
        passNote: "对思维品质或综合竞争力有描述。",
        failNote: "缺少对思维、专注力、科创竞争力等可感知能力的拆解。",
      },
      {
        id: "learn.personal",
        label: "绑定学员画像",
        delta: 0.95,
        failDelta: -1.5,
        test: () => personalized,
        passNote: "文本与学员年龄/年级/姓名有一定绑定，体现个性化沟通意识。",
        failNote: "几乎未绑定学员个体信息，个性化不足，上限会被量规压低。",
      },
      {
        id: "learn.situation",
        label: "学情侧写",
        delta: 1.05,
        failDelta: -1.2,
        test: () => reSituation.test(script),
        passNote: "包含学情或课堂/兴趣侧写。",
        failNote: "缺少学情或表现侧写：优秀档建议点名孩子当前状态与变化。",
      },
      {
        id: "learn.risk",
        label: "学习卡点预判",
        delta: 1.15,
        failDelta: -1.05,
        test: () => reRiskPedagogy.test(script),
        passNote: "对学习难点、卡点或畏难场景有预判，符合高分档硬要求。",
        failNote: "缺少学习卡点、畏难或断层类预判，高分档不予放行。",
      },
      {
        id: "learn.long_walnut",
        label: "长期体系+课程语境",
        delta: 0.72,
        failDelta: -0.5,
        test: () => reLong.test(script) && reWalnut.test(script),
        passNote: "兼顾长期体系与课程品牌语境。",
        failNote: "长期连贯成长视角或机构课程语境偏弱。",
      },
      {
        id: "learn.teaching_grain",
        label: "权威/数据颗粒度",
        delta: 0.38,
        failDelta: 0,
        test: () => reTeachingGrain.test(script),
        passNote: "出现主办/部委语境、通过率或权威认证等可验证颗粒度。",
      },
      {
        id: "learn.support_only",
        label: "辅导话术（不足替代卡点）",
        delta: 0.42,
        failDelta: 0,
        test: () => !reRiskPedagogy.test(script) && reSupportOnly.test(script),
        passNote: "有备赛、辅导或付费产品边界说明，但尚不足以替代「学习风险」预判。",
        failNote:
          "量规收紧：仅有辅导/训练营/冲刺等支持话术、未写清孩子可能的学习卡点或失败情景，不得按旧规则等同「风险预判」。",
      },
      {
        id: "learn.hollow",
        label: "无空洞承诺",
        delta: 0,
        failDelta: -2,
        test: () => !hollow.test(script),
        failNote: "检测到「包过/没问题」等空洞承诺型话术，严重伤害专业可信度。",
      },
      {
        id: "learn.lang_stack",
        label: "非机械罗列语言名",
        delta: 0,
        failDelta: -1.5,
        test: () => !(langEnum >= 3 && !rePath.test(script)),
        failNote: "编程语言名称堆叠但缺少学习路径，符合「机械罗列」特征。",
      },
    ],
    caps: [
      {
        id: "cap.layer_depth",
        max: 7,
        when: () => !hasLayer || !hasDepth,
        reason: "量规硬性限制：缺少阶段目标/分层细节或深度阐述，学习规划单项封顶 7 分。",
      },
      {
        id: "cap.no_shortcoming",
        max: 8.5,
        when: () => !reShortcoming.test(script),
        reason:
          "量规收紧：未出现学情短板、薄弱点或「不足之处」等显式诊断，即便表扬充分，学习规划封顶 8.5。",
      },
      {
        id: "cap.risk_long",
        max: 9.25,
        when: () => !reRiskPedagogy.test(script) || !reLong.test(script),
        reason:
          "未同时满足「学习卡点/难点类预判」+ 长期升学体系时，学习规划封顶 9.25；满分须写全可执行对策。",
      },
    ],
    adjustments: [
      {
        when: (s) => (!reSituation.test(script) || !reAbility.test(script)) && s > 8,
        apply: (s) => clamp(s - 1.5, 0, 8.5),
        note: "缺少学情/表现侧写或能力落地拆解，按量规从优秀档下压 1–2 分。",
      },
    ],
  });

  return {
    ...result,
    tier: tierLabel(result.score),
    displayMissed: topMissedForDisplay(result.missed, result.capReasons, 3),
  };
}

export function explainCompetition(script, student) {
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
  const reSchoolDetail = /招生|简章|特长生|市重点|省重点|降分|\d+人|5\+2|强基|保送/u;
  const reDataCred = /\d{2,}%|\d{3,}名|名学员|人获奖|晋级/u;

  const local = scriptBindsStudentRegion(script, student);

  const result = runRubric({
    base: 3.35,
    checks: [
      {
        id: "comp.event",
        label: "具体赛事/考级",
        delta: 1.05,
        failDelta: -2,
        test: () => reEvent.test(script),
        passNote: "出现具体赛事/考级/白名单语境，脱离「空泛参赛」。",
        failNote: "未点名具体赛事或考级通道，赛考规划极易被判不合格档。",
      },
      {
        id: "comp.white",
        label: "白名单/官方认定",
        delta: 0.58,
        failDelta: -0.6,
        test: () => reWhite.test(script),
        passNote: "提及白名单或官方公示语境，有利于建立信任。",
        failNote: "未解释白名单/官方认定，择赛专业性不足。",
      },
      {
        id: "comp.policy",
        label: "升学政策挂钩",
        delta: 0.95,
        failDelta: -1,
        test: () => rePolicy.test(script),
        passNote: "关联科技特长生或升学政策关键词。",
        failNote: "科技特长生/小升初/中招等政策挂钩偏弱。",
      },
      {
        id: "comp.timeline",
        label: "时间节点/节奏",
        delta: 0.85,
        failDelta: -1.2,
        test: () => reTime.test(script),
        passNote: "出现可感知的时间节点或节奏安排。",
        failNote: "缺少明确时间节点与节奏，优秀档会被下压。",
      },
      {
        id: "comp.case",
        label: "案例/获奖故事",
        delta: 0.95,
        failDelta: -1.2,
        test: () => reCase.test(script),
        passNote: "有案例/获奖/学员故事支撑，增强可信度。",
        failNote: "缺少同年级或同学情案例，按量规难以突破 8 分。",
      },
      {
        id: "comp.compare",
        label: "含金量对比/择赛",
        delta: 0.72,
        failDelta: -0.8,
        test: () => reCompare.test(script),
        passNote: "对赛事含金量或择赛策略有横向对比。",
        failNote: "缺少含金量对比与择赛建议，良好档封顶 7。",
      },
      {
        id: "comp.local",
        label: "本地省市语境",
        delta: 0.65,
        failDelta: -0.7,
        test: () => local,
        passNote: "文本显式绑定学员所在省份/城市，利于本地政策叙事。",
        failNote: "未结合学员所在省市解读本地语境，本地政策颗粒度不足。",
      },
      {
        id: "comp.worry",
        label: "回应家长顾虑",
        delta: 0.55,
        failDelta: -0.6,
        test: () => reWorry.test(script),
        passNote: "对投入、认可度、跟风等家长顾虑有回应迹象。",
        failNote: "未回应家长关于投入/认可度/跟风参赛等核心顾虑，10 分档关闭。",
      },
      {
        id: "comp.school_detail",
        label: "本地校情/简章级表述",
        delta: 0.28,
        failDelta: 0,
        test: () => local && reSchoolDetail.test(script),
        passNote: "出现本地校名/招生人数、分数线或简章条件级表述。",
      },
      {
        id: "comp.data_cred",
        label: "可复核数据",
        delta: 0.22,
        failDelta: 0,
        test: () => reDataCred.test(script),
        passNote: "含通过率、获奖规模等可复核数据。",
      },
      {
        id: "comp.roadmap",
        label: "赛考里程碑",
        delta: 0.42,
        failDelta: 0,
        test: () => scriptHasOfficialExamRoadmap(script),
        passNote:
          "出现课程体系口径的赛考里程碑（思维/科特 × 图形化或 Python + YCL 等级 +「N 个月」节点），节奏与预期管理更具体。",
      },
    ],
    caps: [
      {
        id: "cap.local_case_compare",
        max: 7,
        when: () => !local || !reCase.test(script) || !reCompare.test(script),
        reason: "量规硬性限制：本地政策/真实案例/含金量对比任一偏弱时，赛考规划封顶 7 分。",
      },
      {
        id: "cap.time_case",
        max: 8,
        when: () => !reTime.test(script) || !reCase.test(script),
        reason: "缺少时间节点或同学情案例，按量规赛考规划最高 8 分。",
      },
      {
        id: "cap.policy_compliance",
        max: 8.5,
        when: () => !rePolicyCompliance.test(script),
        reason:
          "量规收紧：赛考与升学、校情挂钩处缺少「以官方/当年简章为准」「政策动态核实」等合规表述，信息再具体也封顶 8.5，防止过度承诺。",
      },
      {
        id: "cap.local_worry",
        max: 9.25,
        when: () => !local || !reWorry.test(script),
        reason: "未同时做到本地政策精准解读 + 家长核心顾虑回应，赛考规划封顶 9.25。",
      },
    ],
  });

  return {
    ...result,
    tier: tierLabel(result.score),
    displayMissed: topMissedForDisplay(result.missed, result.capReasons, 3),
  };
}

export function explainQna(combinedAnswers, student) {
  const len = combinedAnswers.length;
  const reStructure = /第一|第二|第三|首先|其次|最后|步骤|建议|方案|具体|例如|比如|可以这样做/u;
  const reEmpathy = /理解|担心|顾虑|很正常|我们一起|您放心在|从经验/u;
  const rePlan = /节奏|调整|排期|课表|周|月|阶段性|复盘|跟踪|反馈/u;
  const reDeep = /潜在|后续|如果|万一|另一种|备案|底线|上限|最低|冲刺/u;
  const reConvert = /信任|长期|体系|课程|规划|更适合|不建议|理性|优先级/u;
  const bind =
    combinedAnswers.includes(student.grade || "") ||
    combinedAnswers.includes(student.name || "") ||
    combinedAnswers.includes(String(student.age)) ||
    /孩子|学员|同学/u.test(combinedAnswers);
  const hollowAns = /^[\s\S]{0,40}(没问题|放心|肯定|包过|可以的)[\s\S]{0,40}$/u;

  const result = runRubric({
    base: 4.5,
    checks: [
      {
        id: "qna.length_ok",
        label: "答疑篇幅充足",
        delta: 0.4,
        failDelta: 0,
        test: () => len >= 180,
        passNote: "答疑篇幅充足，有展开空间。",
        failNote: "答疑偏短，建议分点给出「认知—方案—落地—复盘」结构。",
      },
      {
        id: "qna.length_min",
        label: "答疑达到最低篇幅",
        delta: 0,
        failDelta: -2.5,
        test: () => len >= 80,
        failNote: "答疑篇幅过短，难以展现完整思路与可执行方案。",
      },
      {
        id: "qna.structure",
        label: "分点/步骤结构",
        delta: 1.2,
        failDelta: -1,
        test: () => reStructure.test(combinedAnswers),
        passNote: "使用分点或步骤化结构，逻辑可读性较好。",
        failNote: "结构感弱，建议用分点列出可执行动作。",
      },
      {
        id: "qna.empathy",
        label: "共情承接",
        delta: 0.7,
        failDelta: -0.5,
        test: () => reEmpathy.test(combinedAnswers),
        passNote: "具备共情与安抚话术，利于缓解家长焦虑。",
        failNote: "共情与立场承接不足，容易显得生硬。",
      },
      {
        id: "qna.action",
        label: "可执行节奏/跟踪",
        delta: 1,
        failDelta: -1,
        test: () => rePlan.test(combinedAnswers),
        passNote: "给出可操作的节奏或跟踪方式，接近优秀答疑。",
        failNote: "缺少可操作的节奏/跟踪/复盘机制，良好档封顶 7。",
      },
      {
        id: "qna.followup",
        label: "追问/分支预判",
        delta: 1.1,
        failDelta: -0.9,
        test: () => reDeep.test(combinedAnswers),
        passNote: "对后续追问或情境分支有预判。",
        failNote: "缺少对「潜在追问」或情境分支的预判，9+ 档受限。",
      },
      {
        id: "qna.personal",
        label: "回扣学员画像",
        delta: 0.8,
        failDelta: -0.8,
        test: () => bind,
        passNote: "答疑内容与学员个体信息有绑定。",
        failNote: "答疑未回扣学员画像，针对性一般。",
      },
      {
        id: "qna.hollow",
        label: "非空洞保证",
        delta: 0,
        failDelta: -2.5,
        test: () =>
          !(
            hollowAns.test(combinedAnswers) ||
            (/没问题|放心|包过/u.test(combinedAnswers) && len < 120)
          ),
        failNote: "空洞保证型短答，按量规属于不合格风险区。",
      },
    ],
    caps: [
      {
        id: "cap.plan_structure",
        max: 7,
        when: () => !rePlan.test(combinedAnswers) || !reStructure.test(combinedAnswers),
        reason: "量规硬性限制：无可执行方案或缺少清晰结构时，答疑封顶 7 分。",
      },
      {
        id: "cap.deep_length",
        max: 8.5,
        when: () => !reDeep.test(combinedAnswers) || len < 200,
        reason: "缺少潜在顾虑预判或落地细节，按量规无法给到 9 分以上。",
      },
      {
        id: "cap.convert",
        max: 9,
        when: () => !reDeep.test(combinedAnswers) || !reConvert.test(combinedAnswers),
        reason: "未同时满足：主动预判 + 顾虑转化/增值建议，答疑不予满分。",
      },
    ],
    adjustments: [
      {
        when: (s) => len >= 80 && len < 180,
        apply: (s) => s - 1,
        note: "答疑偏短，建议分点给出「认知—方案—落地—复盘」结构。",
      },
    ],
  });

  return {
    ...result,
    tier: tierLabel(result.score),
    displayMissed: topMissedForDisplay(result.missed, result.capReasons, 3),
  };
}

/** @param {object} dim  scoring.js 返回的分项 */
export function attachExplain(dim, explain) {
  const strengths = [...new Set([...(dim.strengths || []), ...(explain.strengths || [])])];
  const issues = [...new Set([...(dim.issues || []), ...(explain.issues || [])])];
  return {
    ...dim,
    strengths,
    issues,
    hits: explain.hits,
    missed: explain.missed,
    capReasons: explain.capReasons,
    displayMissed: explain.displayMissed,
  };
}
