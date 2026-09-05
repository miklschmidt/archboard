---
id: TASK-150.01.01
title: Quarantine the old UI and restore strict enforcement
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-05 01:10'
updated_date: '2026-09-05 01:41'
labels: []
dependencies: []
parent_task_id: TASK-150.01
priority: high
type: task
ordinal: 297000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Maintainers should not spend strict-lint repair effort on presentation code being discarded. Establish strict enforcement for retained repository code and isolate the old UI as a local, ignored archive that cannot enter the application, tests, builds or commits. This is planning only. Future grunt execution uses visible gpt-6-astra tasks at low reasoning. No independent review until all TASK-150 implementation work reports complete.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the orchestrating Astra agent, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.

User-approved archive dependency policy: tests and diagnostic probes that depend exclusively on retired UI may join its ignored, uncommitted local legacy/ snapshot. Inventory their imports and record each protected product behavior, whether the old assertion is obsolete or still required, and the task responsible for restoring required coverage. This includes UI-dependent files outside src/ui; directory location does not decide whether code is retired. Independently useful tests, scripts and active product code stay under full strict checks. Do not archive mixed-use code or difficult active code merely to pass checks; resolve its retained contract explicitly. Remove archived owners from active compiler/test inventories coherently and keep an explicit record of deferred coverage. This temporary retirement does not count as passing product verification and does not authorize skipped tests or weakened final gates. Restore required behavior coverage against the rebuilt implementation in TASK-150.07 or TASK-150.06 as appropriate. Any affected browser-test retirement/replacement remains subject to the orchestrating Astra agent's recorded case-by-case approval. Every deferred behavior must be accounted for before final acceptance; obsolete implementation-only assertions may be retired with a recorded reason.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Record the user's committed starting revision as BASE before retirement. The local legacy/ archive contains the old UI as a reference snapshot; its contents are ignored, never staged or committed, and recoverable from BASE for another checkout without committing an archive.
- [ ] #2 Tracked retired UI is removed from the active tree. Application, tests, scripts and build entrypoints cannot import, re-export, dynamically load or serve archive content. Approved font and wordmark assets remain active without preserving the old styling implementation.
- [ ] #3 Only the inert local legacy/ archive is exempt from lint and TypeScript program coverage. Retained source and any product logic copied into src/ui receive the full applicable policy, including the agreed generated/shadcn exceptions; no active logic is placed in the archive to evade checks.
- [ ] #4 Normal pinned Oxlint type-aware enforcement is enabled, the policy banning it is replaced with real diagnostic proof, every applicable rule and compiler option is audited, and the 500-line authored-code limit is enabled. Fixes and passing strict-baseline acceptance belong to the subsequent repair task.
- [ ] #5 Cheap repository checks reject tracked or staged legacy/ content and active references to it. Preserve behavioral verification requirements; do not disable browser tests merely to report a passing complete product gate while the UI is absent.
- [ ] #6 Exclusively retired-UI-dependent tests and probes are archived with the UI rather than left with broken imports. Each protected behavior has a recorded disposition and restoration owner; independently useful source remains active and strict. Affected browser-test retirement has individual orchestrator approval.
<!-- AC:END -->
