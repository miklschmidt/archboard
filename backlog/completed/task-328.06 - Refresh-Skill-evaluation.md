---
id: TASK-328.06
title: Refresh Skill evaluation
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 09:24'
updated_date: '2026-09-24 09:31'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 569000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The skill evaluation harness under its current code. Never run bun run eval:skill run or grade, and never walk .skill-evals recursively; read the harness source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [x] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [x] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Claim 'Skill evaluation', read every bound file (scripts/evaluate-skill.ts, src/runtime/skill-evaluation/lib/*, evals/) and git log 1263b848..HEAD over them; list each drift with file and symbol.
2. One edit on the current variant (Initial, 9mvpGVt6): correct responsibilities/descriptions, remove relationships the source does not support, add the parts the harness gained since 2026-09-17 that its question needs (kept skill and citations, the grader's one retry, exposure classification and its re-audit, the comparison that says what moved), each relationship with a source line; update the Grading view and the walkthrough beats that describe the old two-grader story. Keep every id.
3. Rasterize into $CLAUDE_JOB_DIR/tmp/328-06/ and look; report renderer defects rather than reshaping meaning.
4. Release the claim, ./bin/dogfood check clean for this board, commit the board file and this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Drift found (source evidence):
- Outcome checks -> CLI driver 'read the vault back' (EWbHFV2K) was false: outcomes.ts is pure over a Reading; the vault is read by vault.ts (readVault/renderBoard/inspectGroup/vaultDiagnostics, called from author.ts readAfter). Removed; added Run vault (vault.ts) with Author run -> Run vault -> CLI driver.
- Skill install described a 'live package': install.ts swaps in the frozen baseline or the candidate copy the batch kept (batch.ts keptCandidate -> citations.ts keepBatchSkill).
- Pinned checkout: flask.ts emptyCheckout gives a planning scenario an empty repository (6fbfaef2).
- Grading was drawn as two graders on one bundle: grading-run.ts runnerFor picks one runner by --grader; records.ts buildBatchReport compares two only when both graded. Grading view summary and beat wlpFYeya rewritten.
- New since 2026-09-17 and drawn: Skill citations (citations.ts; suite.ts suiteProblems, batch.ts keptCandidate, records.ts findingsOf), Grader retry (grading-retry.ts; grading-run.ts gradeChunk/retryOwed), Exposure re-audit (reaudit.ts; records.ts graderReport -> exposureAudit -> classifyCommands), Comparison (report.ts buildReport, report-change.ts), plus Command classifier (classify.ts; author.ts classifyCommands) which the exposure story needs.
- Added edges: Batch -> Pinned checkout (ensureFlaskCache), Grading session -> Pinned checkout (stageFlask), Codex CLI -> Agent CLI (isolation.ts writeCliWrapper/runEnvironment PATH), Agent CLI -> Archboard server http (runEnvironment ARCHBOARD_URL).
- Descriptions: Codex CLI names gpt-6-luna high (pins.json) and gpt-6-astra high (graders.json); Claude CLI claude-opus-5 high; Evaluation inputs names graders.json and its exclusion from the input digest.
- Two beats added (grader retry; what moved, held to its noise). Every id kept; one write, version 7 -> 8. Rasterized board and both views; readable, no renderer defect worth filing. ./bin/dogfood check: no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Skill evaluation's current variant now describes the harness as it stands: one wrong relationship removed (outcome checks never call the CLI), six parts added (Run vault, Skill citations, Command classifier, Grader retry, Exposure re-audit, Comparison) with 16 relationships each proven from source, the one-grader-chosen-at-grading story in place of two graders, the kept candidate skill, planning scenarios' empty repository, and the pinned models. Views and walkthrough updated. Written in one ./bin/dogfood edit under a claim (v7 -> v8); only variant; ids kept; rasterized and looked at; ./bin/dogfood check clean.
<!-- SECTION:FINAL_SUMMARY:END -->
