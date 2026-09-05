---
id: TASK-150.01.02
title: Repair active source and pass the strict baseline
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-05 01:11'
updated_date: '2026-09-05 01:41'
labels: []
dependencies:
  - TASK-150.01.01
parent_task_id: TASK-150.01
priority: high
type: task
ordinal: 298000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the retired UI is quarantined, remaining active source still needs to pass restored strict enforcement before fresh UI work starts. This task repairs server, CLI, shared, test, script, tooling and configuration code that remains active. It does not copy archived UI logic into src/ui; that is TASK-150.07 after TASK-150.05. Retain the previously permitted visible gpt-daybreak-blue-latest low assignment for these active-code fixes and non-browser verification; Astra owns difficult module decisions. No browser tests run here, including through aggregate commands. Browser-test replacements require prior case-by-case approval by the orchestrating agent. No independent review until all rebuild/integration work and complete workflow verification report complete.

User-approved archive dependency policy: tests and diagnostic probes that depend exclusively on retired UI may join its ignored, uncommitted local legacy/ snapshot. Inventory their imports and record each protected product behavior, whether the old assertion is obsolete or still required, and the task responsible for restoring required coverage. This includes UI-dependent files outside src/ui; directory location does not decide whether code is retired. Independently useful tests, scripts and active product code stay under full strict checks. Do not archive mixed-use code or difficult active code merely to pass checks; resolve its retained contract explicitly. Remove archived owners from active compiler/test inventories coherently and keep an explicit record of deferred coverage. This temporary retirement does not count as passing product verification and does not authorize skipped tests or weakened final gates. Restore required behavior coverage against the rebuilt implementation in TASK-150.07 or TASK-150.06 as appropriate. Any affected browser-test retirement/replacement remains subject to the orchestrating Astra agent's recorded case-by-case approval. Every deferred behavior must be accounted for before final acceptance; obsolete implementation-only assertions may be retired with a recorded reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All source remaining active after quarantine passes the full applicable strict lint and compiler gates with zero warnings, including production, tests, scripts, tooling, configuration and generated source under the agreed exceptions.
- [ ] #2 No archived UI product logic is ported during this task. The local legacy/ archive remains ignored, uncommitted and inaccessible through active imports/builds/serving paths; required UI logic will be copied and repaired after TASK-150.05 in TASK-150.07.
- [ ] #3 Unsafe boundaries, assertions, conditions, conversions, returns and oversized active files are fixed at meaningful contracts, preserving sequential I/O and concurrency limits. No broad suppressions, mechanical parallelization or forwarding-only decomposition is introduced.
- [ ] #4 Real type-aware diagnostic proof and source-coverage checks pass through ordinary lint commands, with strict compiler and applicable non-browser logic tests passing. Do not invoke browser tests or an aggregate command that invokes them.
- [ ] #5 Both strict-restoration children can report complete with a passing active-code baseline. The fresh UI tasks may then begin; the full product/browser gate remains pending until reconstruction and integration are complete.
<!-- AC:END -->
