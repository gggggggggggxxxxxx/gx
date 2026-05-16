/**
 * 赛考时间线 — 课程体系口径（与教研材料对齐，供规则页展示与量规引用）
 */

export const EXAM_TIMELINE_KNOWLEDGE = [
  {
    id: "scratch-thinking",
    title: "思维 · 图形化",
    items: [
      "半年具备考 1 张国家级证书水平：4 个月 YCL 一级。",
      "一年具备考 3 张国家级证书水平：4 个月 YCL 一级，9 个月 YCL 二级，12 个月白名单或其它国家级赛事证书。",
    ],
  },
  {
    id: "scratch-kote",
    title: "科特 · 图形化",
    items: [
      "半年具备考 2 张国家级证书水平：3 个月 YCL 一级，6 个月白名单或国家级赛事证书。",
      "一年具备考 4 张国家级证书水平：3 个月 YCL 一级，6 个月白名单或国家级赛事证书。8 个月 YCL 二级，12 个月第二张白名单或其它国家级赛事证书。",
    ],
  },
  {
    id: "python-thinking",
    title: "思维 · Python",
    items: [
      "半年具备考 1 张国家级证书水平：4 个月 YCL 四级。",
      "一年具备考 3 张国家级证书水平：4 个月 YCL 四级，10 个月 YCL 五级以及白名单或其它国家级赛事证书。",
    ],
  },
  {
    id: "python-kote",
    title: "科特 · Python",
    items: [
      "半年具备考 2 张国家级证书水平：3 个月 YCL 四级，6 个月白名单或其它国家级赛事。",
      "一年具备考 4 张国家级证书水平：3 个月 YCL 四级，6 个月第一张白名单或其它国家级赛事证书。9 个月 YCL 五级，12 个月第二张白名单或其它国家级赛事证书。",
    ],
  },
];

/**
 * 插入「评分规则」页中的赛考时间线 HTML（内容均为常量，无用户输入）
 */
export function buildRulesExamTimelineHtml() {
  const blocks = EXAM_TIMELINE_KNOWLEDGE.map(
    (b) =>
      `<section class="rules-exam-block"><h4>${b.title}</h4><ul>${b.items
        .map((line) => `<li>${line}</li>`)
        .join("")}</ul></section>`
  ).join("");
  return `<div class="rules-exam-timeline">${blocks}</div>`;
}

/** 量规：是否出现「思维/科特 + 图形化/Python」与 YCL 等级及「N个月」里程碑 */
export function scriptHasOfficialExamRoadmap(script) {
  const s = script || "";
  const reTrack =
    /思维.{0,16}图形化|图形化.{0,16}思维|科特.{0,16}图形化|图形化.{0,16}科特|思维.{0,16}[Pp]ython|[Pp]ython.{0,16}思维|科特.{0,16}[Pp]ython|[Pp]ython.{0,16}科特/u;
  const reYcl = /YCL\s*[一二三四五1-5]\s*级|YCL[一二三四五]级/u;
  const reMonths = /\d{1,2}\s*个月/u;
  return reTrack.test(s) && reYcl.test(s) && reMonths.test(s);
}
