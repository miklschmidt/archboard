---
id: TASK-144.10
title: Verify native Tailwind formatting through repository checks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 02:23'
labels: []
dependencies:
  - TASK-144.06
references:
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - tests/system/repository-policy/oxfmt-tailwind.test.ts
  - tests/system/repository-policy/support/oxfmt-tailwind-owner.ts
  - tests/system/repository-policy/support/oxfmt-tailwind-fixture.ts
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
- [ ] #1 A generated fixture begins deliberately unsorted, makes bun run fmt:check fail for the expected file/reason, runs bun run fmt, then makes fmt:check pass with the installed native Tailwind v4 order.
- [ ] #2 The fixture covers className and cn, preserves dynamic expressions, and runs without modifying authored production files or relying on a hand-coded expected sorter.
- [ ] #3 Cleanup is unconditional and a final git diff/status assertion proves no tracked or reproducible derived artifact remains.
- [ ] #4 A missing stylesheet/helper configuration or future Oxfmt behavior drift fails actionably; no warning suppression is accepted.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the exact bun run fmt and fmt:check scripts, Oxfmt 0.65.0 fixture conventions, the finalized Tailwind sorting configuration, and repository cleanup owners.

2. Add one disposable repository-policy owner that creates a deliberately unsorted isolated fixture, proves the real fmt:check fails actionably, runs the real fmt command, and proves the real fmt:check then passes with native className and cn ordering while dynamic expressions remain unchanged.

3. Make cleanup unconditional across success, failure, signal, and assertion paths; prove the authored checkout and reproducible artifacts remain unchanged, then run focused, repository, module, type, lint, format, and frontend gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.06 finalized at integration HEAD e9fd214. This leaf owns tests/system/repository-policy/oxfmt-tailwind.test.ts and its task record only; it must exercise the actual package scripts and must not hand-code a Tailwind sorter or modify authored production/configuration files.

Implemented tests/system/repository-policy/oxfmt-tailwind.test.ts. The owner copies the checked-in package scripts, .oxfmtrc.jsonc, canonical Tailwind stylesheet/imported shell CSS, helper, and installed node_modules into /tmp; bun run fmt:check fails on the deliberately unsorted className/cn fixture, bun run fmt rewrites it with exact Oxfmt 0.65.0 native output, and the second check passes. Dynamic template, data-backed, and conditional cn expressions are asserted unchanged. Temporary fixture cleanup preserves primary plus cleanup failures and SIGINT/SIGTERM child-owner tests prove signal cleanup; authored status/staged/unstaged diff snapshots remain unchanged. Validation: focused owner, test:repository (140 pass), test:modules (1042 pass), type-check, lint, fmt:check, build:frontend, and git diff --check all pass.

Reviewer remediation supersedes the earlier signal-test wording: the signal cases now run the unchanged checked-in bun run fmt:check and bun run fmt scripts with a copied, read-only project-local Oxfmt 0.65.0 dependency view. The owner locates the actual Oxfmt process in its detached process group, holds the requested check or fmt phase, verifies SIGINT 130 and SIGTERM 143, reaps descendants with bounded TERM/KILL cleanup, removes the fixture and observability markers, and preserves cleanup failures. Exact script values, Oxfmt identity, dependency bytes and metadata, canonical fixture bytes, ignored dist artifacts, and authored git status/staged/unstaged state are audited. Hostile script suffixes are rejected before execution or marker creation.

Reviewer remediation 2: each owner bun run child now has a bounded execution and output wait, with process-group reaping in a finally path for normal exit, timeout, output/hold failure, and ordinary exceptions. Parent cleanup records the exact scenario root and every discovered formatter group before launch, attempts SIGCONT/SIGTERM within the bound, reaps the recorded groups, restores permissions only on that root, removes it, and uses owner SIGKILL last. A focused hostile copied project-local Oxfmt entrypoint test keeps a detached TERM-resistant formatter alive, proves the parent timeout preserves both primary timeout text and cleanup group/root evidence, and asserts no group, fixture, or container remains. The owner and fixture support are split below the 500-line repository policy. Validation for this remediation is focused owner 8 pass, type-check, lint, fmt:check, frontend build, diff check, and clean scope; broad suites remain root-owned per the durable OOM rule.
<!-- SECTION:NOTES:END -->
