/**
 * 课程体系与赛考口径一致性审计（逐字稿 + 答疑）
 * 命中「与当前教研口径明显矛盾」的表述时生成扣分项；宁少勿滥，避免误伤对比性话术。
 */

/**
 * @typedef {{ id: string; message: string; learning: number; competition: number; qna: number }} CourseAuditPenalty
 * @typedef {{ id: string; sources: ('逐字稿'|'答疑')[]; message: string; penalty: CourseAuditPenalty }} CourseAuditFinding
 */

const MAX_DIM = 1.35;

/**
 * @param {string} script
 * @param {string} combinedAnswers
 * @param {object} [student] 含 trackLine、courseStage 时仅对声明的线路/阶段运行对应口径规则
 * @returns {{ findings: CourseAuditFinding[]; totals: { learning: number; competition: number; qna: number } }}
 */
export function auditCourseKnowledge(script, combinedAnswers, student) {
  const s = normalizeAuditText((script || "").trim());
  const a = normalizeAuditText((combinedAnswers || "").trim());
  const buckets = { script: s, answers: a };
  const stu = normalizeStudentChoice(student);

  /** @type {Map<string, CourseAuditFinding>} */
  const byId = new Map();

  for (const rule of RULES) {
    if (!ruleAppliesToStudentDeclaration(rule, stu)) continue;
    const sources = [];
    if (rule.test(buckets.script, stu)) sources.push("逐字稿");
    if (rule.test(buckets.answers, stu)) sources.push("答疑");
    if (sources.length === 0) continue;

    const existing = byId.get(rule.id);
    if (existing) {
      for (const src of sources) {
        if (!existing.sources.includes(src)) existing.sources.push(src);
      }
    } else {
      byId.set(rule.id, {
        id: rule.id,
        sources: [...sources],
        message: rule.message,
        penalty: { ...rule.penalty },
      });
    }
  }

  const findings = Array.from(byId.values()).map((f) => {
    const p = adjustPenaltyBySource(f.penalty, f.sources);
    return {
      id: f.id,
      sources: [...f.sources],
      message: `${f.message}（检出位置：${f.sources.join("、")}）`,
      penalty: p,
    };
  });

  const totals = { learning: 0, competition: 0, qna: 0 };
  for (const f of findings) {
    totals.learning += f.penalty.learning;
    totals.competition += f.penalty.competition;
    totals.qna += f.penalty.qna;
  }
  totals.learning = Math.min(totals.learning, MAX_DIM);
  totals.competition = Math.min(totals.competition, MAX_DIM);
  totals.qna = Math.min(totals.qna, MAX_DIM);

  return { findings, totals };
}

/**
 * 仅逐字稿：不扣答疑；仅答疑：减轻学习项扣罚（口径问题主要体现在书面答疑时）。
 * @param {CourseAuditPenalty} penalty
 * @param {('逐字稿'|'答疑')[]} sources
 */
function adjustPenaltyBySource(penalty, sources) {
  const hasS = sources.includes("逐字稿");
  const hasA = sources.includes("答疑");
  const p = { ...penalty };
  if (hasS && !hasA) p.qna = 0;
  if (hasA && !hasS) p.learning = Math.min(p.learning, 0.25);
  return p;
}

function normalizeAuditText(s) {
  try {
    return String(s).normalize("NFKC");
  } catch {
    return String(s);
  }
}

/** 下拉值去空格、NFKC，避免不可见字符导致声明与规则不匹配 */
function normalizeStudentChoice(student) {
  if (!student || typeof student !== "object") return student;
  return {
    ...student,
    trackLine: normalizeAuditText(String(student.trackLine || "").trim()),
    courseStage: normalizeAuditText(String(student.courseStage || "").trim()),
  };
}

/**
 * 在全文内判断 reA 与 reB 是否出现在同一「窗口」内（解决按句号拆句后，「4 个月」与「ycl1」被拆到两句而漏检）。
 * 窗口为 **锚点前后各 span 字**（共约 2×span），避免「4 张」在「半年」之前时仅向前切片导致漏检。
 */
/**
 * @param {string} text
 * @param {RegExp} reA
 * @param {RegExp} reB
 * @param {number} [span]
 * @param {{ rejectWindow?: (chunk: string) => boolean }} [opts]
 */
