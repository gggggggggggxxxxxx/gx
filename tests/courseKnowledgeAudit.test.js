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

  it("科特·图形化：3个月+YCL的一级（含「的」）不误报", () => {
    const script = "学习3个月可以参加YCL的一级考试，图形化2阶段可以参加YCL2级考试。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "YCL 的一级");
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

  it("科特·图形化：稿内 Python「三个月后 YCL 四级」不误触图形化 3 月×非一级", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "孩子跟着我学习三个月就会达到YCL一级的考级水平。在Python第一阶段的学习中，三个月后孩子就能达到YCL四级的考级水平。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "python 3m L4 not scratch");
  });

  it("科特·图形化：Python 段「三个月左右…YCL4级」不误触（闫炬稿衔接表述）", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "学习 Python 期间，我们依旧同步安排对应赛考，学到三个月左右，27年的9月份，报考 YCL4级，学完6个单元。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "python 3m L4 around");
  });

  it("科特·Python：稿内图形化「三个月 YCL 一级」不误触 Python 3 月×非四级", () => {
    const kotePy = { trackLine: "科特线", courseStage: "Python" };
    const script =
      "图形化阶段三个月考ycl一级。科特线Python三个月后达到YCL四级考级水平。";
    assertExcludes(ids(script, "", kotePy), "ycl-kote-py-3m-not-l4", "scratch 3m L1 not python");
  });

  it("科特·图形化：衔接段提常规 C++ 60 课时（非班型介绍）不误报", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script = "后面可以升常规C++，将来有60课时的规划路径，家长先了解即可。";
    assertExcludes(ids(script, "", koteScratch), "regular-cpp-60", "cpp forward mention");
  });

  it("科特·图形化：对比思维线前 8 课时可退不误触科特退费规则", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script = "思维线图形化是前8课时内可以全额退费，咱们科特线是前10课时。";
    assertExcludes(ids(script, "", koteScratch), "refund-scratch-kote-p8", "think refund compare");
  });

  it("科特·图形化：3 月一级与 8 月二级路线图不误报", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "三个月达到YCL一级，八个月可以冲YCL二级，这是科特图形化一年的赛考节奏。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "3m L1 8m L2");
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-4m-l1", "no false 4m");
  });

  it("科特·图形化：先一级再三个月冲二级（分句递进）不误报", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "学习三个月左右参加YCL等级考试一级。再学习三个月左右考取YCL2级证书，随后参加图灵杯。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "follow-on 3m L2");
  });

  it("科特·图形化：首张三个月直写二级仍检出", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script = "学习三个月左右参加YCL二级等级考试。";
    assertIncludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "first 3m L2");
  });

  it("科特·图形化：明年4月份（日历月）不误触四个月 YCL 规则", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "三个月考YCL一级，明年4月份三年级上册学完图形化第二阶段。像咱参加的等级考试YCL很有含金量。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-4m-l1", "calendar 4月 not duration");
  });

  it("科特·图形化：第三、四个月阶段序号不误触四个月 YCL", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script = "第二个月学角色属性；第三，四个月就可以独立创作小动画，第三个月左右参加YCL一级。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-4m-l1", "ordinal 第三四个月");
  });

  it("科特·图形化：第3或第4个月+一级不误触", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script = "学到第3或者第4个月的时候鼓励去参加YCL一级的考试。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-4m-l1", "flex 3 or 4 month L1");
  });

  it("科特·图形化：同样的三个月冲二级（递进）不误触", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "三个月考YCL一级。第二阶段我们还是同样的三个月的时间可以去参加咱们YCL二级的水平。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "同样的 3m L2");
  });

  it("科特·图形化：第二个阶段三个月后考 YCL2（杨洋稿句式）不误触", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "学习三个月左右的时间，在今年八月左右参加YCL等级考试一级。" +
      "第一个阶段基本上就学完了，那除了对学习的帮助以外更重要的就是我们的赛考。" +
      "第二个阶段了，同样的我们图形化的第二个阶段也是半年，" +
      "落在咱们宝贝跟我们学习到三个月左右的时间，" +
      "也就是说差不多在明年的一月份左右我们就会带着孩子去考取我们的YCL2级的证书，" +
      "那再学习三个月的时间，也就是说在四月左右的时间我们会带着宝贝去参加我们的图灵杯。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "stage2 3m YCL2");
  });

  it("科特·图形化：答疑仅 Python 3月四级路线图不误触", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const answers =
      "学习一年可以具备考4张国家级证书，大概3个月的时间就可以尝试去考YCL四级，学到6个月参加图灵杯。再用1年将python学完就可以进入C++。";
    assertExcludes(ids("", answers, koteScratch), "ycl-kote-scratch-3m-not-l1", "python-only answer");
  });

  it("科特·图形化：答疑先3月一级再3月四级（Python模板）不误触", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const answers =
      "图形化3个月左右考YCL1级。学习一年可以具备考4张国家级证书，大概3个月的时间就可以尝试去考YCL四级，学到6个月参加图灵杯。";
    assertExcludes(ids("", answers, koteScratch), "ycl-kote-scratch-3m-not-l1", "dual track answer");
  });

  it("科特·图形化：稿内 PY学 + 3月四级不误触", () => {
    const koteScratch = { trackLine: "科特线", courseStage: "图形化" };
    const script =
      "三个月考YCL一级。PY学习一年可以具备考4张国家级证书，大概3个月的时间就可以尝试去考YCL四级。";
    assertExcludes(ids(script, "", koteScratch), "ycl-kote-scratch-3m-not-l1", "PY 3m L4");
  });
});

describe("auditCourseKnowledge — 国家级证书张数（半年误报）", () => {
  it("半年两张+一年四张不误报半年夸大", () => {
    const script =
      "半年具备两张国家级证书的水平，三个月参加ycl考级。两个阶段一年具备4张国家级证书水平。";
    assertExcludes(ids(script, "", null), "cert-halfyear-national-over2", "half 2 year 4");
  });

  it("半年的课程结束不误触半年张数", () => {
    const script = "半年的课程结束之后进入二阶段算法。学习一年可以具备考4张国家级证书。";
    assertExcludes(ids(script, "", null), "cert-halfyear-national-over2", "half year course");
  });

  it("学半年具备考4张仍检出", () => {
    const script = "学半年就能具备考4张国家级证书的水平。";
    assertIncludes(ids(script, "", null), "cert-halfyear-national-over2", "true half year 4");
  });
});
