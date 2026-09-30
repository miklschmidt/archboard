---
id: TASK-144.10
title: Verify native Tailwind formatting through repository checks
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-09-02 22:50'
labels: []
dependencies:
  - TASK-144.06
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - tests/system/repository-policy/oxfmt-tailwind.test.ts
  - tests/system/repository-policy/support/oxfmt-tailwind-owner.ts
  - tests/system/repository-policy/support/oxfmt-tailwind-fixture.ts
  - tests/system/repository-policy/support/oxfmt-tailwind-process.ts
  - tests/system/repository-policy/support/oxfmt-tailwind-owner-lifecycle.ts
  - tests/system/repository-policy/oxfmt-tailwind-owner-reader.test.ts
parent_task_id: TASK-144
priority: high
type: task
ordinal: 232000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own a disposable repository-format fixture that proves native Tailwind sorting through the actual bun run fmt/fmt:check commands and leaves the checkout clean.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A generated fixture begins deliberately unsorted, makes bun run fmt:check fail for the expected file/reason, runs bun run fmt, then makes fmt:check pass with the installed native Tailwind v4 order.
- [x] #2 The fixture covers className and cn, preserves dynamic expressions, and runs without modifying authored production files or relying on a hand-coded expected sorter.
- [x] #3 Cleanup is unconditional and a final git diff/status assertion proves no tracked or reproducible derived artifact remains.
- [x] #4 A missing stylesheet/helper configuration or future Oxfmt behavior drift fails actionably; no warning suppression is accepted.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the exact bun run fmt and fmt:check scripts, Oxfmt 0.65.0 fixture conventions, the finalized Tailwind sorting configuration, and repository cleanup owners.

2. Add one disposable repository-policy owner that creates a deliberately unsorted isolated fixture, proves the real fmt:check fails actionably, runs the real fmt command, and proves the real fmt:check then passes with native className and cn ordering while dynamic expressions remain unchanged.

3. Make cleanup unconditional across success, failure, signal, and assertion paths; prove the authored checkout and reproducible artifacts remain unchanged, then run focused, repository, module, type, lint, format, and frontend gates.

4. Remediate the integration race by distinguishing vanished /proc entries from real reader failures, publishing refresh failures through owner state, preserving exact cleanup, and adding injected-reader regressions for ENOENT, EACCES, and malformed process metadata.
5. Run only the focused owner tests plus type-check, touched-file lint/format, and diff/scope checks; leave the task In Progress for parent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.06 finalized at integration HEAD e9fd214. This leaf owns tests/system/repository-policy/oxfmt-tailwind.test.ts and its task record only; it must exercise the actual package scripts and must not hand-code a Tailwind sorter or modify authored production/configuration files.

Implemented tests/system/repository-policy/oxfmt-tailwind.test.ts. The owner copies the checked-in package scripts, .oxfmtrc.jsonc, canonical Tailwind stylesheet/imported shell CSS, helper, and installed node_modules into /tmp; bun run fmt:check fails on the deliberately unsorted className/cn fixture, bun run fmt rewrites it with exact Oxfmt 0.65.0 native output, and the second check passes. Dynamic template, data-backed, and conditional cn expressions are asserted unchanged. Temporary fixture cleanup preserves primary plus cleanup failures and SIGINT/SIGTERM child-owner tests prove signal cleanup; authored status/staged/unstaged diff snapshots remain unchanged. Validation: focused owner, test:repository (140 pass), test:modules (1042 pass), type-check, lint, fmt:check, build:frontend, and git diff --check all pass.

Reviewer remediation supersedes the earlier signal-test wording: the signal cases now run the unchanged checked-in bun run fmt:check and bun run fmt scripts with a copied, read-only project-local Oxfmt 0.65.0 dependency view. The owner locates the actual Oxfmt process in its detached process group, holds the requested check or fmt phase, verifies SIGINT 130 and SIGTERM 143, reaps descendants with bounded TERM/KILL cleanup, removes the fixture and observability markers, and preserves cleanup failures. Exact script values, Oxfmt identity, dependency bytes and metadata, canonical fixture bytes, ignored dist artifacts, and authored git status/staged/unstaged state are audited. Hostile script suffixes are rejected before execution or marker creation.