function matchNearBidirectional(text, reA, reB, span = 180, opts = {}) {
  const t = normalizeAuditText(text);
  const rejectWindow = opts.rejectWindow;
  const hasA = new RegExp(reA.source, reA.flags.replace(/y/g, "")).test(t);
  const hasB = new RegExp(reB.source, reB.flags.replace(/y/g, "")).test(t);
  if (!hasA || !hasB) return false;

  const walk = (primary, secondary) => {
    const g = new RegExp(primary.source, primary.flags.replace(/y/g, "") + "g");
    let m;
    while ((m = g.exec(t)) !== null) {
      const lo = Math.max(0, m.index - span);
      const hi = Math.min(t.length, m.index + span);
      const chunk = t.slice(lo, hi);
      if (rejectWindow && rejectWindow(chunk)) continue;
      if (new RegExp(secondary.source, secondary.flags.replace(/y/g, "")).test(chunk)) return true;
    }
    return false;
  };

  return walk(reA, reB) || walk(reB, reA);
}

/** 窗口内为 Python 赛考节奏（避免图形化「3 个月×等级」规则误伤「Python…三个月后 YCL 四级」等） */
function windowIsPythonYclExam(chunk) {
  return /[Pp]ython/u.test(chunk) && /YCL|ycl/u.test(chunk);
}

function matchNearScratchYcl(text, reA, reB, span = 200) {
  return matchNearBidirectional(text, reA, reB, span, { rejectWindow: windowIsPythonYclExam });
}

/**
 * 学员在步骤 1 选择的线路 + 阶段：与规则上的 tracks/stages 一致时才跑该条校验（多线/多阶段则全开）。
 * @param {{ alwaysRun?: boolean; tracks?: string[]; stages?: string[] }} rule
 * @param {{ trackLine?: string; courseStage?: string }} [student]
 */
function ruleAppliesToStudentDeclaration(rule, student) {
  if (rule.alwaysRun) return true;
  const trackLine = (student && student.trackLine) || "";
  const courseStage = (student && student.courseStage) || "";
  if (!trackLine || !courseStage) return true;
  if (trackLine === "多线或未锁定" || courseStage === "多阶段或未锁定") return true;
  const tracks = rule.tracks;
  const stages = rule.stages;
  if (!tracks || !stages || !tracks.length || !stages.length) return true;
  return tracks.includes(trackLine) && stages.includes(courseStage);
}

/** 步骤 1 所选线路/阶段：逐字稿未写「思维/科特」等词时也视为本稿语境 */
function declaredThinkScratch(st) {
  return st?.trackLine === "思维线" && st?.courseStage === "图形化";
}
function declaredKoteScratch(st) {
  return st?.trackLine === "科特线" && st?.courseStage === "图形化";
}
function declaredThinkPython(st) {
  return st?.trackLine === "思维线" && st?.courseStage === "Python";
}
function declaredKotePython(st) {
  return st?.trackLine === "科特线" && st?.courseStage === "Python";
}

/**
 * YCL 等级常见写法（含 ycl1级、YCL3级、六级～九级、十级/两位阿拉伯数字如 ycl12；须带 YCL/ycl 或 ycl 连写数字，避免误伤「3 个月」等无关表述）。
 */
const RE_YCL_LEVEL_1 =
  /(?:YCL|ycl)\s*(?:[一1１]\s*级|1\s*级)|(?:YCL|ycl)一级|ycl\s*1\s*级|ycl1(?:\s*级)?/iu;
const RE_YCL_LEVEL_2 =
  /(?:YCL|ycl)\s*(?:[二2２]\s*级|2\s*级)|(?:YCL|ycl)二级|ycl\s*2\s*级|ycl2(?:\s*级)?/iu;
const RE_YCL_LEVEL_3 =
  /(?:YCL|ycl)\s*(?:[三3３]\s*级|3\s*级)|(?:YCL|ycl)三级|ycl\s*3\s*级|ycl3(?:\s*级)?/iu;
const RE_YCL_LEVEL_4 =
  /(?:YCL|ycl)\s*(?:[四4４]\s*级|4\s*级)|(?:YCL|ycl)四级|ycl\s*4\s*级|ycl4(?:\s*级)?/iu;
