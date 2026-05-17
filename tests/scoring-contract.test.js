/**
 * 无金标准时的契约测试：硬封顶、课程审计、结构字段
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreAssessment } from "../js/scoring.js";

function repeatToLength(s, targetLen) {
  if (s.length >= targetLen) return s.slice(0, targetLen);
  let out = s;
  while (out.length < targetLen) out += "。";
  return out.slice(0, targetLen);
}

const baseStudent = {
  name: "测试",
  age: 10,
  grade: "小学四年级",
  province: "北京",
  city: "北京市",
  trackLine: "科特线",
  courseStage: "图形化",
};

describe("scoreAssessment 契约（无金标准）", () => {
  it("可解释字段：hits / displayMissed / capReasons", () => {
    const script = repeatToLength(
      "三阶段路径。小明10岁。学情不错。项目闯迷宫。思维逻辑。三个月后YCL一级。北京白名单。科技特长生。以当年官方招生简章为准。",
      850
    );
    const answers = [
      repeatToLength("第一，理解您的顾虑。第二，建议按周跟踪赛考节奏，例如每月复盘一次。", 120),
      repeatToLength("若后续追问退费，以课程顾问书面政策为准，我们会分点说明节点。", 120),
    ];
    const res = scoreAssessment({ script, student: baseStudent, answers });
    for (const key of ["learning", "competition", "qna"]) {
      const d = res.detail[key];
      assert.ok(Array.isArray(d.hits), `${key} hits`);
      assert.ok(Array.isArray(d.displayMissed), `${key} displayMissed`);
      assert.ok(Array.isArray(d.capReasons), `${key} capReasons`);
    }
  });

  it("无短板诊断：学习规划封顶 8.5", () => {
    const script = repeatToLength(
      "三阶段路径。小明10岁四年级。学情很好进步快。项目作品。思维专注。卡点若跟不上会加练。长期升学体系。核桃课程体系。三个月后YCL一级。",
      850
    );
    const res = scoreAssessment({
      script,
      student: baseStudent,
      answers: [repeatToLength("分点建议与节奏跟踪。", 100), repeatToLength("潜在追问备案。", 100)],
    });
    assert.ok(res.detail.learning.score <= 8.5);
    const capIds = res.detail.learning.capReasons.map((c) => c.id);
    assert.ok(capIds.includes("cap.no_shortcoming"));
  });

  it("思维线图形化写 60 课时：触发课程审计", () => {
    const script = repeatToLength(
      "思维线图形化种子班整阶段共60课时。学一年8张国家级证书。",
      820
    );
    const student = { ...baseStudent, trackLine: "思维线", courseStage: "图形化" };
    const res = scoreAssessment({
      script,
      student,
      answers: [repeatToLength("答疑说明。", 80), repeatToLength("第二题。", 80)],
    });
    const ids = res.courseKnowledge.findings.map((f) => f.id);
    assert.ok(ids.some((id) => id.includes("60") || id.includes("think")));
    assert.ok(res.courseKnowledge.deductions.learning > 0);
  });

  it("赛考：稿写「西安」、学员填「西安市」仍计本地绑定", () => {
    const script = repeatToLength(
      "三阶段。学情。西安本地科技特长生。YCL图灵杯白名单。三个月后。学员获奖案例。含金量国家级。以官方招生简章为准。",
      850
    );
    const res = scoreAssessment({
      script,
      student: { ...baseStudent, province: "陕西省", city: "西安市" },
      answers: [
        repeatToLength("第一，理解顾虑。第二，建议按周跟踪赛考节奏。", 120),
        repeatToLength("若追问退费，以书面政策为准。", 120),
      ],
    });
    assert.ok(res.competition > 7);
    assert.ok(!res.detail.competition.issues.some((i) => i.includes("本地政策颗粒度不足")));
  });

  it("赛考：稿写「海淀」、学员填「海淀区」仍计本地绑定", () => {
    const script = repeatToLength(
      "三阶段。学情。海淀中关村学区。科技特长生招生简章。YCL白名单。三个月后。学员获奖。含金量对比。以官方简章为准。",
      850
    );
    const res = scoreAssessment({
      script,
      student: { ...baseStudent, province: "北京市", city: "海淀区" },
      answers: [
        repeatToLength("第一，理解顾虑。第二，建议按周跟踪。", 120),
        repeatToLength("若追问退费，以政策为准。", 120),
      ],
    });
    assert.ok(res.competition > 7);
  });

  it("赛考：稿写「青岛」、学员填「青岛市」仍计本地绑定，不触发 7 分封顶", () => {
    const script = repeatToLength(
      "三阶段路径。学情进步。项目作品。思维逻辑。咱们身处青岛本地，青岛二中科技特长生招生简章为准。" +
        "YCL一级图灵杯白名单赛事考级。三个月后节点。学员获奖名学员国赛一等奖案例。" +
        "含金量对比国家级择赛性价比。投入认可度担心焦虑。以当年官方招生简章为准。",
      850
    );
    const student = {
      ...baseStudent,
      province: "山东省",
      city: "青岛市",
    };
    const res = scoreAssessment({
      script,
      student,
      answers: [
        repeatToLength("第一，理解顾虑。第二，建议按周跟踪赛考节奏与复盘。", 120),
        repeatToLength("若追问退费，以书面政策为准，分点说明节点。", 120),
      ],
    });
    assert.ok(
      !res.detail.competition.issues.some((i) => i.includes("本地政策颗粒度不足")),
      "青岛 should bind 青岛市"
    );
    assert.ok(
      !res.detail.competition.capReasons.some((c) => c.id === "cap.local_case_compare"),
      "should not cap at 7 for local"
    );
    assert.ok(res.competition > 7, `competition=${res.competition}`);
  });

  it("科特图形化稿内 Python 衔接 YCL 四级：不误触图形化 3 月×非一级", () => {
    const script = repeatToLength(
      "科特图形化三阶段。三个月后考YCL一级。后续Python三个月后YCL四级衔接。",
      820
    );
    const res = scoreAssessment({
      script,
      student: baseStudent,
      answers: [repeatToLength("答疑。", 80), repeatToLength("答疑二。", 80)],
    });
    const ids = res.courseKnowledge.findings.map((f) => f.id);
    assert.ok(!ids.includes("ycl-kote-scratch-3m-not-l1"));
  });
});
