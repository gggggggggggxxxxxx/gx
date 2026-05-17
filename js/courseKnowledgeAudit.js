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

/** 窗口内为 Python 赛考节奏（图形化稿衔接段；含 PYthon / PY学 等模板写法） */
function windowIsPythonYclExam(chunk) {
  return /(?:[Pp]ython|PYthon|PY\s*学)/u.test(chunk) && /YCL|ycl/u.test(chunk);
}

/** 窗口内为图形化/Scratch 赛考节奏（Python 主线稿回顾图形化时跳过） */
function windowIsScratchYclExam(chunk) {
  return /(?:图形化|Scratch)/u.test(chunk) && /YCL|ycl/u.test(chunk);
}

function matchNearScratchYcl(text, reA, reB, span = 200) {
  return matchNearBidirectional(text, reA, reB, span, { rejectWindow: windowIsPythonYclExam });
}

function matchNearPythonYcl(text, reA, reB, span = 200) {
  return matchNearBidirectional(text, reA, reB, span, { rejectWindow: windowIsScratchYclExam });
}

/** 分句：Python 升学衔接（含 YCL 或数月节奏） */
function snippetIsPythonForwardSection(s) {
  return /[Pp]ython/u.test(s) && (/YCL|ycl/u.test(s) || /(?:3|三|4|四)\s*个?月/u.test(s));
}

/** 分句：明确讲趣味/常规 C++ 班型课时（非「将来升 C++」类衔接） */
function snippetIsCppProductContext(s) {
  if (/将来|后续|可以升|规划路径|了解即可|先了解/u.test(s)) return false;
  return /趣味.{0,10}C\+\+|C\+\+.{0,10}趣味|常规.{0,14}C\+\+|C\+\+.{0,14}常规|信奥科特班/u.test(s);
}

/** 窗口内为科特图形化一年路线图：3 月一级 + 8 月二级并存 */
function windowIsKoteScratchYearRoadmap(chunk) {
  return (
    RE_MONTH_3.test(chunk) &&
    RE_YCL_LEVEL_1.test(chunk) &&
    /8\s*个?月|八\s*个月/u.test(chunk) &&
    RE_YCL_LEVEL_2.test(chunk)
  );
}

/** 窗口内为一级之后的递进节奏：再/又/同样…约三个月冲 YCL 二级（首张三月一级可在前段已述） */
function windowIsKoteScratchFollowOnL2(chunk) {
  if (
    !/(?:再|又|之后|然后|接着|随后|进一步|第二阶段|第二次|下一次|同样的|第二个阶段|二阶段|第二阶段)/u.test(
      chunk
    )
  )
    return false;
  if (!RE_MONTH_3.test(chunk)) return false;
  return RE_YCL_LEVEL_2.test(chunk) || /YCL\s*2|ycl\s*2|YCL2/u.test(chunk);
}

/** 「第3、四个月 / 第三，四个月」等阶段序号，不是「时长四个月」 */
function windowIsOrdinalMonthSpan(chunk) {
  return /第\s*[一二三四1-4１-４]\s*[,，、]?\s*(?:或者|或|和|至|到)?\s*第?\s*[三四4４]\s*个?\s*月|第\s*[三四4４]\s*[,，、]\s*四\s*个\s*月/u.test(
    chunk
  );
}

/** 第3或第4个月 + YCL 一级（允许弹性排期，不按「4个月+任意等级」误扣） */
function windowIsFlexibleMonth3or4WithLevel1(chunk) {
  return (
    /第\s*[三四3-4]\s*(?:或者|或)\s*第?\s*[三四4]\s*个?\s*月/u.test(chunk) &&
    RE_YCL_LEVEL_1.test(chunk)
  );
}

/**
 * 全文：该「三个月」锚点前已写过 3月+一级，且当前窗口为 3月+四级/五级 → Python 路线图（常见于答疑模板）
 * @param {string} fullText
 * @param {number} monthAt
 */