const RE_YCL_LEVEL_5 =
  /(?:YCL|ycl)\s*(?:[五5５]\s*级|5\s*级)|(?:YCL|ycl)五级|ycl\s*5\s*级|ycl5(?:\s*级)?/iu;
const RE_YCL_LEVEL_6 =
  /(?:YCL|ycl)\s*(?:[六6６]\s*级|6\s*级)|(?:YCL|ycl)六级|ycl\s*6\s*级|ycl6(?:\s*级)?/iu;
const RE_YCL_LEVEL_7 =
  /(?:YCL|ycl)\s*(?:[七7７]\s*级|7\s*级)|(?:YCL|ycl)七级|ycl\s*7\s*级|ycl7(?:\s*级)?/iu;
const RE_YCL_LEVEL_8 =
  /(?:YCL|ycl)\s*(?:[八8８]\s*级|8\s*级)|(?:YCL|ycl)八级|ycl\s*8\s*级|ycl8(?:\s*级)?/iu;
const RE_YCL_LEVEL_9 =
  /(?:YCL|ycl)\s*(?:[九9９]\s*级|9\s*级)|(?:YCL|ycl)九级|ycl\s*9\s*级|ycl9(?:\s*级)?/iu;
/** 十级及以上中文，或两位及以上阿拉伯（如 YCL10级、ycl12，易为口误/虚构） */
const RE_YCL_LEVEL_10_PLUS =
  /(?:YCL|ycl)\s*(?:十\s*级|10\s*级)|(?:YCL|ycl)十级|ycl\s*10\s*级|ycl10(?:\s*级)?|(?:YCL|ycl)\s*(?:1[1-9]|[2-9]\d|\d{3,})\s*级|ycl(?:1[1-9]|[2-9]\d|\d{3,})(?:\s*级)?/iu;

const RE_YCL_LEVELS_1_TO_9 = [
  RE_YCL_LEVEL_1,
  RE_YCL_LEVEL_2,
  RE_YCL_LEVEL_3,
  RE_YCL_LEVEL_4,
  RE_YCL_LEVEL_5,
  RE_YCL_LEVEL_6,
  RE_YCL_LEVEL_7,
  RE_YCL_LEVEL_8,
  RE_YCL_LEVEL_9,
];

/** 任一等级的 YCL 目标表述（用于「月份与赛考节奏」类误配） */
const RE_YCL_ANY_LEVEL = new RegExp(
  [...RE_YCL_LEVELS_1_TO_9, RE_YCL_LEVEL_10_PLUS].map((r) => `(?:${r.source})`).join("|"),
  "iu"
);
/** 非一级（思维·图形化约 4 个月应对齐一级） */
const RE_YCL_LEVEL_NOT_1 = new RegExp(
  [RE_YCL_LEVEL_2, RE_YCL_LEVEL_3, RE_YCL_LEVEL_4, RE_YCL_LEVEL_5, RE_YCL_LEVEL_6, RE_YCL_LEVEL_7, RE_YCL_LEVEL_8, RE_YCL_LEVEL_9, RE_YCL_LEVEL_10_PLUS]
    .map((r) => `(?:${r.source})`)
    .join("|"),
  "iu"
);
/** 非四级（思维·Python 约 4 个月应对齐四级） */
const RE_YCL_LEVEL_NOT_4 = new RegExp(
  [RE_YCL_LEVEL_1, RE_YCL_LEVEL_2, RE_YCL_LEVEL_3, RE_YCL_LEVEL_5, RE_YCL_LEVEL_6, RE_YCL_LEVEL_7, RE_YCL_LEVEL_8, RE_YCL_LEVEL_9, RE_YCL_LEVEL_10_PLUS]
    .map((r) => `(?:${r.source})`)
    .join("|"),
  "iu"
);

/** 注意：`月左右?` 会错误解析成「月+左+右?」，无法匹配「3个月」「4个月」；须写作 `月(?:左右)?`。 */
const RE_MONTH_3 = /3\s*个?月(?:左右)?|约\s*3\s*个?月|三个月(?:左右)?/;
const RE_MONTH_4 = /4\s*个?月(?:左右)?|约\s*4\s*个?月|四个月(?:左右)?/;

