---
id: TASK-143.08.07
title: Remove obsolete Vite and Oxfmt self-test fixtures
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 22:49'
updated_date: '2026-09-02 22:55'
labels: []
dependencies: []
parent_task_id: TASK-143.08
priority: high
type: chore
ordinal: 279000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Maintainers currently carry a large repository-policy fixture cluster that tests Vite, Tailwind, and Oxfmt wiring by recreating tool behavior, process ownership, and cleanup paths. Remove that disproportionate enforcement while preserving the actual pinned tooling, build and format commands, application sources, and genuine product behavior owners. This cuts test code, subprocess states, and maintenance cost from the TASK-143 and TASK-144 recovery workflow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The six named repository-policy tests and six support modules are deleted without replacement.
- [x] #2 The three now-unused Vite/Tailwind test timing constants are deleted and no remaining static reference names them.
- [x] #3 The Tailwind adoption research keeps canonical-source and derived-artifact guidance but no longer claims the removed fixture gates are required; TASK-144.02, TASK-144.06, and TASK-144.10 retain concise historical removal notes.
- [x] #4 Package pins, Vite and Oxfmt configuration, application CSS and source, build and format scripts, CI, inventory behavior, and genuine product owners remain unchanged unless an exact static reference requires deletion.
- [x] #5 Static inspection, git diff --check, and clean-scope review validate the change; no project executable, formatter, build, lint, type-check, or test command runs in this safety-constrained worktree.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the named tests, support modules, timing constants, documentation claims, and repository-wide references.
2. Delete only the obsolete fixture cluster and unused timing constants with apply_patch.
3. Rewrite the research document to preserve canonical-source and derived-artifact guidance without requiring self-testing fixtures.
4. Append historical removal notes to TASK-144.02, TASK-144.06, and TASK-144.10 through Backlog CLI.
5. Use static reference searches, git diff --check, git status, and diff inspection, then commit without finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed the six Vite/Tailwind/Oxfmt repository-policy tests, their six support modules, and the three timing constants used only by the allocation owner. Updated the adoption research to keep canonical configuration, source, ignored derived artifacts, normal build/format commands, and rendered behavior as the durable contracts without requiring disposable wiring fixtures. Added historical notes to TASK-144.02, TASK-144.06, and TASK-144.10. Static validation found no remaining non-Backlog references to the deleted files or constants; git diff --check passed. Per the worktree safety constraint, no Bun, test, type-check, lint, formatter, build, package script, server, or project executable ran.

Finalization: two independent fixed-range reviews were clean on both spec and standards axes for 5d288faa7918c35eca681186583d634e0536c36a...ad4b1c4a73a92650802393ca41b57a27cf13e42c. Safety-constrained static validation confirmed exact deletion and reference scope, unchanged canonical product/tool configuration, and a clean git diff --check. No project executable, formatter, build, lint, type-check, or test command ran.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the Vite/Tailwind/Oxfmt self-testing cluster, its support modules, and its timing constants. Canonical product and tool configuration, real gates, and source remain. Validation was static under the incident-safety policy.
<!-- SECTION:FINAL_SUMMARY:END -->
