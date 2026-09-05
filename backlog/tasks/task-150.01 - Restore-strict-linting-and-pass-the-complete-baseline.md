---
id: TASK-150.01
title: Restore strict linting and pass the complete baseline
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 03:47'
labels: []
dependencies: []
references:
  - TASK-150
  - TASK-143.08.01
  - 'https://oxc.rs/docs/guide/usage/linter/type-aware'
parent_task_id: TASK-150
priority: high
type: task
ordinal: 291000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Unchecked TypeScript and disabled analyzer paths leave maintainers and agents without a trustworthy baseline. This is the absolute prerequisite for every later TASK-150 UI milestone: no child depending on it may start until it is complete. Verified untouched vendor-generated TypeScript declarations remain compiler/type-aware checked and receive only the approved authored-style, module-layout and file-length exceptions. There is no blanket generated-path lint exclusion. Astra owns analyzer and module-seam decisions. Quarantine/enforcement grunt work uses visible gpt-6-astra tasks with low reasoning. TASK-150.01.02 repairs only remaining active source using the previously permitted visible gpt-daybreak-blue-latest tasks with low reasoning. Archived UI logic is ported later in TASK-150.07 using Astra low, after TASK-150.05. Do not start an independent reviewer loop until every TASK-150 implementation child reports complete.

User-approved temporary exception: enable no-await-in-loop globally, but allow explicit rule-specific suppressions scoped only to the awaits that implement sequential browser test execution and cleanup in runSelection in tests/system/browser/run-browser-lane.ts. Each suppression must explain the existing runner constraint. Do not disable the rule for the file, browser directory, tests generally, unrelated loops, or other sequential operations. Replacing the browser harness with direct Playwright fixtures and reconsidering concurrency is deferred outside TASK-150; this exception must not trigger a harness redesign during strict-lint restoration.

User correction: the historical OOM came from overengineered parallel compiler/test orchestration, not an established Oxlint defect. Restore ordinary Oxlint type-aware linting. Do not create an alternate-engine investigation, compiler fan-out, per-slice analysis framework, memory-profiling project or custom analysis supervisor for this work.

User-approved shadcn policy: shared official shadcn component source retains strict compiler checks, type-aware safety, React correctness and accessibility lint. It is exempt from Archboard-authored code-style, module-layout and file-length rules. This is not an all-lint ignore. Archboard-authored feature compositions, adapters, generators and tests receive the full applicable ruleset. Do not place product-specific behavior in the exempt component source to evade rules.

The first subtask retires old UI into local ignored legacy/ and restores strict enforcement. The second fixes violations in code that remains active after quarantine. It does not port archived UI logic. Neither imports from or commits the archive. The parent is complete only after both subtasks finish with strict lint/types and applicable retained-logic checks passing. Fresh rendered UI work remains blocked. The full product gate remains mandatory at final integration; never claim missing browser workflows pass or disable them to manufacture a green gate.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the orchestrating Astra agent, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every retained repository TS, TSX, MTS, CTS and declaration file, including tests, fixtures, scripts, tooling, copied components and locally generated TypeScript, belongs to verified lint and TypeScript programs without broad or unapproved path-specific weaker policy. Verified untouched vendor-generated declarations retain compiler/type-aware safety checks and are exempt only from authored-code style, module-layout and file-length rules. Shared official shadcn component source has the corresponding style/module-layout/file-length exception and retains compiler, type-aware safety, React correctness and accessibility checks. The sole new exemption is the inert local legacy/ reference archive, which is neither committed nor reachable from any active import, test, build or serving path.
- [ ] #2 The seven named disabled rules and every applicable rule are enforced with zero warnings; opt-outs and compiler options are audited. Approved statement-level suppressions cover the existing browser execution/cleanup loop and demonstrated false positives or required behavior with no clearer compliant implementation. Each needs a concrete explanation and final-review assessment. Broad disables and effort-based exemptions remain prohibited.
- [ ] #3 A 500 physical-line maximum applies to authored repository TypeScript source, and retained oversized files are split along real responsibilities without forwarding-only fragments or new cycles. Verified untouched vendor-generated declarations are exempt from this structural limit. Shared official shadcn component source is also exempt from this structural limit. Discarded presentation in the inert archive is not repaired.
- [ ] #4 Pinned Oxlint type-aware linting runs through the normal command and covers the agreed source inventory with real type-aware diagnostic evidence; compiler checks remain strict, failures propagate, and no parallel compiler fan-out or custom analysis framework is introduced.
- [ ] #5 Violations are fixed at owning contracts, generated fixes come from the canonical generator or deterministic transform, and sequential I/O or concurrency limits are preserved rather than replaced mechanically with Promise.all.
- [ ] #6 Both ordered subtasks are complete. The real lint command proves type-aware diagnostics and coverage of every retained source class. Strict lint, strict compiler checks and applicable retained-logic tests pass without unapproved exceptions. The entire product's build/browser gate is required after reconstruction and is not represented as passing while workflows remain unimplemented. This baseline does not require porting archived UI logic; that separate task follows TASK-150.05 and must keep the baseline passing as files enter active source.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Execute the two existing ordered children from fixed BASE 0d1706d06b21df1c72910a640dadad35cd37234a. TASK-150.01.01 establishes quarantine and enforced diagnostics using an Astra low visible worker. TASK-150.01.02 repairs retained source using Daybreak low. Coordinator verifies the strict baseline before releasing TASK-150.02. No browser execution or new UI construction in this milestone.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved additional statement-level suppressions only for demonstrated false positives or required behavior with no clearer compliant implementation. Each needs a concrete local explanation and final-review assessment. No broad disables, migration-effort exemptions or file-size exceptions. AC 2 includes this policy.
<!-- SECTION:NOTES:END -->
