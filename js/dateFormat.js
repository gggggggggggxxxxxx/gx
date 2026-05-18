/**
 * 时间展示：库存 ISO(UTC)，界面用中国时区 Asia/Shanghai
 */

const CN_TZ = "Asia/Shanghai";

/**
 * @param {string|number|Date} value ISO 或时间戳
 * @returns {string} 如 2026-05-17 16:48:00
 */
export function formatDateTimeChina(value) {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const s = new Intl.DateTimeFormat("zh-CN", {
    timeZone: CN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);

  return s.replace(/\//g, "-");
}

/** 导出文件名用：2026-05-17_16-48-00 */
export function chinaFilenameStamp(date = new Date()) {
  return formatDateTimeChina(date).replace(" ", "_").replace(/:/g, "-");
}

/**
 * ISO/时间戳 → 东八区日历日 YYYY-MM-DD（管理员筛选用）
 * @param {string|number|Date} value
 * @returns {string}
 */
export function chinaYmdFromIso(value) {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * 按东八区日历日判断是否在区间内（闭区间）；起止为空表示不限制该端
 * @param {string|number|Date} iso
 * @param {string} [startYmd]
 * @param {string} [endYmd]
 */
export function isCreatedAtInChinaYmdRange(iso, startYmd, endYmd) {
  const start = String(startYmd || "").trim();
  const end = String(endYmd || "").trim();
  if (!start && !end) return true;
  const day = chinaYmdFromIso(iso);
  if (!day) return false;
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}
