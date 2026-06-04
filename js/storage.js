const STORAGE_KEY = "ppais_records_v1";
export const ADMIN_PASSWORD = "xrx101";
export const ADMIN_SESSION_KEY = "ppais_admin_auth_v1";

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

export function getAdminToken() {
  if (typeof window === "undefined") return "";
  const fromWin = String(window.__PPAIS_ADMIN_TOKEN__ || "").trim();
  if (fromWin) return fromWin;
  return String(sessionStorage.getItem(`${ADMIN_SESSION_KEY}_tok`) || "").trim();
}

export function setAdminSession(token) {
  const tok = String(token || "").trim();
  if (typeof window !== "undefined") window.__PPAIS_ADMIN_TOKEN__ = tok;
  sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  sessionStorage.setItem(`${ADMIN_SESSION_KEY}_tok`, tok);
}

export function clearAdminSession() {
  if (typeof window !== "undefined") delete window.__PPAIS_ADMIN_TOKEN__;
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(`${ADMIN_SESSION_KEY}_tok`);
}

export function isAdminSessionActive() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1" && Boolean(getAdminToken());
}

function adminHeaders() {
  return { "X-Admin-Token": getAdminToken() };
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

function recordToSummary(r) {
  const t = r.teacher || {};
  const s = r.student || {};
  const sc = r.scores || {};
  return {
    id: r.id,
    createdAt: r.createdAt,
    teacher: { name: t.name || "", city: t.city || "" },
    student: {
      name: s.name || "",
      age: s.age ?? "",
      gender: s.gender || "",
      grade: s.grade || "",
      province: s.province || "",
      city: s.city || "",
      trackLine: s.trackLine || "",
      courseStage: s.courseStage || "",
    },
    scores: {
      total: sc.total ?? null,
      learning: sc.learning ?? null,
      competition: sc.competition ?? null,
      qna: sc.qna ?? null,
      profile: sc.profile ?? null,
    },
  };
}

/**
 * @param {{ page?: number, pageSize?: number, filters?: { name?: string, city?: string, dateFrom?: string, dateTo?: string } }} opts
 */
export async function loadRecordSummaries(opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const filters = opts.filters || {};

  if (!useRemoteApi()) {
    const { isCreatedAtInChinaYmdRange } = await import("./dateFormat.js");
    const filtered = loadRecordsLocal().filter((r) => {
      const t = r.teacher || {};
      const tn = String(t.name || "");
      const tc = String(t.city || "");
      const name = String(filters.name || "").trim();
      const city = String(filters.city || "").trim();
      const dateFrom = String(filters.dateFrom || "").trim();
      const dateTo = String(filters.dateTo || "").trim();
      if (dateFrom && dateTo && dateFrom > dateTo) return false;
      if (name && !tn.includes(name)) return false;
      if (city && !tc.includes(city)) return false;
      if (!isCreatedAtInChinaYmdRange(r.createdAt, dateFrom, dateTo)) return false;
      return true;
    });
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map(recordToSummary);
    return { total, page, pageSize, items };
  }

  const tok = getAdminToken();
  if (!tok) return { total: 0, page, pageSize, items: [] };

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.name) params.set("name", filters.name);
  if (filters.city) params.set("city", filters.city);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);

  const r = await fetch(`${buildApiUrl("/api/records/summary")}?${params}`, {
    headers: adminHeaders(),
  });
  if (!r.ok) {
    console.error("loadRecordSummaries", r.status);
    return { total: 0, page, pageSize, items: [] };
  }
  const data = await r.json();
  return {
    total: Number(data.total) || 0,
    page: Number(data.page) || page,
    pageSize: Number(data.pageSize) || pageSize,
    items: Array.isArray(data.items) ? data.items : [],
  };
}

export async function loadRecordById(id) {
  const rid = String(id || "").trim();
  if (!rid) return null;

  if (!useRemoteApi()) {
    return loadRecordsLocal().find((r) => String(r.id) === rid) || null;
  }

  const tok = getAdminToken();
  if (!tok) return null;

  const r = await fetch(buildApiUrl(`/api/records/${encodeURIComponent(rid)}`), {
    headers: adminHeaders(),
  });
  if (!r.ok) {
    console.error("loadRecordById", r.status, rid);
    return null;
  }
  return r.json();
}

export async function loadRecords() {
  if (!useRemoteApi()) {
    return loadRecordsLocal();
  }
  const tok = getAdminToken();
  if (!tok) return [];
  const r = await fetch(buildApiUrl("/api/records"), {
    headers: adminHeaders(),
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
  const tok = getAdminToken();
  if (!tok) return;
  await fetch(buildApiUrl("/api/records"), {
    method: "DELETE",
    headers: adminHeaders(),
  });
}
