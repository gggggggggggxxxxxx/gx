/**
 * 培训师可读评语
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  humanizeCap,
  humanizeIssue,
  buildTraineeFeedback,
  pickPriorityIssues,
} from "../js/feedbackDisplay.js";
import { scoreAssessment } from "../js/scoring.js";

describe("feedbackDisplay", () => {
  it("humanizeCap 去掉量规术语", () => {
    const plain = humanizeCap({
      id: "cap.local_case_compare",
      reason: "量规硬性限制：本地政策/真实案例/含金量对比任一偏弱时，赛考规划封顶 7 分。",
    });
    assert.ok(!plain.includes("量规"));
    assert.ok(!plain.includes("封顶 7"));
    assert.ok(plain.includes("本地政策"));
  });

  it("humanizeIssue 识别课程口径前缀", () => {
    const s = humanizeIssue("【课程口径】与内置课程体系口径不一致，学习规划项已扣 0.55 分；详见清单。");
    assert.ok(s.includes("课程表述"));
    assert.ok(!s.includes("【课程口径】"));
  });

  it("pickPriorityIssues 最多 3 条且不重复", () => {
    const list = pickPriorityIssues(
      {
        issues: ["缺少清晰的学习阶段或路径拆分，易被判定为「机械罗列」。"],
        capReasons: [{ id: "cap.layer_depth", reason: "量规硬性限制：缺少阶段目标…" }],
        displayMissed: [{ id: "x", label: "缺少学情或表现侧写：优秀档建议点名孩子当前状态与变化。" }],
      },
      3
    );
    assert.ok(list.length <= 3);
    assert.equal(new Set(list).size, list.length);
  });

  it("scoreAssessment 含 trainee 字段且综合评语无「量规」", () => {
    const res = scoreAssessment({
      script: "三阶段路径。小明10岁。学情不错。项目闯迷宫。思维逻辑。三个月后YCL一级。北京白名单。",
      student: {
        name: "小明",
        age: 10,
        grade: "小学四年级",
        province: "北京",
        city: "北京市",
        trackLine: "科特线",
        courseStage: "图形化",
      },
      answers: [
        "第一，理解您的顾虑。第二，建议按周跟踪赛考节奏，例如每月复盘一次。".repeat(3),
        "若后续追问退费，以课程顾问书面政策为准，我们会分点说明节点。".repeat(3),
      ],
    });
    assert.ok(res.trainee);
    assert.ok(res.trainee.summary);
    assert.ok(!res.trainee.summary.includes("量规"));
    assert.ok(Array.isArray(res.trainee.learning.priorityIssues));
    assert.ok(res.trainee.profile);
    assert.ok(res.trainee.summary.includes("画像"));
    const rebuilt = buildTraineeFeedback(res);
    assert.equal(rebuilt.summary, res.trainee.summary);
  });
});