/** 与「张」国家级赛考承诺连用的时长词 */
const RE_ANNUAL = /(?:学\s*)?一\s*年|一\s*年\s*左右|满\s*一\s*年|整\s*一\s*年|1\s*年/u;
const RE_HALF_YEAR_CERT =
  /半\s*年\s*左右?|半年\s*左右?|半\s*年|半年|(?:学|读|上|学习)\s*半\s*年/u;
/** 与「张数」承诺相关的国家级 / 国赛语境（含「国家级证书水平」等省略「证书」的写法） */
const RE_NATIONAL_CERT_MENTION =
  /国家级|国家级别|国字头|国赛.{0,8}(?:证|奖|牌)|白名单.{0,10}(?:证|赛)|电子学会.{0,8}(?:证|考级)/u;
/** 声称 **5 张及以上 / 八张 / 十张** 等（任一产品线一年最多 4 张国家级节奏） */
const RE_CERT_SHEETS_OVER_4_IN_YEAR =
  /(?:[5-9]\s*[张張])|(?:[1-9]\d{1,3}\s*[张張])|(?:[五六七八九]\s*[张張])|(?:十\s*[张張]|十几\s*[张張]|十多\s*[张張])/u;
/** 声称 **3 张及以上**（文档半年国家级节奏最多约 2 张；含 **4 张、四张** 等；含繁体 **張**） */
const RE_CERT_SHEETS_3_PLUS_IN_HALF_YEAR =
  /(?:[3-9]\s*[张張])|(?:[1-9]\d{1,3}\s*[张張])|(?:[三四五六七八九]\s*[张張])|(?:十\s*[张張]|十几\s*[张張]|十多\s*[张張])/u;

function certOverclaimNegation(t) {
  return /不是|并非|误区|勿夸大|别夸大|不要夸大|澄清|纠正|别信.{0,8}(?:[三四五六七八九十]|[3-9]|10)\s*[张張]/u.test(
    t
  );
}

/**
 * 长稿中「半年」多次出现（如「半年前」）时，matchNear 可能先锚到无关「半年」导致漏检。
 * 对每个「半年/半 年」锚点向前跳过「…前半年」中的前字，再向右取片段校验张数+国家级。
 */
function certHalfYearThreePlusNationalScan(t) {
  const reAnchor = /半年|半\s*年/g;
  let m;
  while ((m = reAnchor.exec(t)) !== null) {
    const at = m.index;
    /** 跳过「半年前」等：「半年」后紧跟「前」 */
    if (at + 2 < t.length && t[at + 2] === "前") continue;
    const chunk = t.slice(at, Math.min(t.length, at + 480));
    if (RE_CERT_SHEETS_3_PLUS_IN_HALF_YEAR.test(chunk) && RE_NATIONAL_CERT_MENTION.test(chunk)) return true;
  }
  const reSheet = new RegExp(RE_CERT_SHEETS_3_PLUS_IN_HALF_YEAR.source, "gu");
  while ((m = reSheet.exec(t)) !== null) {
    const at = m.index;
    const lo = Math.max(0, at - 420);
    const chunk = t.slice(lo, Math.min(t.length, at + 40));
    if (/(?:半年|半\s*年)/u.test(chunk) && RE_NATIONAL_CERT_MENTION.test(t.slice(lo, Math.min(t.length, at + 160))))
      return true;
  }
  return false;
}

