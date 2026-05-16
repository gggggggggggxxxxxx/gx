/**
 * 课程体系口径审计回归测试（修改 courseKnowledgeAudit.js 后务必在项目根执行 npm test）
 * 配套：tests/rules-and-answers.test.js（课时/退费/C++/证书/答疑）、tests/scoring-smoke.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditCourseKnowledge } from "../js/courseKnowledgeAudit.js";

function ids(script, answers = "", student) {
  return auditCourseKnowledge(script, answers, student).findings.map((f) => f.id);
}

function assertIncludes(actual, expectedId, msg) {
  assert.ok(actual.includes(expectedId), `${msg}: expected ${expectedId}, got [${actual.join(", ")}]`);
}

function assertExcludes(actual, forbiddenId, msg) {
  assert.ok(!actual.includes(forbiddenId), `${msg}: should not include ${forbiddenId}, got [${actual.join(", ")}]`);
}

describe("auditCourseKnowledge — YCL 月份×等级", () => {
  const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
  const thinkScratch = { trackLine: "思维线", courseStage: "图形化" };
  const thinkPy = { trackLine: "思维线", courseStage: "Python" };
  const kotePy = { trackLine: "科特线", courseStage: "Python" };

  it("科特·图形化：4个月与 ycl1 分句仍检出（窗口匹配）", () => {
    const script = "第一阶段大概需要4个月左右。后面我们会带孩子去考ycl1级。";
    assertIncludes(ids(script, "", koteScratch), "ycl-kote-scratch-4m-l1", "kote 4m+L1");
  });

  it("科特·图形化：4个月+阿拉伯月数+ycl1", () => {
    const script = "科特线图形化4个月考ycl1级。";
    assertIncludes(ids(script, "", koteScratch), "ycl-kote-scratch-4m-l1", "kote 4个月");
  });

  it("思维·图形化：4个月+非一级等级（含三级）", () => {
    const script = "思维线图形化4个月考YCL3级。";
    assertIncludes(ids(script, "", thinkScratch), "ycl-think-scratch-4m-l2", "think 4m not L1");
  });

  it("思维·图形化：4个月+一级不误报「非一级」", () => {
    const script = "思维线图形化4个月ycl1级。";
    assertExcludes(ids(script, "", thinkScratch), "ycl-think-scratch-4m-l2", "think 4m+L1 OK");
  });

  it("思维·图形化：3个月+任意 YCL 等级", () => {
    const script = "思维线图形化3个月ycl5级。";
    assertIncludes(ids(script, "", thinkScratch), "ycl-think-scratch-3m", "think 3m any level");
  });

  it("科特·图形化：3个月+非一级", () => {
    const script = "科特线图形化3个月ycl2级。";
    assertIncludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "kote 3m not L1");
  });

  it("科特·图形化：3个月+一级不误报", () => {
    const script = "科特线图形化3个月ycl1级。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "kote 3m+L1 OK");
  });

  it("思维·Python：4个月+六级等非四级", () => {
    const script = "思维线Python四个月冲YCL六级。";
    assertIncludes(ids(script, "", thinkPy), "ycl-think-py-4m-l5", "think py 4m not L4");
  });

  it("思维·Python：4个月+四级不误报", () => {
    const script = "思维线Python4个月ycl4级。";
    const found = ids(script, "", thinkPy);
    assertExcludes(found, "ycl-think-py-4m-l5", "think py 4m+L4 OK");
  });

  it("科特·Python：4个月+任意等级", () => {
    const script = "科特线Python4个月ycl4级。";
    assertIncludes(ids(script, "", kotePy), "ycl-kote-py-4m-l4", "kote py 4m");
  });

  it("科特·Python：3个月+非四级", () => {
    const script = "科特线Python3个月ycl2级。";
    assertIncludes(ids(script, "", kotePy), "ycl-kote-py-3m-not-l4", "kote py 3m not L4");
  });
});

describe("auditCourseKnowledge — 国家级证书张数", () => {
  it("一年+8张+国家级（明显夸大）", () => {
    const script = "学一年具备考8张国家级证书的水平。";
    assertIncludes(ids(script, "", null), "cert-annual-national-over4", "year 8 certs");
  });

  it("半年+4张+国家级（超过文档上限）", () => {
    const script = "学半年具备考4张国家级证书水平。";
    assertIncludes(ids(script, "", null), "cert-halfyear-national-over2", "half year 4 certs");
  });

  it("「学半年就能具备考4张…」用户原句", () => {
    const script = "学半年就能具备考4张国家级证书的水平。";
    assertIncludes(ids(script, "", null), "cert-halfyear-national-over2", "user phrase 半年4张");
  });

  it("长稿先出现「半年前」再出现学半年4张仍检出", () => {
    const tail = "学半年就能具备考4张国家级证书的水平。";
    const pad = "。我们做好家校沟通，夯实基础，循序渐进。".repeat(80);
    const script = "半年前开过家长会，当时还没上编程课。" + pad + tail;
    assertIncludes(ids(script, "", null), "cert-halfyear-national-over2", "long script half year");
  });

  it("繁体「張」与简体等价检出", () => {
    const script = "学半年就能具备考4張国家级证书的水平。";
    assertIncludes(ids(script, "", null), "cert-halfyear-national-over2", "traditional 張");
  });

  it("语序反转：张数在前、半年在后仍检出", () => {
    const script = "具备考4张国家级证书水平，学习半年就能达到。";
    assertIncludes(ids(script, "", null), "cert-halfyear-national-over2", "reversed order");
  });

  it("纠错语境不命中年度夸大", () => {
    const script = "不是学一年八张国家级证书，那是误区。";
    assertExcludes(ids(script, "", null), "cert-annual-national-over4", "negation year");
  });

  it("思维线：一年4张与科特混淆", () => {
    const st = { trackLine: "思维线", courseStage: "图形化" };
    const script = "思维线图形化学一年可以考4张国家级证书。";
    assertIncludes(ids(script, "", st), "cert-think-year-4-national", "think year 4");
  });
});

describe("auditCourseKnowledge — 线路过滤", () => {
  it("声明思维线时科特专用 YCL 规则不命中", () => {
    const think = { trackLine: "思维线", courseStage: "图形化" };
    const script = "科特图形化4个月ycl1级。";
    assertExcludes(ids(script, "", think), "ycl-kote-scratch-4m-l1", "kote rule filtered");
  });
});
