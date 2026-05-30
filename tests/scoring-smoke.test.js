/**
 * scoreAssessment 烟测：确保导入与扣分链路不抛错、结构完整。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scoreAssessment } from "../js/scoring.js";

function repeatToLength(s, targetLen) {
  if (s.length >= targetLen) return s.slice(0, targetLen);
  const pad = "。";
  let out = s;
  while (out.length < targetLen) out += pad;
  return out.slice(0, targetLen);
}

describe("scoreAssessment 烟测", () => {
  it("含课程审计触发项时返回 courseKnowledge 与数值分项", () => {
    const core =
      "思维线图形化种子班共48课时。学一年具备考8张国家级证书水平。家长问到退费，我说前10课时内可以全额退费。";
    const script = repeatToLength(core, 820);
    const student = {
      name: "测试学员",
      age: 10,
      grade: "小学四年级",
      province: "北京",
      city: "北京市",
      trackLine: "思维线",
      courseStage: "图形化",
    };
    const answers = [
      repeatToLength("答疑：建议关注赛考节奏与退费节点，与课程顾问核对书面政策。", 80),
      repeatToLength("第二题回答：分阶段规划学习与赛考，避免过度承诺证书张数。", 80),
    ];
    const res = scoreAssessment({ script, student, answers });
    assert.equal(typeof res.total, "number");
    assert.ok(Number.isFinite(res.learning));
    assert.ok(Number.isFinite(res.competition));
    assert.ok(Number.isFinite(res.qna));
    assert.ok(Number.isFinite(res.profile));
    assert.ok(Array.isArray(res.courseKnowledge?.findings));
    assert.ok(res.courseKnowledge?.deductions);
    assert.equal(typeof res.courseKnowledge.deductions.learning, "number");
    const findingIds = res.courseKnowledge.findings.map((f) => f.id);
    assert.ok(
      findingIds.length > 0,
      `expected at least one course audit finding, got: ${findingIds.join(", ")}`
    );
  });
});