/** @type {{ id: string; message: string; test: (t: string, st?: object) => boolean; penalty: CourseAuditPenalty; alwaysRun?: boolean; tracks?: string[]; stages?: string[] }[]} */
const RULES = [
  {
    id: "scratch-think-60h",
    tracks: ["思维线"],
    stages: ["图形化"],
    message:
      "思维线图形化种子班总课时为 **48 课时**（非 60）。将思维线写成 60 课时易与 **科特线图形化 60 课时** 混淆，请对照内置口径或培训材料。",
    test: (t, st) =>
      (thinkScratchContext(t) || declaredThinkScratch(st)) &&
      /60\s*课时/u.test(t) &&
      !koteNear(t, /60\s*课时/u),
    penalty: { learning: 0.55, competition: 0.25, qna: 0.35 },
  },
  {
    id: "scratch-kote-48h",
    tracks: ["科特线"],
    stages: ["图形化"],
    message:
      "科特线图形化实验班总课时为 **60 课时**（非 48）。若指「软编 30」等分项，请避免让家长误解为整阶段仅 48 课时。",
    test: (t, st) =>
      (koteScratchContext(t) || declaredKoteScratch(st)) &&
      /48\s*课时/u.test(t) &&
      !thinkNear(t, /48\s*课时/u),
    penalty: { learning: 0.55, competition: 0.25, qna: 0.35 },
  },
  {
    id: "py-think-60h",
    tracks: ["思维线"],
    stages: ["Python"],
    message:
      "思维线 Python 种子班总课时为 **48 课时**。写成 60 课时易与 **科特 Python 60 课时** 混淆。",
    test: (t, st) =>
      (thinkPythonContext(t) || declaredThinkPython(st)) &&
      /60\s*课时/u.test(t) &&
      !koteNear(t, /60\s*课时/u),
    penalty: { learning: 0.55, competition: 0.25, qna: 0.35 },
  },
  {
    id: "py-kote-total-48",
    tracks: ["科特线"],
    stages: ["Python"],
    message:
      "科特线 Python 阶段总课时为 **60 课时**（含赛考专项等）。不宜表述为整阶段「共 48 课时」。",
    test: (t, st) =>
      (kotePythonContext(t) || declaredKotePython(st)) &&
      /(?:一共|总共|共|整)\s*48\s*课时|48\s*课时\s*(?:的|一)阶段|阶段[^。]{0,20}48\s*课时/u.test(t),
    penalty: { learning: 0.55, competition: 0.2, qna: 0.35 },
  },
  {
    id: "refund-scratch-think-p10",
    tracks: ["思维线"],
    stages: ["图形化"],
    message:
      "思维线 **图形化** 全额退课时费节点为 **前 8 课时（第 9 课时解锁前）**，不宜写成前 10 / 第 11。",
    test: (t, st) =>
      snippetAny(t, (s) => {
        if (!thinkScratchContext(s) && !declaredThinkScratch(st)) return false;
        if (/不是.{0,10}前10|实际.{0,12}前8|应该.{0,10}前8|误区/u.test(s)) return false;
        return /前10\s*课时|第11/u.test(s) && /全额|全退|退费/u.test(s);
      }),
    penalty: { learning: 0.45, competition: 0.15, qna: 0.45 },
  },
  {
    id: "refund-scratch-kote-p8",
    tracks: ["科特线"],
    stages: ["图形化"],
    message:
      "科特线 **图形化** 全额退课时费节点为 **前 10 课时（第 11 课时解锁前）**，不宜写成前 8 / 第 9。",
    test: (t, st) =>
      snippetAny(t, (s) => {
        if (!koteScratchContext(s) && !declaredKoteScratch(st)) return false;
        return /前8\s*课时|第9\s*课|九\s*课\s*时\s*解锁/u.test(s) && /全额|全退|退费/u.test(s);
      }),
    penalty: { learning: 0.45, competition: 0.15, qna: 0.45 },
  },
  {
    id: "refund-python-p10",
    alwaysRun: true,
    message:
      "**Python 路线**（思维线或科特线）全额退课时费节点均为 **前 8 课时、第 9 课时解锁前**；前 10 / 第 11 仅适用于 **科特·图形化**，请勿套用到 Python。",
    test: (t) =>
      snippetAny(t, (s) => {
        if (!/[Pp]ython/u.test(s)) return false;
        if (!/前10\s*课时|第11/u.test(s) || !/全额|全退|退费/u.test(s)) return false;
        if (/不是|并非|误区|不要|别搞错|澄清|纠正/u.test(s)) return false;
        return true;
      }),
    penalty: { learning: 0.45, competition: 0.15, qna: 0.45 },
  },
  {
    id: "fun-cpp-56",
    alwaysRun: true,
    message:
      "**趣味 C++** 信奥科特班总课时为 **60 课时**（含实操、硬件、赛考），不宜写成 56 课时（56 为常规 C++ 实操+直播结构口径）。",
    test: (t) => /趣味.{0,8}C\+\+|C\+\+.{0,8}趣味/u.test(t) && /56\s*课时/u.test(t),
    penalty: { learning: 0.5, competition: 0.2, qna: 0.3 },
  },
  {
    id: "regular-cpp-60",
    alwaysRun: true,
    message:
      "**常规 C++** 信奥科特班为 **56 课时**（48 实操 + 8 考前直播），不宜将整阶段写成 **60 课时**（与趣味 C++ 混淆）。",
    test: (t) =>
      snippetAny(t, (s) => {
        if (!/常规.{0,12}C\+\+|C\+\+.{0,12}常规/u.test(s)) return false;
        if (/趣味/u.test(s)) return false;
        return /60\s*课时/u.test(s);
      }),
    penalty: { learning: 0.5, competition: 0.2, qna: 0.3 },
  },
  {
    id: "ycl-think-scratch-3m",
    tracks: ["思维线"],
    stages: ["图形化"],
    message:
      "**思维·图形化** 半年赛考里程碑为 **约 4 个月 YCL 一级**，不应把节奏写成 **3 个月** 却对接 **任意 YCL 等级**（含六级、七级、八级、十级、ycl12 等）。易与科特图形化「约 3 个月一级」混淆。若步骤 1 已选思维线+图形化，逐字稿未写「思维」字样时仍按此口径比对。",
    test: (t, st) =>
      (thinkScratchContext(t) || declaredThinkScratch(st)) &&
      matchNearScratchYcl(t, RE_MONTH_3, RE_YCL_ANY_LEVEL, 200),
    penalty: { learning: 0.2, competition: 0.6, qna: 0.35 },
  },
  {
    id: "ycl-think-scratch-4m-l2",
    tracks: ["思维线"],
    stages: ["图形化"],
    message:
      "**思维·图形化** 约 **4 个月** 应对齐 **YCL 一级**，不应在同一节奏里写成 **非一级** 的任意等级（含二级～九级、十级、ycl6、YCL11级 等）。若步骤 1 已选思维线+图形化，逐字稿未写「思维」字样时仍按此口径比对。",
    test: (t, st) =>
      (thinkScratchContext(t) || declaredThinkScratch(st)) &&
      matchNearScratchYcl(t, RE_MONTH_4, RE_YCL_LEVEL_NOT_1, 200),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "ycl-kote-scratch-4m-l1",
    tracks: ["科特线"],
    stages: ["图形化"],
    message:
      "**科特·图形化** 首张节奏为 **约 3 个月 YCL 一级**，不宜写成 **4 个月** 却对接 **任意 YCL 等级**（含 ycl1级、YCL6级、七级、ycl12 等）。若步骤 1 已选科特线+图形化，逐字稿未写「科特」字样时仍按此口径比对。",
    test: (t, st) =>
      (koteScratchContext(t) || declaredKoteScratch(st)) &&
      matchNearScratchYcl(t, RE_MONTH_4, RE_YCL_ANY_LEVEL, 200),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "ycl-kote-scratch-3m-not-l1",
    tracks: ["科特线"],
    stages: ["图形化"],
    message:
      "**科特·图形化** 首张节奏为 **约 3 个月 YCL 一级**，不宜写成 **3 个月** 却对接 **非一级** 的任意等级（含二级～九级、十级、ycl8级 等）。若步骤 1 已选科特线+图形化，逐字稿未写「科特」字样时仍按此口径比对。",
    test: (t, st) =>
      (koteScratchContext(t) || declaredKoteScratch(st)) &&
      matchNearScratchYcl(t, RE_MONTH_3, RE_YCL_LEVEL_NOT_1, 200),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "ycl-think-py-3m4",
    tracks: ["思维线"],
    stages: ["Python"],
    message:
      "**思维·Python** 半年里程碑为 **约 4 个月 YCL 四级**，不应把节奏写成 **3 个月** 却对接 **任意 YCL 等级**（含六级、七级、ycl10 等）。易与科特 Python「约 3 个月四级」混淆。若步骤 1 已选思维线+Python，逐字稿未写「思维」字样时仍按此口径比对。",
    test: (t, st) =>
      (thinkPythonContext(t) || declaredThinkPython(st)) &&
      matchNearBidirectional(t, RE_MONTH_3, RE_YCL_ANY_LEVEL, 200),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "ycl-think-py-4m-l5",
    tracks: ["思维线"],
    stages: ["Python"],
    message:
      "**思维·Python** 约 **4 个月** 应对齐 **YCL 四级**，不应在同一节奏里写成 **非四级** 的任意等级（含一级～三级、五级～十级、ycl6、YCL12级 等）。若步骤 1 已选思维线+Python，逐字稿未写「思维」字样时仍按此口径比对。",
    test: (t, st) =>
      (thinkPythonContext(t) || declaredThinkPython(st)) &&
      matchNearBidirectional(t, RE_MONTH_4, RE_YCL_LEVEL_NOT_4, 200),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "ycl-kote-py-4m-l4",
    tracks: ["科特线"],
    stages: ["Python"],
    message:
      "**科特·Python** 首张节奏为 **约 3 个月 YCL 四级**，不宜写成 **4 个月** 却对接 **任意 YCL 等级**（含一至十级、ycl11 等）。若步骤 1 已选科特线+Python，逐字稿未写「科特」字样时仍按此口径比对。",
    test: (t, st) =>
      (kotePythonContext(t) || declaredKotePython(st)) &&
      matchNearBidirectional(t, RE_MONTH_4, RE_YCL_ANY_LEVEL, 200),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "ycl-kote-py-3m-not-l4",
    tracks: ["科特线"],
    stages: ["Python"],
    message:
      "**科特·Python** 首张节奏为 **约 3 个月 YCL 四级**，不宜写成 **3 个月** 却对接 **非四级** 的任意等级（含一级～三级、五级～十级、ycl7级 等）。若步骤 1 已选科特线+Python，逐字稿未写「科特」字样时仍按此口径比对。",
    test: (t, st) =>
      (kotePythonContext(t) || declaredKotePython(st)) &&
      matchNearBidirectional(t, RE_MONTH_3, RE_YCL_LEVEL_NOT_4, 200),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "cert-annual-national-over4",
    alwaysRun: true,
    message:
      "内置文档口径：**思维线**约 **3 张/年**、**科特线**约 **4 张/年** 国家级证书赛考节奏。声称 **学一年** 即具备 **5 张及以上**（含 **八张**、十张、12 张等）**国家级证书**水平，明显超出任一正式产品线，易严重误导家长。",
    test: (t) =>
      !certOverclaimNegation(t) &&
      RE_NATIONAL_CERT_MENTION.test(t) &&
      matchNearBidirectional(t, RE_ANNUAL, RE_CERT_SHEETS_OVER_4_IN_YEAR, 240),
    penalty: { learning: 0.35, competition: 0.45, qna: 0.32 },
  },
  {
    id: "cert-halfyear-national-over2",
    alwaysRun: true,
    message:
      "内置文档口径：**半年** 国家级证书节奏最多约 **2 张**（科特图形化/Python 等；思维线约 **1 张/半年**）。声称 **半年** 即具备 **3 张、4 张及以上**（含「四张」「八张」等）国家级/国赛相关证书水平，明显夸大。",
    test: (t) =>
      !certOverclaimNegation(t) &&
      RE_NATIONAL_CERT_MENTION.test(t) &&
      (matchNearBidirectional(t, RE_HALF_YEAR_CERT, RE_CERT_SHEETS_3_PLUS_IN_HALF_YEAR, 320) ||
        certHalfYearThreePlusNationalScan(t)),
    penalty: { learning: 0.32, competition: 0.42, qna: 0.3 },
  },
  {
    id: "cert-think-year-4-national",
    tracks: ["思维线"],
    stages: ["图形化", "Python"],
    message:
      "**思维线**（图形化或 Python）文档口径为 **一年约 3 张** 国家级证书水平；写 **一年 4 张** 易与 **科特线一年约 4 张** 混淆，请按步骤 1 所选线路区分表述。",
    test: (t, st) => {
      if (certOverclaimNegation(t)) return false;
      if (!RE_NATIONAL_CERT_MENTION.test(t)) return false;
      const declaredThinkAny =
        st?.trackLine === "思维线" &&
        (st?.courseStage === "图形化" || st?.courseStage === "Python");
      if (!(thinkScratchContext(t) || thinkPythonContext(t) || declaredThinkAny)) return false;
      return matchNearBidirectional(t, RE_ANNUAL, /4\s*[张張]|四\s*[张張]/u, 220);
    },
    penalty: { learning: 0.25, competition: 0.4, qna: 0.28 },
  },
  {
    id: "cert-think-scratch-half-2",
    tracks: ["思维线"],
    stages: ["图形化"],
    message:
      "**思维·图形化** 文档口径为半年约 **1 张** 国家级证书水平；写 **半年 2 张** 易与科特线混淆。",
    test: (t, st) =>
      snippetAny(t, (s) => {
        if (!thinkScratchContext(s) && !declaredThinkScratch(st)) return false;
        if (/科特/u.test(s)) return false;
        return /半\s*年.{0,30}2\s*张|半年[^。]{0,40}两\s*张/u.test(s) && /国家级|证书/u.test(s);
      }),
    penalty: { learning: 0.25, competition: 0.45, qna: 0.3 },
  },
  {
    id: "cert-kote-scratch-half-1",
    tracks: ["科特线"],
    stages: ["图形化"],
    message:
      "**科特·图形化** 文档口径为半年约 **2 张** 国家级证书水平；若写 **半年仅 1 张** 则与科特节奏不符。",
    test: (t, st) =>
      snippetAny(t, (s) => {
        if (!koteScratchContext(s) && !declaredKoteScratch(st)) return false;
        return (
          /半\s*年[^。]{0,40}1\s*张|半年[^。]{0,40}一\s*张/u.test(s) && /国家级|证书/u.test(s)
        );
      }),
    penalty: { learning: 0.25, competition: 0.45, qna: 0.3 },
  },
];

