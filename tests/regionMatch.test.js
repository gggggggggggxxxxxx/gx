/**
 * 学员省/市/区与逐字稿地名绑定（简称匹配）
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { regionAliases, regionMentionedInText, scriptBindsStudentRegion } from "../js/scoringShared.js";

describe("regionMentionedInText — 简称", () => {
  const cases = [
    ["青岛市", "青岛本地升学", true],
    ["青岛市", "青岛市政策", true],
    ["山东省", "山东教育", true],
    ["山东省", "山东省内", true],
    ["西安市", "西安名校", true],
    ["武汉市", "武汉白名单赛事", true],
    ["成都市", "成都小升初", true],
    ["呼和浩特市", "呼和浩特中考", true],
    ["海淀区", "海淀择校", true],
    ["浦东新区", "浦东科创班", true],
    ["延边州", "延边升学", true],
    ["内蒙古自治区", "内蒙古政策", true],
    ["广西壮族自治区", "广西升学", true],
    ["北京市", "北京中考", true],
    ["上海市", "上海科创", true],
    ["广州市", "深圳升学", false],
    ["青岛市", "济南政策", false],
    ["其他市/区", "青岛本地", false],
    ["其他区", "海淀", false],
  ];

  for (const [region, text, expect] of cases) {
    it(`${region} in 「${text.slice(0, 12)}…」 → ${expect}`, () => {
      assert.equal(regionMentionedInText(text, region), expect);
    });
  }
});

describe("scriptBindsStudentRegion", () => {
  it("省或市任一匹配即可", () => {
    assert.equal(
      scriptBindsStudentRegion("济南与山东政策", { province: "山东省", city: "青岛市" }),
      true
    );
    assert.equal(
      scriptBindsStudentRegion("仅青岛二中", { province: "山东省", city: "青岛市" }),
      true
    );
    assert.equal(
      scriptBindsStudentRegion("与外省无关", { province: "山东省", city: "青岛市" }),
      false
    );
  });
});

describe("regionAliases", () => {
  it("直辖市下辖区县生成简称", () => {
    assert.ok(regionAliases("海淀区").includes("海淀"));
    assert.ok(regionAliases("西安市").includes("西安"));
  });
});