function windowIsPythonMilestoneAfterScratchL1(fullText, monthAt) {
  const after = fullText.slice(monthAt, Math.min(fullText.length, monthAt + 140));
  if (!RE_MONTH_3.test(after)) return false;
  if (!RE_YCL_LEVEL_4.test(after) && !RE_YCL_LEVEL_5.test(after)) return false;
  const before = fullText.slice(Math.max(0, monthAt - 900), monthAt);
  return RE_MONTH_3.test(before) && RE_YCL_LEVEL_1.test(before);
}

/** 全文为 Python 路线图（含 3 月四级），且前文未出现「3 月+一级」首张表述（常见于仅答 Python 的答疑） */
function windowIsPythonOnlyRoadmapText(fullText, monthAt) {
  const after = fullText.slice(monthAt, Math.min(fullText.length, monthAt + 120));
  if (!RE_MONTH_3.test(after) || !RE_YCL_LEVEL_4.test(after)) return false;
  if (!/(?:[Pp]ython|PYthon|python)/u.test(fullText)) return false;
  const before = fullText.slice(0, monthAt);
  const g = new RegExp(RE_MONTH_3.source, RE_MONTH_3.flags.replace(/y/g, "") + "g");
  let bm;
  while ((bm = g.exec(before)) !== null) {
    const c = before.slice(bm.index, Math.min(before.length, bm.index + 120));
    if (RE_YCL_LEVEL_1.test(c)) return false;
  }
  return true;
}

/** 三个月锚点附近最近的 YCL 等级为一级 → 不误报「3月×非一级」 */
function windowNearestYclIsLevel1(chunk, monthOffsetInChunk) {
  /** @type {{ pos: number; level: number }[]} */
  const hits = [];
  const levelPatterns = [
    [RE_YCL_LEVEL_1, 1],
    [RE_YCL_LEVEL_2, 2],
    [RE_YCL_LEVEL_3, 3],
    [RE_YCL_LEVEL_4, 4],
    [RE_YCL_LEVEL_5, 5],
    [RE_YCL_LEVEL_6, 6],
    [RE_YCL_LEVEL_7, 7],
    [RE_YCL_LEVEL_8, 8],
    [RE_YCL_LEVEL_9, 9],
    [RE_YCL_LEVEL_10_PLUS, 10],
  ];
  for (const [re, level] of levelPatterns) {
    const g = new RegExp(re.source, re.flags.replace(/y/g, "") + "g");
    let m;
    while ((m = g.exec(chunk)) !== null) {
      hits.push({ pos: m.index, level });
    }
  }
  if (!hits.length) return false;
  const nearest = hits.reduce((a, b) =>
    Math.abs(a.pos - monthOffsetInChunk) <= Math.abs(b.pos - monthOffsetInChunk) ? a : b
  );
  return nearest.level === 1;
}

/**
 * 科特·图形化：3 个月应对齐一级；仅当窗口内「三个月」与「非一级」绑定且未被豁免时命中
 */
function matchKoteScratchThreeMonthNotLevel1(text, span = 200) {
  const t = normalizeAuditText(text);
  const g = new RegExp(RE_MONTH_3.source, RE_MONTH_3.flags.replace(/y/g, "") + "g");
  let m;
  while ((m = g.exec(t)) !== null) {
    const lo = Math.max(0, m.index - span);
    const hi = Math.min(t.length, m.index + m[0].length + span);
    const chunk = t.slice(lo, hi);
    const monthInChunk = m.index - lo;
    if (windowIsPythonYclExam(chunk)) continue;
    if (windowIsKoteScratchYearRoadmap(chunk)) continue;
    if (windowIsKoteScratchFollowOnL2(chunk)) continue;
    if (windowIsPythonMilestoneAfterScratchL1(t, m.index)) continue;
    if (windowIsPythonOnlyRoadmapText(t, m.index)) continue;
    if (windowNearestYclIsLevel1(chunk, monthInChunk)) continue;
    if (new RegExp(RE_YCL_LEVEL_NOT_1.source, RE_YCL_LEVEL_NOT_1.flags.replace(/y/g, "")).test(chunk))
      return true;
  }
  return false;
}

/**
 * 科特·图形化：4 个月 + YCL；排除阶段序号、日历「4月份」等
 */