/** 按句号/分号/换行拆句后，任一句满足 pred 即命中（降低跨句对比误报） */
function snippetAny(text, pred) {
  const parts = text.split(/[。;；\n]+/);
  for (const p of parts) {
    const s = p.trim();
    if (s.length < 10) continue;
    if (pred(s)) return true;
  }
  return pred(text.trim());
}

function thinkScratchContext(t) {
  if (/思维线.{0,30}(?:图形化|Scratch)|(?:图形化|Scratch).{0,30}思维线/u.test(t)) return true;
  const m1 = t.match(/思维(?!科)([\s\S]{0,50})(?:图形化|Scratch|图形化种子)/u);
  if (m1 && !/科特|科技特长生实验班/u.test(m1[1])) return true;
  const m2 = t.match(/(?:图形化|Scratch|图形化种子)([\s\S]{0,50})思维(?!科)/u);
  if (m2 && !/科特|科技特长生实验班/u.test(m2[1])) return true;
  return false;
}

function koteScratchContext(t) {
  return (
    /科特.{0,20}(?:图形化|Scratch)|(?:图形化|Scratch).{0,20}科特|科技特长生实验班.{0,30}(?:图形化|Scratch)/u.test(
      t
    ) || /科特线.{0,15}图形化/u.test(t)
  );
}

