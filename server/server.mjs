import "dotenv/config";
import express from "express";
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const adminToken = process.env.ADMIN_TOKEN || "xrx101";
const writeToken = process.env.WRITE_TOKEN || "";

if (!url || !authToken) {
  console.error("缺少环境变量 TURSO_DATABASE_URL 或 TURSO_AUTH_TOKEN。请复制 .env.example 为 .env 并填写。");
  process.exit(1);
}

const client = createClient({ url, authToken });

await client.execute(`
  CREATE TABLE IF NOT EXISTS assessment_records (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

/** 从 PRAGMA table_info 收集已有列名，缺则 ALTER 追加（兼容已有库） */
async function ensureExtraColumns() {
  const ti = await client.execute("PRAGMA table_info(assessment_records)");
  const existing = new Set();
  for (const row of ti.rows) {
    const name =
      row && typeof row === "object"
        ? row.name !== undefined
          ? row.name
          : row[1]
        : null;
    if (name != null) existing.add(String(name));
  }
  const toAdd = [
    ["teacher_name", "TEXT"],
    ["teacher_city", "TEXT"],
    ["score_total", "REAL"],
  ];
  for (const [col, typ] of toAdd) {
    if (existing.has(col)) continue;
    await client.execute(`ALTER TABLE assessment_records ADD COLUMN ${col} ${typ}`);
  }
}

await ensureExtraColumns();

function recordTeacherName(rec) {
  const t = rec?.teacher;
  return t && typeof t === "object" ? String(t.name ?? "").trim() : "";
}

function recordTeacherCity(rec) {
  const t = rec?.teacher;
  return t && typeof t === "object" ? String(t.city ?? "").trim() : "";
}

function toFiniteNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function recordScoreTotal(rec) {
  const s = rec?.scores;
  const fromScores = toFiniteNumber(s?.total);
  if (fromScores != null) return fromScores;
  const sr = rec?.scoreResult;
  return toFiniteNumber(sr?.total);
}

/** 旧数据在加列前写入时三列为 NULL：从 payload JSON 回填 */
async function backfillDenormalizedFromPayload() {
  try {
    const r = await client.execute(`
      UPDATE assessment_records
      SET
        teacher_name = COALESCE(teacher_name, json_extract(payload, '$.teacher.name')),
        teacher_city = COALESCE(teacher_city, json_extract(payload, '$.teacher.city')),
        score_total = COALESCE(
          score_total,
          CAST(json_extract(payload, '$.scores.total') AS REAL),
          CAST(json_extract(payload, '$.scoreResult.total') AS REAL)
        )
      WHERE json_valid(payload)
    `);
    const n = typeof r.rowsAffected === "number" ? r.rowsAffected : 0;
    if (n > 0) {
      console.log(`已从 payload 回填 denormalized 列（影响行数: ${n}）。`);
    }
  } catch (e) {
    console.warn("payload 回填 denormalized 列失败（可忽略或检查 JSON1）:", e?.message || e);
    try {
      const r2 = await client.execute(`
        UPDATE assessment_records
        SET
          teacher_name = COALESCE(teacher_name, json_extract(payload, '$.teacher.name')),
          teacher_city = COALESCE(teacher_city, json_extract(payload, '$.teacher.city')),
          score_total = COALESCE(
            score_total,
            CAST(json_extract(payload, '$.scores.total') AS REAL),
            CAST(json_extract(payload, '$.scoreResult.total') AS REAL)
          )
      `);
      const n2 = typeof r2.rowsAffected === "number" ? r2.rowsAffected : 0;
      if (n2 > 0) console.log(`已从 payload 回填 denormalized 列（无 json_valid 过滤，影响行数: ${n2}）。`);
    } catch (e2) {
      console.warn("二次回填仍失败:", e2?.message || e2);
    }
  }
}

await backfillDenormalizedFromPayload();

/** 允许静态页在其它端口（如 Python 8765）时仍能调用本机 API；生产环境请用 CORS_ORIGIN 收紧 */
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Token, X-Write-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "4mb" }));
app.use(express.static(rootDir));

function requireAdmin(req, res) {
  if (req.headers["x-admin-token"] !== adminToken) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  return true;
}

function requireWrite(req, res) {
  if (!writeToken) return true;
  if (req.headers["x-write-token"] !== writeToken) {
    res.status(401).json({ error: "write token required" });
    return false;
  }
  return true;
}

app.get("/api/records", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const rs = await client.execute(
      "SELECT payload FROM assessment_records ORDER BY created_at DESC"
    );
    const out = [];
    for (const row of rs.rows) {
      let raw =
        row && typeof row === "object"
          ? "payload" in row
            ? row.payload
            : row[0] !== undefined
              ? row[0]
              : Object.values(row)[0]
          : row;
      if (typeof raw === "string") {
        try {
          out.push(JSON.parse(raw));
        } catch {
          /* skip corrupt */
        }
      }
    }
    res.json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/records", async (req, res) => {
  try {
    if (!requireWrite(req, res)) return;
    const record = req.body;
    if (!record || typeof record !== "object" || !record.id) {
      res.status(400).json({ error: "invalid body" });
      return;
    }
    const createdAt = String(record.createdAt || new Date().toISOString());
    const payload = JSON.stringify(record);
    const teacherName = recordTeacherName(record);
    const teacherCity = recordTeacherCity(record);
    const scoreTotal = recordScoreTotal(record);
    await client.execute({
      sql: `INSERT OR REPLACE INTO assessment_records
        (id, payload, created_at, teacher_name, teacher_city, score_total)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [String(record.id), payload, createdAt, teacherName, teacherCity, scoreTotal],
    });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.delete("/api/records", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    await client.execute("DELETE FROM assessment_records");
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const port = Number(process.env.PORT) || 3847;
app.listen(port, () => {
  console.log(`PPAIS + Turso: http://127.0.0.1:${port}/`);
});
