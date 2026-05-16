/**
 * 课时 / 退费 / C++ / 证书「半年两张」、答疑-only、声明无逐字稿语境 等扩展回归
 *
 * 已知边界（若要覆盖需另加规则/用例）：
 * - 「两年」「满18个月」等与「张」组合（当前仅锚「一年」「半年」）
 * - 只说「8本证」「八次考级」而无「张」且无国家级/国赛等关键词
 * - regular-cpp 规则：同一句含「趣味」整句会被 snippetAny 跳过（设计如此）
 * - snippetAny 对拆句后不足 10 字的片段不检测
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

describe("课时口径（48/60）", () => {
  const thinkS = { trackLine: "思维线", courseStage: "图形化" };
  const koteS = { trackLine: "科特线", courseStage: "图形化" };
  const thinkP = { trackLine: "思维线", courseStage: "Python" };
  const koteP = { trackLine: "科特线", courseStage: "Python" };

  it("思维·图形化写成 60 课时（无科特对比语境）", () => {
    const script = "思维线图形化种子班这边一共要60课时才能上完基础部分。";
    assertIncludes(ids(script, "", thinkS), "scratch-think-60h", "think scratch 60h");
  });

  it("科特·图形化写成整阶段 48 课时", () => {
    const script = "科特线图形化实验班整个阶段一共48课时。";
    assertIncludes(ids(script, "", koteS), "scratch-kote-48h", "kote scratch 48h");
  });

  it("思维·Python 写成 60 课时", () => {
    const script = "思维线Python种子班总共60课时。";
    assertIncludes(ids(script, "", thinkP), "py-think-60h", "think py 60h");
  });

  it("科特·Python 整阶段共 48 课时", () => {
    const script = "科特线Python阶段一共48课时学完整个阶段。";
    assertIncludes(ids(script, "", koteP), "py-kote-total-48", "kote py 48 total");
  });
});

describe("退费节点", () => {
  const thinkS = { trackLine: "思维线", courseStage: "图形化" };
  const koteS = { trackLine: "科特线", courseStage: "图形化" };

  it("思维·图形化：前10课时全额退（错误）", () => {
    const script =
      "我们是思维线图形化，跟家长说前10课时内可以申请全额退费，第11课时就解锁了。";
    assertIncludes(ids(script, "", thinkS), "refund-scratch-think-p10", "think refund p10");
  });

  it("科特·图形化：前8课时全额退（错误）", () => {
    const script =
      "科特线图形化这边跟家长承诺前8课时内可以全额退费，第九课时才解锁。";
    assertIncludes(ids(script, "", koteS), "refund-scratch-kote-p8", "kote refund p8");
  });

  it("Python：套用前10课时全额退（错误）", () => {
    const script =
      "Python课程这边家长问退费，我说前10课时内可以全额退费给家长这样说。";
    assertIncludes(ids(script, "", thinkS), "refund-python-p10", "python p10 refund");
  });
});

describe("C++ 课时口径", () => {
  it("趣味 C++ 写成 56 课时", () => {
    const script = "趣味C++信奥科特班这边总课时是56课时。";
    assertIncludes(ids(script, "", null), "fun-cpp-56", "fun cpp 56");
  });

  it("常规 C++ 写成 60 课时（非趣味）", () => {
    const script = "常规C++信奥科特班整阶段一共60课时。我们跟家长说清楚班型。";
    assertIncludes(ids(script, "", null), "regular-cpp-60", "regular cpp 60");
  });
});

describe("证书：半年 1/2 张（思维 vs 科特）", () => {
  const thinkS = { trackLine: "思维线", courseStage: "图形化" };
  const koteS = { trackLine: "科特线", courseStage: "图形化" };

  it("思维·图形化：半年两张国家级（与科特混淆）", () => {
    const script = "思维图形化这边半年能拿两张国家级证书我跟家长这样介绍。";
    assertIncludes(ids(script, "", thinkS), "cert-think-scratch-half-2", "think half 2 certs");
  });

  it("科特·图形化：半年仅一张国家级", () => {
    const script = "科特图形化半年一张国家级证书就够了别的不用多说。";
    assertIncludes(ids(script, "", koteS), "cert-kote-scratch-half-1", "kote half 1 cert");
  });
});

describe("答疑文本独立命中 + 全角数字 + 纠错不命中", () => {
  it("国家级证书夸大仅出现在答疑也应检出", () => {
    const script = "这里是正常逐字稿不涉及张数承诺。";
    const answers = "家长追问证书，我书面回复：学一年具备考8张国家级证书水平。";
    const found = auditCourseKnowledge(script, answers, null).findings;
    const id = "cert-annual-national-over4";
    assert.ok(
      found.some((f) => f.id === id && f.sources.includes("答疑")),
      `expected ${id} in 答疑, got ${JSON.stringify(found)}`
    );
  });

  it("全角８张仍按年度夸大检出", () => {
    const script = "学一年具备考８张国家级证书水平。";
    assertIncludes(ids(script, "", null), "cert-annual-national-over4", "fullwidth 8");
  });

  it("纠错「不是半年四张」不命中半年夸大", () => {
    const script = "不是半年四张国家级证书那是误区，我们按文档来。";
    assertExcludes(ids(script, "", null), "cert-halfyear-national-over2", "half year negation");
  });
});

describe("声明无线路词时仍按步骤1比对 YCL", () => {
  it("仅声明思维线+图形化：稿里无「思维」仍检 3 个月+YCL", () => {
    const script = "图形化阶段大概三个月可以考ycl一级。";
    const st = { trackLine: "思维线", courseStage: "图形化" };
    assertIncludes(ids(script, "", st), "ycl-think-scratch-3m", "declared think 3m");
  });
});
