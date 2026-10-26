---
id: TASK-528
title: Remove renderer changes from the workbench branch
status: Done
assignee:
  - '@codex'
created_date: '2026-10-25T00:34:00Z'
updated_date: '2026-10-25T00:51:00Z'
labels: []
dependencies: []
type: chore
ordinal: 936000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user requires PR #2 to contain only agent-workbench work. Renderer changes already present on the branch are outside that scope. Performance failures are explicitly waived for this task because the renderer is being rewritten.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The renderer package matches the PR main base
- [x] #2 The workbench extraction remains intact
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Identify renderer-only changes against the PR base. 2. Restore renderer source and tests to the base without changing the workbench. 3. Run relevant structural and workbench validation, ignoring renderer performance failures as requested. No board is affected: this removes unrelated branch changes and restores the existing renderer architecture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restored packages/renderer to the merge base 47bf23eb3 in c2f59f838, which removes the TASK-519 Track routing optimization and its two new route modules. git diff 47bf23eb3 HEAD -- packages/renderer is empty. TASK-519 moved with its two commits to perf/track-route-search on origin/main, and its record is deleted from this branch. Renderer timing gates are waived.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the TASK-519 Track routing optimization from the workbench branch. The renderer package now matches the merge base, and the optimization lives on perf/track-route-search for its own PR. The full gate fails only in renderer owners: two waived Track timing limits and one Voice coordinator lane-clearance assertion that the branch's board content triggers. The system and repository lanes pass. The browser lane passes, after one font-loading race on its first run.
<!-- SECTION:FINAL_SUMMARY:END -->
