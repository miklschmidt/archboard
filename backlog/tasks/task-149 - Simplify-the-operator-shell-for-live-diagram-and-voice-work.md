---
id: TASK-149
title: Simplify the operator shell for live diagram and voice work
status: Done
assignee:
  - '@codex'
created_date: '2026-09-04 22:09'
updated_date: '2026-09-04 23:02'
labels: []
dependencies: []
references:
  - docs/design/assets/operator-canvas-shell.png
priority: high
ordinal: 288000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Before the real voice acceptance smoke, the user found decorative sidebar groups, navigation that reorders boards, and an agent drawer fragmented into many small panels. Restore the reference hierarchy so the person can follow live diagram work and speak about their selection without managing a dashboard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Board and variant navigation has stable ordering across navigation and writes, with compact meaningful rows.
- [x] #2 The agent drawer presents one clear conversation and composer with persistent voice controls; necessary configuration is available in an accessible settings modal and empty administrative panels are absent.
- [x] #3 Claims and current agent activity remain clear, board updates remain live, and agent work does not steal the user viewport.
- [x] #4 Rendered desktop light and dark, split panes, fullscreen voice controls and relevant automated checks verify the result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the current shell and existing state contracts. 2. Remove decorative navigation and use stable name ordering. 3. Replace the workbench grid with a focused drawer and settings disclosure while retaining actionable approvals, queue, voice and claim state. 4. Verify rendered workflows and run the normal gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Inspection found navigator sorting by focused and on-screen board priority, and focused variant priority, rather than modified time. Replace with deterministic board name ordering and Current-first variant ordering. Existing board synchronization already separates element updates from explicit camera commands; preserve that contract. Browser regression assertions added for stable order and a claimed write reaching the rendered scene without changing viewport.

User confirmed 1920x1080 as the primary desktop design and acceptance target, replacing 1440x900. User also authorized rebasing the clean detached smoke worktree at /home/msc/.codex/worktrees/9ce9/archboard onto the verified UI commit, preserving its three smoke-procedure commits.

User requested wider navigation for long board names. Use a 280px sidebar and two-line names at the 1080p target; browser navigator fixture now includes a long architecture name. Flip is 4K hardware but 4K optimization is explicitly deferred.

User requested removal of the bottom status bar because it duplicates the top bar. Remove its rendering, dead styles, and grid row; browser workflow checks read the existing top-bar metadata and enforce absence of the footer.

Verified the final 1920x1080 UI in light/dark, split and fullscreen. Full normal serial browser inventory passes, including stable ordering/two-line long names, live claimed writes without camera motion, visible compact take-back errors, Settings Escape/focus return, controlled text and voice. Lint, formatting, type-check, 2513 module tests, 327 system tests and 123 repository tests passed; stale rendered assumptions from removed UI were corrected and the full browser lane rerun clean. The pre-existing untracked src-DlBR1tzg.js artifact was temporarily preserved outside the checkout for lint/format checks and restored byte-for-byte; no lint/type rules were weakened. Independent Astra review is clean. The existing composer fixture correction from the smoke worktree was cherry-picked as 7f30e5a4.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Simplified the shell around live diagram work: stable 280px board navigation with two-line names, one conversation and composer, persistent voice controls, and Agent settings. Removed decorative sidebar graphics, empty operational panels, the empty selection inspector, and the redundant bottom status bar. Claims and take-back recovery remain visible while edits stream without moving the camera. Verified rendered desktop workflows and all normal check components.
<!-- SECTION:FINAL_SUMMARY:END -->
