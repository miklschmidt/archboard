---
id: TASK-302.02
title: The agent timeline carries the evidence a person monitors
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 03:20'
updated_date: '2026-09-23 03:50'
labels: []
dependencies: []
parent_task_id: TASK-302
priority: high
ordinal: 524000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The workbench cannot show what an agent is doing because the server projection throws the evidence away (codex-timeline-projection.ts, thread-projection.ts, browser-thread.ts): the person never sees their own prompt (userMessage is not projected), every command loses cwd, exit code, duration and output, file changes lose their paths, tool calls lose arguments, duration and error, turns lose their timing and error message, and turn/plan/updated and thread/tokenUsage/updated are decoded but never forwarded. The redesigned conversation panel renders prompts, work rows with evidence, a live plan and a context warning from these fields. Codex-shaped types derive from the generated contract so a Codex bump breaks type-check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The browser timeline carries the person's prompts as items in turn order, including steers, with their text
- [x] #2 Command items carry cwd, exit code, duration and a bounded tail of the aggregated output with a truncation flag
- [x] #3 File change items carry each changed path with its kind (add, delete, update with move path) and added and removed line counts, bounded in number
- [x] #4 Tool call items carry the server or namespace, a bounded compact argument summary, duration and an error message when the call failed
- [x] #5 Web search items carry their query; a context compaction appears as a marker item
- [x] #6 Each turn carries its start and completion time in milliseconds, its duration and, when failed, the Codex error message
- [x] #7 Each turn carries the latest plan Codex published for it (explanation and steps with status) while the server holds it
- [x] #8 The timeline carries the thread token usage (total, last and model context window) when Codex has reported it
- [x] #9 The snapshot stays within its byte budget with long outputs and many turns; owners cover projection, bounds and the delta wire
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared contract: closed Codex enums/shapes the browser model needs (plan step status, patch change kind, token usage breakdown) derived from the generated types in src/shared/codex-app-server-contract.
2. Browser model (browser-thread.ts): prompt/search/compaction arms; command cwd/exitCode/durationMs/output tail/outputTruncated; fileChange changes[]+changesTruncated; tool server/arguments/durationMs/error; turn startedAtMs/completedAtMs/durationMs/error/plan; timeline usage.
3. Owner contract (projection-contract.ts) + sole adapter (thread-projection.ts): carry the bounded owner fields, convert Codex seconds to ms, pick closed shapes (private extensions omitted).
4. Canvas projection (codex-timeline-projection.ts): project userMessage/webSearch/contextCompaction, bounded output tail at a line boundary, diff line counts, compact bounded tool arguments, turn timing/error.
5. Timeline owner (codex-workbench-timeline.ts): hold latest turn/plan/updated per thread+turn and thread/tokenUsage/updated per thread (bounded), publish on arrival without a history re-read; budget (codex-timeline-budget.ts) counts plan and usage bytes.
6. Keep UI consumers compiling (workbench-timeline projection/normalize) with minimal changes; fake Codex emits turn times in seconds and a plan/usage on completion.
7. Tests: extend timeline owner tests, projection-closure, snapshot budget, production system test for plan/usage delivery; run type-check, lint, fmt:check, module tests, canvas-state system tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in 44b30b5f.
Decisions:
- Wire bounds live in one place, BROWSER_TIMELINE_LIMITS (shared/codex-browser-model), used by both the schema and the server projection so they cannot drift.
- Codex enums (plan step status, patch change kind) are z.enum over objects typed { [K in Union]: K }, so a member Codex adds or drops breaks type-check; the usage breakdown is a strict object that satisfies the generated TokenUsageBreakdown, and the adapter picks its six fields, so a removed field also breaks type-check.
- Plans and usage are held by a new codex-timeline-live holder keyed by wire ids (256 plans, 64 threads, oldest forgotten). A plan/usage notification republishes a pane already showing that thread via onChange without a history re-read; the budget counts both.
- search.query is nullable (Codex may not have a query yet); an empty command output or cwd is null (the schema refuses empty bounded text).
- File change counts: add/delete count the whole content Codex sends as the diff; update counts +/- lines only inside hunks, so ---/+++ headers are never counted. Diff text is not shipped.
- Output tail: last 4 KiB by bytes, never splitting a character, starting at the first whole line when anything was cut and a later line starts inside the tail. Tail/argument/path cuts carry their own flags and do not mark the turn outputsTruncated.
- UI kept compiling only: workbench-timeline ignores prompt/compaction parts, shows search as a tool part, labels the new media.
- The fake production Codex now opens each turn with its userMessage, reports turn times in seconds (as Codex does), and emits a plan and token usage before completing the workhorse turn.
Validation: type-check pass; lint pass; fmt:check pass; bun test --isolate of every touched module 444 pass 0 fail; bun test --isolate --max-concurrency=1 tests/system/canvas-state 23 pass 0 fail; test:modules 3388 pass 10 fail, the 10 all src/runtime/skill-evaluation ('evals is not a whole suite': skills text names eval names), untouched by this change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser timeline now carries prompts and steers (media prompt), command cwd/exitCode/durationMs/bounded output tail, file change paths with kind/movePath/added/removed (max 64), tool server/arguments/durationMs/error, web search and compaction items, turn startedAtMs/completedAtMs/durationMs/error/plan, and timeline usage. Plans and usage are held from notifications and republished without a history re-read; the byte budget counts them. Verified by src/server/canvas/tests/codex-workbench-timeline.test.ts, codex-workbench-timeline-evidence.test.ts, src/server/codex-workbench/tests/projection-closure.test.ts, src/shared/codex-browser-model/tests/states.test.ts and the production system test tests/system/canvas-state/codex-workbench-production.test.ts; type-check, lint and fmt:check pass.
<!-- SECTION:FINAL_SUMMARY:END -->