function matchKoteScratchFourMonthAnyYcl(text, span = 200) {
  const t = normalizeAuditText(text);
  return matchNearBidirectional(t, RE_MONTH_4, RE_YCL_ANY_LEVEL, span, {
    rejectWindow: (chunk) =>
      windowIsPythonYclExam(chunk) ||
      windowIsOrdinalMonthSpan(chunk) ||
      windowIsFlexibleMonth3or4WithLevel1(chunk),
  });
}

function snippetDeclaresKote(s) {
  return /科特|科技特长生/u.test(s);
}

function snippetDeclaresThink(s) {
  return /思维线|思维(?!科)/u.test(s);
}

/**
 * 句内无线路词、仅靠步骤 1 声明时：跳过 Python/C++ 衔接与纯对比句
 * @param {string} s
 * @param {object} [st]
 * @param {'kote'|'think'} line
 */
function declaredSnippetApplies(s, st, line) {
  const declared =
    line === "kote"
      ? declaredKoteScratch(st) || declaredKotePython(st)
      : declaredThinkScratch(st) || declaredThinkPython(st);
  const inScript =
    line === "kote"
      ? koteScratchContext(s) || kotePythonContext(s)
      : thinkScratchContext(s) || thinkPythonContext(s);
  if (inScript) return true;
  if (!declared) return false;
  if (snippetIsPythonForwardSection(s) || snippetIsCppProductContext(s)) return false;
  if (line === "kote" && snippetDeclaresThink(s) && !snippetDeclaresKote(s)) return false;
  if (line === "think" && snippetDeclaresKote(s) && !snippetDeclaresThink(s)) return false;
  return true;
}

/** 图形化阶段专用：声明科特·图形化时跳过 Python/C++ 衔接句 */
function declaredKoteScratchSnippetOnly(s, st) {
  if (/思维.{0,80}前\s*8\s*课时/u.test(s) && /科特.{0,80}前\s*10\s*课时/u.test(s)) return false;
  if (koteScratchContext(s)) return true;
  if (!declaredKoteScratch(st)) return false;
  if (snippetIsPythonForwardSection(s) || snippetIsCppProductContext(s)) return false;
  if (snippetDeclaresThink(s) && !snippetDeclaresKote(s)) return false;
  return true;
}

function declaredThinkScratchSnippetOnly(s, st) {
  if (thinkScratchContext(s)) return true;
  if (!declaredThinkScratch(st)) return false;
  if (snippetIsPythonForwardSection(s) || snippetIsCppProductContext(s)) return false;
  if (snippetDeclaresKote(s) && !snippetDeclaresThink(s)) return false;
  return true;
}

/** 步骤 1 线路+阶段：仅跑与主线一致的规则（旧存档「多线/多阶段」按科特·图形化过滤） */
function ruleAppliesToStudentDeclaration(rule, student) {
  if (rule.alwaysRun) return true;
  let trackLine = (student && student.trackLine) || "";
  let courseStage = (student && student.courseStage) || "";
  if (trackLine === "多线或未锁定") trackLine = "科特线";
  if (courseStage === "多阶段或未锁定") courseStage = "图形化";
  if (!trackLine || !courseStage) return true;
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
/** YCL 与等级数字之间允许「的」（如 YCL 的一级） */
const RE_YCL_LV_GAP = String.raw`\s*的?\s*`;

const RE_YCL_LEVEL_1 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[一1１]\\s*级|1\\s*级)|(?:YCL|ycl)一级|ycl\\s*1\\s*级|ycl1(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_2 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[二2２]\\s*级|2\\s*级)|(?:YCL|ycl)二级|ycl\\s*2\\s*级|ycl2(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_3 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[三3３]\\s*级|3\\s*级)|(?:YCL|ycl)三级|ycl\\s*3\\s*级|ycl3(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_4 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[四4４]\\s*级|4\\s*级)|(?:YCL|ycl)四级|ycl\\s*4\\s*级|ycl4(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_5 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[五5５]\\s*级|5\\s*级)|(?:YCL|ycl)五级|ycl\\s*5\\s*级|ycl5(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_6 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[六6６]\\s*级|6\\s*级)|(?:YCL|ycl)六级|ycl\\s*6\\s*级|ycl6(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_7 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[七7７]\\s*级|7\\s*级)|(?:YCL|ycl)七级|ycl\\s*7\\s*级|ycl7(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_8 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[八8８]\\s*级|8\\s*级)|(?:YCL|ycl)八级|ycl\\s*8\\s*级|ycl8(?:\\s*级)?`,
    "iu"
  );
const RE_YCL_LEVEL_9 =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:[九9９]\\s*级|9\\s*级)|(?:YCL|ycl)九级|ycl\\s*9\\s*级|ycl9(?:\\s*级)?`,
    "iu"
  );
