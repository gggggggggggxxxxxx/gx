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

async function countRowsNeedingBackfill() {
  try {
    const rs = await client.execute(`
      SELECT COUNT(*) AS c FROM assessment_records
      WHERE teacher_name IS NULL OR teacher_city IS NULL OR score_total IS NULL
    `);
    const row = rs.rows[0];
    const raw =
      row && typeof row === "object"
        ? "c" in row
          ? row.c
          : row[0] !== undefined
            ? row[0]
            : Object.values(row)[0]
        : 0;
    return Number(raw) || 0;
  } catch {
    return 1;
  }
}

if ((await countRowsNeedingBackfill()) > 0) {
  await backfillDenormalizedFromPayload();
}

const app = express();

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

function cell(row, key, idx = 0) {
  if (row == null) return undefined;
  if (typeof row !== "object") return row;
  if (key in row) return row[key];
  if (row[idx] !== undefined) return row[idx];
  return Object.values(row)[idx];
}

function buildSummaryWhere(query) {
  const name = String(query.name || "").trim();
  const city = String(query.city || "").trim();
  const dateFrom = String(query.dateFrom || "").trim();
  const dateTo = String(query.dateTo || "").trim();
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { invalidRange: true, where: "", args: [], dateFrom, dateTo };
  }
  const clauses = [];
  const args = [];
  if (name) {
    clauses.push("teacher_name LIKE ?");
    args.push(`%${name.replace(/[%_]/g, "")}%`);
  }
  if (city) {
    clauses.push("teacher_city LIKE ?");
    args.push(`%${city.replace(/[%_]/g, "")}%`);
  }
  if (dateFrom) {
    clauses.push("date(datetime(created_at, '+8 hours')) >= ?");
    args.push(dateFrom);
  }
  if (dateTo) {
    clauses.push("date(datetime(created_at, '+8 hours')) <= ?");
    args.push(dateTo);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { invalidRange: false, where, args, dateFrom, dateTo };
}

function rowToSummary(row) {
  const num = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: String(cell(row, "id", 0) ?? ""),
    createdAt: String(cell(row, "created_at", 1) ?? ""),
    teacher: {
      name: String(cell(row, "teacher_name", 2) ?? ""),
      city: String(cell(row, "teacher_city", 3) ?? ""),
    },
    student: {
      name: String(cell(row, "student_name", 5) ?? ""),
      age: cell(row, "student_age", 6) ?? "",
      gender: String(cell(row, "student_gender", 7) ?? ""),
      grade: String(cell(row, "student_grade", 8) ?? ""),
      province: String(cell(row, "student_province", 9) ?? ""),
      city: String(cell(row, "student_city", 10) ?? ""),
      trackLine: String(cell(row, "student_track_line", 11) ?? ""),
      courseStage: String(cell(row, "student_course_stage", 12) ?? ""),
    },
    scores: {
      total: num(cell(row, "score_total", 4)),
      learning: num(cell(row, "score_learning", 13)),
      competition: num(cell(row, "score_competition", 14)),
      qna: num(cell(row, "score_qna", 15)),
      profile: num(cell(row, "score_profile", 16)),
    },
  };
}

const SUMMARY_SELECT = `
  SELECT
    id,
    created_at,
    teacher_name,
    teacher_city,
    score_total,
    json_extract(payload, '$.student.name') AS student_name,
    json_extract(payload, '$.student.age') AS student_age,
    json_extract(payload, '$.student.gender') AS student_gender,
    json_extract(payload, '$.student.grade') AS student_grade,
    json_extract(payload, '$.student.province') AS student_province,
    json_extract(payload, '$.student.city') AS student_city,
    json_extract(payload, '$.student.trackLine') AS student_track_line,
    json_extract(payload, '$.student.courseStage') AS student_course_stage,
    json_extract(payload, '$.scores.learning') AS score_learning,
    json_extract(payload, '$.scores.competition') AS score_competition,
    json_extract(payload, '$.scores.qna') AS score_qna,
    json_extract(payload, '$.scores.profile') AS score_profile
  FROM assessment_records
`;

app.get("/api/records/summary", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const built = buildSummaryWhere(req.query);
    if (built.invalidRange) {
      res.json({ total: 0, page: 1, pageSize: 20, items: [] });
      return;
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const countRs = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM assessment_records ${built.where}`,
      args: built.args,
    });
    const total = Number(cell(countRs.rows[0], "c", 0)) || 0;

    const rs = await client.execute({
      sql: `${SUMMARY_SELECT} ${built.where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...built.args, pageSize, offset],
    });
    const items = rs.rows.map(rowToSummary);
    res.json({ total, page, pageSize, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/records/:id", async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json({ error: "missing id" });
      return;
    }
    const rs = await client.execute({
      sql: "SELECT payload FROM assessment_records WHERE id = ?",
      args: [id],
    });
    if (!rs.rows.length) {
      res.status(404).json({ error: "not found" });
      return;
    }
    const raw = cell(rs.rows[0], "payload", 0);
    if (typeof raw !== "string") {
      res.status(500).json({ error: "invalid payload" });
      return;
    }
    res.json(JSON.parse(raw));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e?.message || e) });
  }
});

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
