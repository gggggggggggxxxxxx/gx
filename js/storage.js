const STORAGE_KEY = "ppias_records_v1";
export const ADMIN_PASSWORD = "xrx101";

/** @returns {string|null} null = 仅用本机 localStorage；"" = 同域相对路径；其它为 API 根 URL */
function apiPrefix() {
  if (typeof window === "undefined") return null;
  if (Object.prototype.hasOwnProperty.call(window, "__PPAIS_API__")) {
    const v = window.__PPAIS_API__;
    if (v === null || v === false) return null;
    if (v === "") return "";
    return String(v).replace(/\/$/, "");
  }
  /** 与 Node 同域托管：Cloudflare Quick Tunnel / Render 等 */
  if (typeof location !== "undefined" && location.hostname) {
    const h = location.hostname;
    if (/\.trycloudflare\.com$/i.test(h) || /\.onrender\.com$/i.test(h)) {
      return "";
    }
  }
  if (typeof location !== "undefined" && String(location.port) === "3847") return "";
  return null;
}

function useRemoteApi() {
  return apiPrefix() !== null;
}

/** 当前页面是否走服务端 / Turso（与 `loadRecords` 行为一致） */
export function usesRemotePersistence() {
  return useRemoteApi();
}

export function buildApiUrl(path) {
  const base = apiPrefix();
  if (base === "") return path;
  return `${base}${path}`;
}

/** 与 POST /api/records 共用的写入鉴权头 */
export function getWriteHeaders() {
  const headers = { "Content-Type": "application/json" };
  const fromWin =
    typeof window !== "undefined" ? String(window.__PPAIS_WRITE_TOKEN__ || "").trim() : "";
  if (fromWin) headers["X-Write-Token"] = fromWin;
  return headers;
}

function loadRecordsLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function loadRecords() {
  if (!useRemoteApi()) {
    return loadRecordsLocal();
  }
  const tok =
    typeof window !== "undefined" ? String(window.__PPAIS_ADMIN_TOKEN__ || "") : "";
  if (!tok) return [];
  const r = await fetch(buildApiUrl("/api/records"), {
    headers: { "X-Admin-Token": tok },
  });
  if (!r.ok) {
    console.error("loadRecords", r.status);
    return [];
  }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export async function saveRecord(record, opts = {}) {
  if (!useRemoteApi()) {
    const list = loadRecordsLocal();
    list.unshift(record);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return;
  }
  const headers = getWriteHeaders();
  const fromOpts = String(opts.writeToken ?? "").trim();
  if (fromOpts) headers["X-Write-Token"] = fromOpts;
  const r = await fetch(buildApiUrl("/api/records"), {
    method: "POST",
    headers,
    body: JSON.stringify(record),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(errText || `save failed ${r.status}`);
  }
}

export async function clearAllRecords() {
  if (!useRemoteApi()) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  const tok =
    typeof window !== "undefined" ? String(window.__PPAIS_ADMIN_TOKEN__ || "") : "";
  if (!tok) return;
  await fetch(buildApiUrl("/api/records"), {
    method: "DELETE",
    headers: { "X-Admin-Token": tok },
  });
}