/** 十级及以上中文，或两位及以上阿拉伯（如 YCL10级、ycl12，易为口误/虚构） */
const RE_YCL_LEVEL_10_PLUS =
  new RegExp(
    `(?:YCL|ycl)${RE_YCL_LV_GAP}(?:十\\s*级|10\\s*级)|(?:YCL|ycl)十级|ycl\\s*10\\s*级|ycl10(?:\\s*级)?|(?:YCL|ycl)${RE_YCL_LV_GAP}(?:1[1-9]|[2-9]\\d|\\d{3,})\\s*级|ycl(?:1[1-9]|[2-9]\\d|\\d{3,})(?:\\s*级)?`,
    "iu"
  );

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

/** 注意：`月左右?` 会错误解析成「月+左+右?」；`个` 不可省略，否则「明年4月份」等日历月会误当「四个月」。 */
const RE_MONTH_3 = /3\s*个\s*月(?:左右)?|约\s*3\s*个\s*月|三个月(?:左右)?/;
const RE_MONTH_4 = /4\s*个\s*月(?:左右)?|约\s*4\s*个\s*月|四个月(?:左右)?/;

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

/** 「半年」锚点为课程时长/已合规 2 张等，非「半年≥3张证」夸大 */
function certHalfYearAnchorBenign(chunkFromHalf) {
  if (/半年\s*的\s*课程|半年课程|半年的课程/u.test(chunkFromHalf.slice(0, 16))) return true;
  if (/半年[\s\S]{0,72}(?:两|2)\s*[张張][\s\S]{0,36}(?:国家级|证书)/u.test(chunkFromHalf)) return true;
  return false;
}

/**
 * 半年内声称 3 张及以上国家级证书；缩短窗口，避免与后文「一年四张」拼窗误报。
 */
