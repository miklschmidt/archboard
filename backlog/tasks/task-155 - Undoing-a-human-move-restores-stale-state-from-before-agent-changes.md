---
id: TASK-155
title: Undoing a human move restores stale state from before agent changes
status: Done
assignee:
  - '@codex'
created_date: '2026-09-06 23:01'
updated_date: '2026-09-07 00:11'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 307000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reported by the user on 2026-09-07; not yet independently reproduced.

Reproduction:
1. An agent adds or changes a box on the board.
2. The person moves that box on the canvas.
3. The person presses Ctrl+Z.

Actual: undo restores the box to a state from before the agent touched it, instead of only reversing the person's move. This can undo accepted agent work as a side effect of an ordinary human undo.

Expected: the first undo returns the box to its state immediately after the agent's changes and before the person's move. An agent-created box must remain present. The affected workflow is a person refining an agent-edited diagram; undo must reliably reverse their own latest action without unexpectedly reverting the agent's work.

The cause is not established. Do not treat the earlier version-refusal fixes or a particular Excalidraw capture setting as a confirmed cause.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After an agent creates a box and a person moves it, one Ctrl+Z restores its post-agent position and preserves the box and its agent-authored properties.
- [x] #2 After an agent modifies an existing box and a person moves it, one Ctrl+Z reverses only that move, preserving the agent's modifications; redo reapplies the person's move without reverting agent work.
- [x] #3 A focused real-browser regression covers agent creation and modification followed by human move, undo and redo, verifying the resulting canvas and persisted note agree; ordinary human undo/redo remains functional.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce agent creation and modification followed by a human move and undo in the serial browser runner, and trace the actual history/reporting cause.
2. Apply the smallest correction that preserves accepted agent state, ordinary human undo/redo, and the existing stale-write refusal/text-editor reconciliation.
3. Verify canvas and persisted-note agreement with the focused browser owner, retain all three refusal scenarios, run the complete check serially, record evidence and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced on f45057c7 through the serial browser runner using trusted drags and Ctrl+Z: creation/ordinary human undo passed (7.23s), modification failed (5.20s), restoring pre-agent x/y, width/height, background and stroke colors. Excalidraw 0.18.1 Snapshot.detectChangedElements/createElementsSnapshot compare versionNonce; Archboard bumpVersion changes only version/updatedAt, leaving a same-nonce agent edit absent from the undo baseline. The UI also strips native version, yielding invalid subsequent native version increments. Keep NEVER capture and showNoteScene unchanged; fix canonical mutation stamps and preserve native version at the UI boundary. Test note reads hydrate the existing persisted tracking envelope before comparing complete content.

Implemented a fresh Excalidraw versionNonce at the existing canonical bumpVersion write seam and stopped stripping native version at the UI boundary. No history clearing or capture-mode changes; showNoteScene and all three refusal tests are unchanged. Added the human-undo browser owner to both normal inventories. Focused serial validation passed: 2 undo cases (14.47s), 3 refusal cases (10.15s), and update-ordering (8.74s). Complete gate is in progress; lint, formatting, both TypeScript projects, and 2660 module tests have passed.

First complete gate passed lint, formatting, both TypeScript projects, 2660 module tests, 309 system tests, and 9 repository tests, then stopped on the existing fullscreen-presentation owner waiting for captured/published pane rectangles to agree. No task code is on that layout path. Its isolated serial rerun passed (7.22s, 52 assertions) without any code or test changes. Re-running the full gate unchanged to obtain a complete final result.

Confirmed the fullscreen gate blocker on the original f45057c7 product source: temporarily restored both changed production files and ran the normal first seven browser owners serially. The same fullscreen rectangle wait failed (5.31s), while the preceding six owners passed. Restored the TASK-155 implementation byte-for-byte. Full check therefore has a reproduced pre-existing browser-sequence failure; the fullscreen case independently passes. Completing every remaining normal browser owner without changing or weakening the fullscreen test.

TASK-156 coordination arrived while my remaining-browser run was already active. Sent SIGTERM to my identified serial runner (PID 706652) and am waiting for its owned cleanup; no new browser or heavy checks will start until TASK-156 signals the lane is free. The partially completed run is not final validation evidence.

The interrupted runner exited 143 and its PID was gone before coordination handoff. TASK-156 then reported its complete serial browser lane passed and explicitly released the exclusive browser/heavy-check slot. Started a final unchanged bun run check under that exclusive slot; this run will be the final complete-gate evidence.

Final exclusive validation: TMPDIR=/tmp bun run check exited 0 on the unchanged implementation. Lint, formatting and both TypeScript projects passed. All 3003 tests passed: 2660 module tests (288 files, 22.80s), 309 system tests (79 files, 143.37s), 9 repository tests (2 files, 2.60s), and 25 browser tests across all 20 normal owners. The undo owner passed creation (7.07s) and modification (6.80s), 60 assertions total, verifying full canvas/persisted-note content after ordinary and post-agent drag/undo/redo plus valid native version increments. All three stale-write refusal cases passed (10.15s) and showNoteScene remains byte-for-byte unchanged. Fullscreen passed in this final complete run (7.38s). Earlier timeouts, their base-source reproduction, and the interrupted overlap run remain recorded above but are not the final gate outcome. The live server and vault were not used; all test state was disposable under short /tmp paths. No lint rules or justified shadcn exceptions changed.

Integration review: Standards and Spec found no actionable findings against f45057c7. Integrated with TASK-156 and the user-requested Astra/medium workhorse profile on codex/task-143-144-workbench. Complete bun run check passed on the combined tree, including both undo scenarios and all three refusal scenarios. Browser inventories retain both new owners.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the reproduced stale undo baseline: canonical element mutations now refresh Excalidraw versionNonce, and the pane retains native version. NEVER capture, ordinary human history, and the accepted stale-write/text-editor reconciliation are preserved. Added two trusted-pointer/keyboard browser regressions covering agent creation and modification, full canvas/note agreement through undo and redo, and ordinary human undo/redo. All three acceptance criteria verified; the final exclusive bun run check passed all 3003 tests and every normal check. No merge or push.
<!-- SECTION:FINAL_SUMMARY:END -->
