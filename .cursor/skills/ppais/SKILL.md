---
name: ppais
description: >-
  Develop and maintain the Programming Planning Intelligent Assessment (PPAIS /
  编程规划智能考核) web app: rubric scoring engine, course knowledge audit,
  student profile matching, Turso persistence, and trainer admin UI. Use when
  working in programming-planning-assessment/, or when the user mentions PPAIS,
  规划考核, 量规, scoreAssessment, courseKnowledgeAudit, Turso, or trainer export.
---

# PPAIS — 编程规划智能考核

Native HTML/CSS/JS (ES modules). No build step. Rule-based scoring only — **no LLM API**.

## Quick map

| Area | Path |
|------|------|
| UI flow | `index.html`, `js/app.js`, `css/styles.css` |
| Scoring entry | `js/scoring.js` → `scoreAssessment()` |
| Explain/rubric UI | `js/scoringExplain.js` + `js/rubricEngine.js` |
| Profile match | `js/studentProfileMatch.js` |
| Course audit | `js/courseKnowledgeAudit.js`, `js/courseExamKnowledge.js` |
| Trainee copy | `js/feedbackDisplay.js` (display only; does not change scores) |
| Questions | `js/questions.js` |
| Storage branch | `js/storage.js` (`localStorage` vs `/api/records`) |
| Server + Turso | `server/server.mjs`, `server/.env` (never commit) |
| Tests | `tests/*.test.js` — run `npm test` from repo root |

Local: `启动本地服务.bat` → :8765 (static only) or `启动Turso服务.bat` → :3847 (API + DB).

## Scoring contract (do not break silently)

**Four dimensions**, each 0–10:

| Dimension | Weight |
|-----------|--------|
| 学习规划 learning | 35% |
| 赛考规划 competition | 35% |
| 答疑能力 qna | 20% |
| 画像匹配 profile | 10% |

`computeWeightedTotal()` lives in `js/scoringShared.js`.

**Dual-track rule:** numeric logic in `scoring.js` (`scoreLearning`, `scoreCompetition`, `scoreQna`, `scoreProfileMatch`) must stay aligned with `scoringExplain.js` (`explainLearning`, etc.) using the same checks, deltas, caps, and failNotes. UI reads `detail.*.hits`, `displayMissed`, `capReasons` from explain output merged via `attachExplain()`.

**Course audit:** `auditCourseKnowledge(script, combinedAnswers, student)` runs after dimension scores; deductions apply via `applyCourseDeductions()` to learning/competition/qna only (not profile).

**Profile match:** `evaluateProfileFields()` — name (full or given-name alias), age (`N岁` context), city/province (via `regionAliases`). Scoring lives in profile dimension; learning/qna personal checks use grade/generic phrasing only to avoid double-counting.

## Change workflows

### Add or tune a rubric check

1. Add check in `explain*()` with `runRubric({ base, checks, caps, adjustments })`.
2. Mirror the same deltas/caps in the matching `score*()` function in `scoring.js`.
3. Add humanized copy in `feedbackDisplay.js` (`ISSUE_PLAIN` / `CAP_PLAIN`) if trainers need plainer text.
4. Extend `tests/scoring-contract.test.js` or dimension-specific tests.
5. Update rules copy in `index.html` `#page-rules` if user-facing rules change.

### Add a course-audit rule

1. Add rule in `js/courseKnowledgeAudit.js` `RULES` array (id, message, test, penalty, optional tracks/stages).
2. Add cases in `tests/courseKnowledgeAudit.test.js` and `tests/rules-and-answers.test.js`.
3. Prefer **宁少勿滥** — avoid false positives on comparative/contrast phrasing.

### Change persistence / deploy behavior

- `js/storage.js` `apiPrefix()`: remote when `*.trycloudflare.com`, port `3847`, `*.onrender.com`, or `window.__PPAIS_API__`.
- POST needs `WRITE_TOKEN` header when server env sets it; admin needs `ADMIN_TOKEN` === `ADMIN_PASSWORD` in `storage.js`.
- Assessment records: `schemaVersion: 3` includes `scores.profile`, `profileMatch`, `tierProfile`.

### UI / admin export

- `renderResult()` in `app.js`: score board, profile match table, feedback cards.
- CSV columns include `score_profile`, `tier_profile`; tolerate missing fields on old records.

## Testing (required before finishing scoring changes)

```bash
cd programming-planning-assessment
npm test
```

All eight test files in `package.json` `test` script must pass. After rubric changes, add or adjust contract tests rather than only manual checks.

## Security & ops

- Never commit `server/.env`, Turso tokens, or admin/write passwords.
- `ADMIN_PASSWORD` (`js/storage.js`) must match `ADMIN_TOKEN` (`server/.env`).
- Secrets stay server-side only.

## Conventions

- Minimize diff scope; match existing ES module style and Chinese UI strings.
- Scoring is deterministic regex/signal-based — document new patterns clearly in tests.
- `feedbackDisplay.js` and `index.html` rules are presentation; `scoring.js` is source of truth for points.
- Comments in Chinese OK for business logic; keep code identifiers in English.

## Additional reference

For file-level dependency diagram and cap inventory, see [reference.md](reference.md).
