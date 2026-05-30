/**
 * 学员画像字段匹配单元测试
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nameAliases,
  nameMentionedInText,
  ageMentionedInText,
  profileRegionMentionedInText,
  evaluateProfileFields,
} from "../js/studentProfileMatch.js";

describe("nameAliases", () => {
  it("全名与后两字简称", () => {
    const aliases = nameAliases("张丰源");
    assert.ok(aliases.includes("张丰源"));
    assert.ok(aliases.includes("丰源"));
    assert.ok(aliases.includes("丰源妈妈"));
  });

  it("单字名仅保留全名及口语", () => {
    const aliases = nameAliases("明");
    assert.deepEqual(aliases.filter((a) => a === "明" || a.startsWith("明")), aliases);
    assert.ok(aliases.includes("明"));
  });
});

describe("nameMentionedInText", () => {
  it("张丰源 ↔ 丰源、丰源妈妈", () => {
    assert.equal(nameMentionedInText("丰源妈妈您好", "张丰源"), true);
    assert.equal(nameMentionedInText("结合丰源学情", "张丰源"), true);
    assert.equal(nameMentionedInText("张丰源同学表现好", "张丰源"), true);
  });

  it("不应误匹配无关同字", () => {
    assert.equal(nameMentionedInText("资源丰富", "张丰源"), false);
  });
});

describe("ageMentionedInText", () => {
  it("10岁、今年10岁 命中", () => {
    assert.equal(ageMentionedInText("小明今年10岁", 10), true);
    assert.equal(ageMentionedInText("孩子10周岁", 10), true);
  });

  it("2026年、810字 不命中 age=10", () => {
    assert.equal(ageMentionedInText("2026年政策", 10), false);
    assert.equal(ageMentionedInText("逐字稿810字", 10), false);
  });

  it("8岁命中个位数年龄", () => {
    assert.equal(ageMentionedInText("丰源8岁二年级", 8), true);
  });
});

describe("profileRegionMentionedInText", () => {
  it("省或市任一匹配", () => {
    assert.equal(
      profileRegionMentionedInText("青岛本地升学", { province: "山东省", city: "青岛市" }),
      true
    );
    assert.equal(
      profileRegionMentionedInText("山东政策", { province: "山东省", city: "青岛市" }),
      true
    );
    assert.equal(
      profileRegionMentionedInText("与外省无关", { province: "山东省", city: "青岛市" }),
      false
    );
  });
});

describe("evaluateProfileFields", () => {
  it("结构化返回 script/qna 命中", () => {
    const student = {
      name: "张丰源",
      age: 8,
      province: "山东省",
      city: "青岛市",
    };
    const script = "丰源妈妈您好，丰源8岁，青岛本地升学政策。";
    const answers = "结合丰源目前8岁的节奏，建议按周跟踪。";
    const r = evaluateProfileFields(script, answers, student);
    assert.equal(r.script.name, true);
    assert.equal(r.script.age, true);
    assert.equal(r.script.city, true);
    assert.equal(r.qna.name, true);
    assert.equal(r.qna.age, true);
    assert.ok(r.matchedAliases.name.includes("丰源"));
    assert.ok(r.matchedAliases.city.includes("青岛市") || r.matchedAliases.city.includes("山东省"));
  });
});
