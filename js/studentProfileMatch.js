/**
 * 学员画像字段匹配：姓名（全名/简称）、年龄、城市
 */

import { regionMentionedInText } from "./scoringShared.js";

/** @param {string} name */
export function nameAliases(name) {
  const full = String(name || "").trim();
  if (!full) return [];

  /** @type {string[]} */
  const out = [full];
  const given = full.length >= 2 ? full.slice(-2) : full;
  if (given !== full && given.length >= 1) out.push(given);

  const oralSuffixes = ["妈妈", "爸爸", "同学", "小朋友"];
  for (const g of [...out]) {
    if (g.length >= 1) {
      for (const suf of oralSuffixes) out.push(`${g}${suf}`);
    }
  }

  return [...new Set(out.filter((a) => a.length >= 1))];
}

/**
 * @param {string} text
 * @param {string} name
 */
export function nameMentionedInText(text, name) {
  const t = String(text || "");
  const aliases = nameAliases(name);
  if (!aliases.length) return false;
  return aliases.some((alias) => t.includes(alias));
}

/**
 * @param {string} text
 * @param {number} age
 */
export function ageMentionedInText(text, age) {
  const t = String(text || "");
  const n = Number(age);
  if (!Number.isFinite(n) || n < 3 || n > 18) return false;

  const ageStr = String(n);
  const withUnit = new RegExp(`(?<![0-9])${ageStr}(?:岁|周岁)(?![0-9])`, "u");
  if (withUnit.test(t)) return true;

  const thisYear = new RegExp(`今年\\s*${ageStr}\\s*(?:岁|周岁)?`, "u");
  if (thisYear.test(t)) return true;

  const ageContext = new RegExp(
    `(?:年龄|年纪|今年|目前|现在|已经).{0,6}(?<![0-9])${ageStr}(?:岁|周岁)?(?![0-9])`,
    "u"
  );
  if (ageContext.test(t)) return true;

  if (n < 10) {
    const standalone = new RegExp(`(?<![0-9])${ageStr}(?:岁|周岁)(?![0-9])`, "u");
    return standalone.test(t);
  }

  return false;
}

/**
 * @param {string} text
 * @param {{ province?: string; city?: string }} [student]
 */
export function profileRegionMentionedInText(text, student) {
  if (!student) return false;
  const province = String(student.province || "").trim();
  const city = String(student.city || "").trim();
  if (province && regionMentionedInText(text, province)) return true;
  if (city && regionMentionedInText(text, city)) return true;
  return false;
}

/**
 * @param {string} script
 * @param {string} combinedAnswers
 * @param {object} [student]
 */
export function evaluateProfileFields(script, combinedAnswers, student) {
  const s = String(script || "");
  const a = String(combinedAnswers || "");
  const stu = student || {};
  const name = String(stu.name || "").trim();

  const scriptName = nameMentionedInText(s, name);
  const scriptAge = ageMentionedInText(s, stu.age);
  const scriptCity = profileRegionMentionedInText(s, stu);
  const qnaName = nameMentionedInText(a, name);
  const qnaAge = ageMentionedInText(a, stu.age);

  /** @type {string[]} */
  const matchedNameAliases = [];
  if (name) {
    for (const alias of nameAliases(name)) {
      if (s.includes(alias) || a.includes(alias)) matchedNameAliases.push(alias);
    }
  }

  /** @type {string[]} */
  const matchedCityAliases = [];
  for (const region of [String(stu.province || "").trim(), String(stu.city || "").trim()]) {
    if (!region) continue;
    if (regionMentionedInText(s, region)) matchedCityAliases.push(region);
  }

  return {
    script: { name: scriptName, age: scriptAge, city: scriptCity },
    qna: { name: qnaName, age: qnaAge },
    matchedAliases: {
      name: [...new Set(matchedNameAliases)],
      city: [...new Set(matchedCityAliases)],
    },
  };
}