Reviewer remediation 2: each owner bun run child now has a bounded execution and output wait, with process-group reaping in a finally path for normal exit, timeout, output/hold failure, and ordinary exceptions. Parent cleanup records the exact scenario root and every discovered formatter group before launch, attempts SIGCONT/SIGTERM within the bound, reaps the recorded groups, restores permissions only on that root, removes it, and uses owner SIGKILL last. A focused hostile copied project-local Oxfmt entrypoint test keeps a detached TERM-resistant formatter alive, proves the parent timeout preserves both primary timeout text and cleanup group/root evidence, and asserts no group, fixture, or container remains. The owner and fixture support are split below the 500-line repository policy. Validation for this remediation is focused owner 8 pass, type-check, lint, fmt:check, frontend build, diff check, and clean scope; broad suites remain root-owned per the durable OOM rule.

Integration follow-up: fixed a real nondeterministic owner race where /proc refresh observed a formatter PID disappearing before process-group lookup, causing an uncaught exit before readiness/result publication. Process-group lookup is now disappearance-safe and stale PIDs are skipped; owner errors preserve AggregateError primary and cleanup details, and startup diagnostics include root/process-group cleanup evidence.

Code commit: 960186f (separate from Backlog evidence). Validation: 10 consecutive focused SIGTERM fmt-owner runs passed; 5 consecutive complete focused owner-suite runs passed; final focused suite passed 8/8 with 322 assertions; bun run type-check passed; touched-file oxlint and oxfmt passed; no formatter processes or fixture temp roots remained.

Reviewer P2 remediation: centralized /proc access behind an injected ProcessReader. processGroupOf now returns undefined only for ENOENT/ESRCH; cmdline/stat and directory-reader failures otherwise throw actionable errors, malformed stat records and invalid non-kernel process groups fail closed, and the owner interval captures the first refresh failure in owner-state.json while continuing exact known-group/root cleanup. AggregateError formatting now retains execution, refresh, and cleanup evidence.

Added focused reader regressions for vanished PID, EACCES stat/cmdline, malformed stat, invalid group, and exact root/known-group cleanup. Code commit: ac50288 (separate from Backlog evidence). Validation: reader suite 6/6 with 15 assertions; real owner suite 8/8 with 322 assertions; 10 consecutive focused SIGTERM fmt-owner runs passed; bun run type-check passed; scoped oxlint and oxfmt passed; git diff --check passed; no formatter processes or temporary fixture roots remained after residue cleanup. Broad lanes remain intentionally skipped under the durable OOM constraint.

P1 rereview remediation: stopOwner now SIGSTOPs and confirms a timed-out owner before reaping recorded groups or removing the exact scenario root; SIGKILL remains last. Cmdline EACCES coverage is synthetic and ordered, with no dependency on the test runner process group. Separate focused fixtures now cover ENOENT, EACCES stat/cmdline, EIO, malformed stat, invalid group, and exact cleanup.

Evidence correction: the earlier note's broad test:repository (140) and test:modules (1042) counts were not reproduced in this remediation and are not authoritative; broad lanes remain intentionally skipped under the durable OOM constraint. Authoritative P1 validation: reader suite 7/7 with 15 assertions; real owner suite 8/8 with 322 assertions; fallback test 5 consecutive passes; SIGTERM fmt-owner test 10 consecutive passes; bun run type-check passed; scoped oxlint and oxfmt passed; git diff --check passed; no formatter processes or temporary fixture roots remained. Code commit: 2c4256f (separate from Backlog evidence).

Independent same-reviewer rereview returned REVIEW_CLEAN for the complete fixed range after independently reproducing 10/10 parent-fallback and 10/10 SIGTERM runs. Root capped validation passed in archboard-task14410-focused-6a222d2.service (15 tests, 337 expectations, 1,019.8 MB peak, 0 swap under 6 GB/1 GB caps) and archboard-task14410-repository-6a222d2.service (235 tests, 1,951 expectations, 2.2 GB peak, 0 swap under 12 GB/2 GB caps); neither cap was hit.

Historical note, 2026-09-03: TASK-143.08.07 removed this task's repository fixture cluster after its process ownership, signal, polling, and cleanup machinery outweighed the Tailwind sorting behavior it checked. This task remains the implementation history. No replacement wiring test was added, and normal Oxfmt configuration plus fmt/fmt:check remain.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a real native Oxfmt/Tailwind formatting owner using the repository's fmt scripts, with dynamic-expression preservation and fail-closed cleanup across signals, timeouts, disappearing processes, reader failures, and parent fallback. Multiple reproduced race fixes, independent review, and capped focused plus full repository validation passed.
<!-- SECTION:FINAL_SUMMARY:END -->
