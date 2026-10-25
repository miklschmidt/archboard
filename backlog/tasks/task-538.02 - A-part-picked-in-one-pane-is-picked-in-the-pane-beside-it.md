---
id: TASK-538.02
title: A part picked in one pane is picked in the pane beside it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:06:00Z'
updated_date: '2026-10-25T19:21:00Z'
labels:
  - compare
  - ui
dependencies: []
parent_task_id: TASK-538
type: feature
ordinal: 943000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
To compare two designs part by part, a person picks a part on one side and must find it on the other. Today each pane owns its own pick, and nothing links them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When both panes show the same board of the same vault, a pick in either pane picks the same part in the other, and letting go clears both
- [ ] #2 Only the pane where the person picked reports the pick as made by hand
- [ ] #3 A pane whose variant lacks the part names the variant that has it, and does not say that the part left the board
- [ ] #4 A drill-down, another board or a presented walkthrough ends the link
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Linked panes: two panes are linked while both show the same board of the same vault and neither presents a walkthrough. The link is derived from the pane records, never stored.

1. PaneStatus gains `presenting`, set by the pane core from the reading's presentation, beside `view`. Files: rules/pane-session/session-types.ts, state/pane-session/pane-status.ts, state/pane-session/pane-core.ts, rules/application/pane-records.ts.
2. rules/application/pane-link.ts: `paneLinks(statuses)` gives each linked pane its partner and the variant the partner shows. A drill-down or another board changes the status's boardKey, so it ends the link (criterion 4).
3. hooks/application/use-pane-reading.ts: `pick(paneId, subject)` also picks in the linked pane, and a null pick clears both (criterion 1). A new `leave(paneId)` clears one pane only; the stage calls it through a new `onLeave` prop when a drill-down or a move back leaves the board, so the other pane keeps its pick. Only the picking pane marks `selection` as the user's (ADR 0034), so the other pane's report carries no mark (criterion 2).
4. The links reach the panes through usePaneViews, held stable until the link changes, so pane news rebuilds no pane.
5. state/semantic-board-canvas/pane-beside.ts and hooks/semantic-board-canvas/use-pane-beside.ts: the variant the linked pane shows. The inspector, for a pick its variant lacks and its comparison does not hold, names that variant instead of saying the part left the board (criterion 3).
6. use-group-selection: a pick that arrives from the linked pane ends this pane's group, so a pane never shows both.
7. CONTEXT.md gains "Linked panes". docs/design/operator-canvas-shell.md says that a pick is made in both linked panes.

Tests: a two-pane application test (pick in A picks in B, letting go clears both, only A's report marks selection, a drill-down in A leaves B's pick and ends the link), and a stage test for the inspector naming the variant beside. Rule test for paneLinks.

Proposals: Browser application@TASK-538.02 (from TASK-537.01) adds Linked panes and Pane beside. Board viewer@TASK-538.02 (from TASK-539.02) adds Pane beside and the inspector's call to it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned in e57e8945b.

- The linked panes rule is rules/application/pane-link.ts. hooks/application/use-pane-links.ts keeps one links object until the link changes, so pane news rebuilds no pane. PaneStatus gained `presenting`, which the pane core sets beside `view`.
- The pick propagation is in use-pane-reading.ts. The new `leave(paneId)` and the stage's optional `onLeave` let a drill-down or a move back clear one pane only. Without `onLeave` (the replay and the stage harness), the stage lets the pick go as before.
- The Selection tab names the variant beside through rules/semantic-board-canvas/board/missing-pick.ts and the PaneBesideContext. A pick that arrives from the linked pane ends a group (use-group-selection, `displaced`).
- Tests: tests/ui/components/application/linked-panes.test.tsx (criteria 1, 2, 3 and the drill-down of 4) and tests/ui/rules/application/pane-link.test.ts (another board, another vault, a walkthrough, one pane). Removing each behavior in turn fails its test.

Closing:
- Code check: the findings with and without `--variant TASK-538.02` are the same. The run read Board viewer 94Opxrki and Browser application 0RcVGuzC.
- Footprint read against base 814c0eedf (the parent of e57e8945b). Named and changed: Render stage states, Pane beside (Board viewer); Application composition, Pane composition, Linked panes, Pane beside (Browser application). Changed but not named, inside changes only: Viewer entry point and Board stage (SemanticBoardStage.tsx gained the optional onLeave and passes whether a part is picked to the group), and Open or leave a board (use-drill-moves.ts calls onLeave in place of onSelect(null)). The relationships they draw are unchanged. Named but not changed: parts of TASK-537.01, TASK-538.01 and TASK-539.02, which this proposal is branched from and which were committed before the base.

After the gate found the dock test failing, c223a3023 moved the link derivation into the records state of usePanes (rules/application/pane-link.ts relinked), and use-pane-links.ts is gone. Footprint read again against base 814c0eedf: Application composition now reads as changed but not named, because e57e8945b gave the empty readings in workspace-port.ts their leave; inside only. The Linked panes description says where the links are derived. Code check diff for TASK-538.02 is still empty. Adopted on Board viewer and Browser application.
<!-- SECTION:NOTES:END -->
