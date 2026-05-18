import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  chinaYmdFromIso,
  formatDateTimeChina,
  isCreatedAtInChinaYmdRange,
} from "../js/dateFormat.js";

describe("formatDateTimeChina", () => {
  it("UTC ISO 转东八区显示", () => {
    assert.equal(formatDateTimeChina("2026-05-17T08:48:00.310Z"), "2026-05-17 16:48:00");
  });
});

describe("chinaYmdFromIso", () => {
  it("跨 UTC 日界仍归为中国日历日", () => {
    assert.equal(chinaYmdFromIso("2026-05-16T20:00:00.000Z"), "2026-05-17");
  });
});

describe("isCreatedAtInChinaYmdRange", () => {
  it("仅开始日期", () => {
    assert.equal(isCreatedAtInChinaYmdRange("2026-05-16T20:00:00.000Z", "2026-05-17", ""), true);
    assert.equal(isCreatedAtInChinaYmdRange("2026-05-15T12:00:00.000Z", "2026-05-17", ""), false);
  });

  it("仅结束日期", () => {
    assert.equal(isCreatedAtInChinaYmdRange("2026-05-15T12:00:00.000Z", "", "2026-05-16"), true);
    assert.equal(isCreatedAtInChinaYmdRange("2026-05-16T20:00:00.000Z", "", "2026-05-16"), false);
  });

  it("闭区间与无效时间", () => {
    assert.equal(
      isCreatedAtInChinaYmdRange("2026-05-17T08:00:00.000Z", "2026-05-17", "2026-05-17"),
      true
    );
    assert.equal(isCreatedAtInChinaYmdRange("invalid", "2026-05-01", "2026-05-31"), false);
    assert.equal(isCreatedAtInChinaYmdRange("2026-05-17T08:00:00.000Z", "", ""), true);
  });
});
