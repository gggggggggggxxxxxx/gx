# PPAIS reference

## Data flow

```
app.js onRunScore
  → scoreAssessment({ script, student, answers })
      → scoreLearning / explainLearning
      → scoreCompetition / explainCompetition
      → scoreQna / explainQna
      → evaluateProfileFields + scoreProfileMatch / explainProfileMatch
      → auditCourseKnowledge → applyCourseDeductions
      → computeWeightedTotal
      → buildTraineeFeedback (feedbackDisplay.js)
  → saveRecord (storage.js) → localStorage or POST /api/records → Turso
```

## Student object (step 1)

Typical fields: `name`, `age`, `gender`, `grade`, `province`, `city`, `trackLine`, `courseStage`.

`trackLine` + `courseStage` gate which `courseKnowledgeAudit` rules run.

## scoreAssessment result (key fields)

```js
{
  total, learning, competition, qna, profile,
  tierLearning, tierCompetition, tierQna, tierProfile,
  profileMatch: { script: { name, age, city }, qna: { name, age }, matchedAliases },
  courseKnowledge: { findings, deductions },
  detail: { learning, competition, qna, profile }, // each with score, hits, issues, capReasons
  trainee, summary, declaration, student
}
```

## Hard caps (learning — representative)

| Cap id | Condition | Max |
|--------|-----------|-----|
| layer_depth | no phase goals + insufficient depth | 7 |
| no_shortcoming | no explicit weakness diagnosis | 8.5 |
| risk_long | missing risk preview or long-term plan | 9.25 |

## Hard caps (competition — representative)

| Cap id | Condition | Max |
|--------|-----------|-----|
| local_case_compare | weak local / case / compare | 7 |
| policy_compliance | no official-disclaimer phrasing | 8.5 |

## Hard caps (profile)

| Cap id | Condition | Max |
|--------|-----------|-----|
| script_none | script missing name, age, and city | 5 |

## Region matching

`scoringShared.js`: `regionAliases`, `regionMentionedInText`, `scriptBindsStudentRegion`.
Tests: `tests/regionMatch.test.js`.

## Useful scripts (repo root)

| Script | Purpose |
|--------|---------|
| `scripts/verify-score-once.mjs` | One-off score dump |
| `scripts/find-teacher.mjs` | Filter exported records by teacher |
| `scripts/inspect-record.mjs` | Inspect latest matching record |

## Deploy docs (repo root)

- `部署与培训-学员公网免费版.txt` — Render / Turso / trainee flow
- `Cloudflare-Quick-Tunnel-方案一.txt` — tunnel without card
- `server/readme-turso.txt` — env vars and table schema
