/**
 * 评分共用工具（规则引擎）
 */

export function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function tierLabel(score) {
  if (score <= 2) return "不合格";
  if (score <= 5) return "一般";
  if (score <= 7) return "良好";
  if (score <= 9) return "优秀";
  return "卓越";
}

/** 下拉中的泛化占位，不做简称匹配 */
const GENERIC_REGION = /^(?:其他市\/区|其他区)$/u;

/** 省级后缀（长串优先） */
const PROVINCE_SUFFIXES = [
  "壮族自治区",
  "维吾尔自治区",
  "回族自治区",
  "自治区",
  "特别行政区",
  "省",
];

/** 地级 / 区县等后缀（长串优先；「新区」先于「区」） */
const LOCAL_SUFFIXES = ["市", "地区", "盟", "州", "新区", "区"];

/**
 * 生成可用于 includes 匹配的地名别名（完整名 + 口语简称）
 * @param {string} region
 * @returns {string[]}
 */
export function regionAliases(region) {
  const r = String(region || "").trim();
  if (!r || GENERIC_REGION.test(r)) return [];

  /** @type {string[]} */
  const out = [r];

  let base = r;
  for (const suf of PROVINCE_SUFFIXES) {
    if (base.endsWith(suf)) {
      base = base.slice(0, -suf.length);
      break;
    }
  }
  if (base !== r && base.length >= 2) out.push(base);

  if (base === r) {
    for (const suf of LOCAL_SUFFIXES) {
      if (base.endsWith(suf)) {
        const short = base.slice(0, -suf.length);
        if (short.length >= 2) out.push(short);
        break;
      }
    }
  }

  return [...new Set(out.filter((a) => a.length >= 2))];
}

/**
 * 稿内是否出现与学员声明一致的省/市/区（如「青岛市」↔「青岛」、「海淀区」↔「海淀」）
 * @param {string} text
 * @param {string} region
 */
export function regionMentionedInText(text, region) {
  const t = String(text || "");
  const aliases = regionAliases(region);
  if (!aliases.length) return false;
  return aliases.some((alias) => t.includes(alias));
}

/**
 * @param {string} script
 * @param {{ province?: string; city?: string }} [student]
 */
export function scriptBindsStudentRegion(script, student) {
  if (!student) return false;
  const province = String(student.province || "").trim();
  const city = String(student.city || "").trim();
  if (province && regionMentionedInText(script, province)) return true;
  if (city && regionMentionedInText(script, city)) return true;
  return false;
}

/**
 * @param {{ score: number }} L
 * @param {{ score: number }} C
 * @param {{ score: number }} Q
 * @param {number} total
 * @param {unknown[]} [courseFindings]
 */
export function buildSummary(L, C, Q, total, courseFindings) {
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

/**
 * @param {{ score: number; issues: string[] }} learning
 * @param {{ score: number; issues: string[] }} competition
 * @param {{ score: number; issues: string[] }} qna
 * @param {{ learning: number; competition: number; qna: number }} courseDeductions
 */
export function applyCourseDeductions(learning, competition, qna, courseDeductions) {
  const learnScore = round2(clamp(learning.score - courseDeductions.learning, 0, 10));
  const compScore = round2(clamp(competition.score - courseDeductions.competition, 0, 10));
  const qnaScore = round2(clamp(qna.score - courseDeductions.qna, 0, 10));

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

  return { learnScore, compScore, qnaScore };
}

export function computeWeightedTotal(learnScore, compScore, qnaScore) {
  return round2(learnScore * 0.4 + compScore * 0.4 + qnaScore * 0.2);
}
