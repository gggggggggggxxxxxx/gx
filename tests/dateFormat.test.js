import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDateTimeChina } from "../js/dateFormat.js";

describe("formatDateTimeChina", () => {
  it("UTC ISO 转东八区显示", () => {
    assert.equal(formatDateTimeChina("2026-05-17T08:48:00.310Z"), "2026-05-17 16:48:00");
  });
});