function certHalfYearThreePlusNationalScan(t) {
  const reAnchor = /(?:学\s*)?半年|半\s*年/g;
  let m;
  while ((m = reAnchor.exec(t)) !== null) {
    const at = m.index;
    if (at + 2 < t.length && t[at + 2] === "前") continue;
    const chunk = t.slice(at, Math.min(t.length, at + 200));
    if (certHalfYearAnchorBenign(chunk)) continue;
    const fourM = chunk.match(/[四4]\s*[张張]/);
    if (fourM) {
      const fourAt = chunk.indexOf(fourM[0]);
      if (/一\s*年|整\s*一\s*年|年度|整个年/u.test(chunk.slice(0, fourAt))) continue;
    }
    if (RE_CERT_SHEETS_3_PLUS_IN_HALF_YEAR.test(chunk) && RE_NATIONAL_CERT_MENTION.test(chunk)) return true;
  }
  const reSheet = new RegExp(RE_CERT_SHEETS_3_PLUS_IN_HALF_YEAR.source, "gu");
  while ((m = reSheet.exec(t)) !== null) {
    const at = m.index;
    const lo = Math.max(0, at - 120);
    const before = t.slice(lo, at);
    const after = t.slice(at, Math.min(t.length, at + 120));
    const hasHalf = /(?:半年|半\s*年)/u.test(before) || /(?:半年|半\s*年)/u.test(after);
    if (!hasHalf) continue;
    const span = before + after;
    if (/一\s*年/u.test(span)) continue;
    if (/(?:半年|半\s*年)[\s\S]{0,90}(?:两|2)\s*[张張]/u.test(span)) continue;
    if (/[四4]\s*[张張]/u.test(span) && /(?:一\s*年|年度|整个年)/u.test(span)) {
      const fourAt = span.indexOf(span.match(/[四4]\s*[张張]/)?.[0] ?? "");
      const halfAt = span.search(/(?:半年|半\s*年)/u);
      if (fourAt >= 0 && halfAt >= 0) {
        const loIdx = Math.min(fourAt, halfAt);
        const hiIdx = Math.max(fourAt, halfAt);
        if (/一\s*年|年度|整个年/u.test(span.slice(loIdx, hiIdx))) continue;
      }
    }
    if (RE_NATIONAL_CERT_MENTION.test(t.slice(lo, Math.min(t.length, at + 160)))) return true;
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
      snippetAny(t, (s) => {
        if (!declaredThinkScratchSnippetOnly(s, st)) return false;
        if (!/60\s*课时/u.test(s)) return false;
        return !koteNear(t, /60\s*课时/u);
      }),
    penalty: { learning: 0.55, competition: 0.25, qna: 0.35 },
  },
  {
    id: "scratch-kote-48h",
    tracks: ["科特线"],
    stages: ["图形化"],
    message:
      "科特线图形化实验班总课时为 **60 课时**（非 48）。若指「软编 30」等分项，请避免让家长误解为整阶段仅 48 课时。",
    test: (t, st) =>
      snippetAny(t, (s) => {
        if (!declaredKoteScratchSnippetOnly(s, st)) return false;
        if (!/48\s*课时/u.test(s)) return false;
        return !thinkNear(t, /48\s*课时/u);
      }),
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
        if (!declaredThinkScratchSnippetOnly(s, st)) return false;
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
        if (!declaredKoteScratchSnippetOnly(s, st)) return false;
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
    test: (t) =>
      snippetAny(t, (s) => snippetIsCppProductContext(s) && /趣味/u.test(s) && /56\s*课时/u.test(s)),
    penalty: { learning: 0.5, competition: 0.2, qna: 0.3 },
  },
  {
    id: "regular-cpp-60",
    alwaysRun: true,
    message:
      "**常规 C++** 信奥科特班为 **56 课时**（48 实操 + 8 考前直播），不宜将整阶段写成 **60 课时**（与趣味 C++ 混淆）。",
    test: (t) =>
      snippetAny(t, (s) => {
        if (!snippetIsCppProductContext(s)) return false;
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
      (koteScratchContext(t) || declaredKoteScratch(st)) && matchKoteScratchFourMonthAnyYcl(t),
    penalty: { learning: 0.15, competition: 0.55, qna: 0.35 },
  },
  {
    id: "ycl-kote-scratch-3m-not-l1",
    tracks: ["科特线"],
    stages: ["图形化"],
    message:
      "**科特·图形化** 首张节奏为 **约 3 个月 YCL 一级**，不宜写成 **3 个月** 却对接 **非一级** 的任意等级（含二级～九级、十级、ycl8级 等）。若步骤 1 已选科特线+图形化，逐字稿未写「科特」字样时仍按此口径比对。",
    test: (t, st) =>
      (koteScratchContext(t) || declaredKoteScratch(st)) && matchKoteScratchThreeMonthNotLevel1(t),
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
      matchNearPythonYcl(t, RE_MONTH_3, RE_YCL_ANY_LEVEL, 200),
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
      matchNearPythonYcl(t, RE_MONTH_4, RE_YCL_LEVEL_NOT_4, 200),
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
      matchNearPythonYcl(t, RE_MONTH_4, RE_YCL_ANY_LEVEL, 200),
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
      matchNearPythonYcl(t, RE_MONTH_3, RE_YCL_LEVEL_NOT_4, 200),
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
      certHalfYearThreePlusNationalScan(t),
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
        if (!declaredThinkScratchSnippetOnly(s, st)) return false;
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
        if (!declaredKoteScratchSnippetOnly(s, st)) return false;
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