function thinkPythonContext(t) {
  if (/思维线.{0,30}[Pp]ython|[Pp]ython.{0,30}思维线|Python种子/u.test(t)) return true;
  const m1 = t.match(/思维(?!科)([\s\S]{0,50})[Pp]ython/u);
  if (m1 && !/科特|科技特长生实验班/u.test(m1[1])) return true;
  const m2 = t.match(/[Pp]ython([\s\S]{0,50})思维(?!科)/u);
  if (m2 && !/科特|科技特长生实验班/u.test(m2[1])) return true;
  return false;
}

function kotePythonContext(t) {
  return (
    /科特.{0,25}[Pp]ython|[Pp]ython.{0,25}科特|科技特长生实验班.{0,30}[Pp]ython/u.test(t) || /科特线.{0,15}[Pp]ython/u.test(
      t
    )
  );
}

/**
 * 若「60课时」附近已有科特表述，视为可能在对比两线，不触发思维线 60 课时误报
 */
function koteNear(t, reHit) {
  const idx = t.search(reHit);
  if (idx < 0) return false;
  const win = t.slice(Math.max(0, idx - 100), Math.min(t.length, idx + 100));
  return /科特|科技特长生实验班/u.test(win);
}

function thinkNear(t, reHit) {
  const idx = t.search(reHit);
  if (idx < 0) return false;
  const win = t.slice(Math.max(0, idx - 100), Math.min(t.length, idx + 100));
  return /思维线|思维(?!科)|种子班/u.test(win);
}
