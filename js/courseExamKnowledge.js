/**
 * 赛考规划量规辅助：检测逐字稿是否出现「线路 + 图形化/Python + YCL + N 个月」类官方路线图表述。
 * （具体里程碑口径由 courseKnowledgeAudit 与测试用例维护，不在此重复落库。）
 */

/** 量规：是否出现「思维/科特 + 图形化/Python」与 YCL 等级及「N个月」里程碑 */
export function scriptHasOfficialExamRoadmap(script) {
  const s = script || "";
  const reTrack =
    /思维.{0,16}图形化|图形化.{0,16}思维|科特.{0,16}图形化|图形化.{0,16}科特|思维.{0,16}[Pp]ython|[Pp]ython.{0,16}思维|科特.{0,16}[Pp]ython|[Pp]ython.{0,16}科特/u;
  const reYcl = /YCL\s*[一二三四五1-5]\s*级|YCL[一二三四五]级/u;
  const reMonths = /\d{1,2}\s*个月/u;
  return reTrack.test(s) && reYcl.test(s) && reMonths.test(s);
}
