---
id: TASK-143.06.07
title: Remove legacy injection timing constants
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:29'
updated_date: '2026-09-03 02:59'
labels: []
dependencies:
  - TASK-143.06.06
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/timing/timing.ts
  - src/shared/timing/tests/codex-workbench-policy.test.ts
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 252000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove only the superseded injection debounce/min-interval names after replacement consumers use the shared Codex timing policy. This is the sole second serialized edit of src/shared/timing/timing.ts. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 DEFAULT_INJECT_DEBOUNCE_MS, DEFAULT_INJECT_MIN_INTERVAL_MS, their environment overrides, comments, and tests are removed after no source consumer remains.
- [ ] #2 The existing change-feed settle timings and all new workbench process/RPC/lease/approval/semantic/realtime/shutdown bounds remain named and coupled as documented.
- [ ] #3 Repository search and timing tests reject ARCHBOARD_INJECT timing names outside historical documents and show no local numeric replacement.
- [ ] #4 The serialized diff after TASK-143.01.16 is formatting/lint/type clean and changes no accepted duration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the fixed base and dependency state, then inspect the timing module, its focused policy owner, and executable consumers.
2. Remove only the two retired injection timing exports and their comments, environment-override references, and obsolete focused assertions after a tracked executable search proves no consumer remains.
3. Verify unchanged timing exports and numeric relationships, then run the focused timing owner, direct TypeScript evidence for the touched module, focused Oxlint/Oxfmt/diff checks, and a contained tracked executable search.
4. Record exact validation and baseline classification in task notes, commit the narrow deletion conventionally, and leave acceptance criteria unchecked and the task In Progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented against fixed HEAD ae401256ff98d7094526debdde679cba8e680cea. Deleted only the legacy injection timing section and its DEFAULT_INJECT_DEBOUNCE_MS / DEFAULT_INJECT_MIN_INTERVAL_MS exports and environment-override comments from src/shared/timing/timing.ts. Removed the two obsolete retention assertions and updated the focused test title in src/shared/timing/tests/codex-workbench-policy.test.ts. Manual tracked search found no remaining executable DEFAULT_INJECT_* or ARCHBOARD_INJECT_* timing references; remaining matches are historical Backlog records only.

Validation under systemd-run --user --scope with MemoryMax=1G and TasksMax=256, with individual commands capped at 20s and 5s kill cleanup: focused timing owner passed 3/3 with 11 assertions; direct TypeScript graph check for timing.ts plus codex-workbench-policy.test.ts passed; focused Oxlint passed; focused Oxfmt --check passed for both files; git diff --check passed. Root tsc remains a pre-existing baseline failure (exit 1) in src/runtime/engine/git-process-owner.ts, src/runtime/engine/git.ts, src/runtime/engine/tests/board-lock-lease.test.ts, tests/system/board-inspection/support/package-process.ts, and tests/system/board-inspection/support/package-sentinel.ts; no touched file is reported. Acceptance criteria remain unchecked and task remains In Progress.

Review repair: removed the three stale ARCHBOARD_INJECT, ARCHBOARD_INJECT_LOUD, and ARCHBOARD_INJECT_THREAD fixture properties from tests/system/canvas-state/codex-workbench-production.test.ts. The affected production owner was run under systemd-run --user --scope with MemoryMax=2G, TasksMax=512, and a 20s timeout with 5s kill cleanup; it failed at the existing threadLinkCreate delivery assertion on line 142 with outcome not_delivered after 12 assertions, before any later assertions. Since the repair only removes unused environment inputs and the retired names have no executable consumers, this is recorded as a remaining baseline/infrastructure risk, not repaired here. Focused Oxlint, Oxfmt --check, git diff --check, and tracked searches outside Backlog records passed. Task remains In Progress with ACs unchecked.
<!-- SECTION:NOTES:END -->
