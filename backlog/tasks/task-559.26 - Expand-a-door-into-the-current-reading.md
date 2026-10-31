---
id: TASK-559.26
title: Expand a door into the current reading
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T03:49:00Z'
updated_date: '2026-10-31T08:07:00Z'
labels:
  - frontend
  - board
  - renderer
dependencies:
  - TASK-559.22
  - TASK-559.16
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 998000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants two actions on a door: navigate, which opens that module, and expand, which brings the module into the current view and so widens the scope. Decision: expand opens the door's module as a second open frame in the same picture, with its parts, and lines between the two frames run part to part. The door is gone while it is expanded. A reading stays content free, so the address holds what is expanded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A door offers navigate and expand as two visible actions, by pointer and keyboard
- [x] #2 Expand draws that module as an open frame with its parts in the same picture, and lines to it end on its parts
- [x] #3 The expanded frame's tab offers collapse, which brings the door back
- [x] #4 Expanding repeats, and the address holds it, so a reload, a shared link and a pane keep the reading
- [ ] #5 The picture keeps its transitions, lands whole, and stays under 500 ms on the readings the owner names
- [ ] #6 The owner accepts it by eye
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Design, written before the build. A prototype rendered real readings first: the second frame already draws, and only the placement assumed one frame.

1. Shape of a reading. `scope` stays the one module a reading opens: it owns the crumbs, the caption, the panel and the back way. A reading adds `expand`, a list of module identities beside `focus` and `hideKinds`. The projection's `open` set is the scope and the expanded modules, so the reading of one frame is the case of an empty list, on the same code path. The render request holds the field, so the pane reading and the render recipe derive it. The address holds it as `expandX`.
2. Shape of a scene. No change. `Placed.frames` and `titles` are lists, and a frame is a node with `parent` children. `drawingContent` nests what `open` names.
3. Placement. `planned/dense` takes the frames of a reading in place of one frame: each frame sets its parts on a grid, the frames stand in a row or a stack, and the doors stand round that whole. One frame is the row of one. A frame that holds a frame stays with the existing placement, which nests.
4. Controls. A live reader asks for controls, and only then a door with parts carries an expand segment and an expanded frame's tab a collapse segment. An export, a render and a walkthrough ask for none, so their doors keep today's look and width and show no control that nothing can press. The core draws both pieces, so the Untouched Picture Rule holds. A door's arrow stays where it is, and the expand piece is a second segment at its right end, parted by a thin rule.
5. Actions. A click on the segment expands or collapses. A click on the rest of a door still opens it, Ctrl still selects, the tip still lists endpoints. Key `E` expands a selected door or collapses a selected expanded frame. `[` and `]` walk on from the parts to the doors, so a keyboard reaches a door. The panel foot holds `Expand` or `Collapse` beside `Open`.
6. Panel. The rule holds: the panel is the module the reading opened, because the reading still has one scope. Under the interface line, an `Expanded` list names each expanded module, a row selects its frame, and the row holds its collapse. A selected frame reads as any selected module.
7. Counts. The interface line reads the complete state, so its counts do not change. What a count selects follows the picture: a caller in an expanded frame selects its own card, not the frame. A trace leaves every frame out of its count, as it leaves the open module's. The legend treats every frame as it treats the open module's frame.
8. Moves. Opening another module clears `expand`, and Back returns it. A change of state keeps it. Showing a subject that an open frame holds keeps the reading.

What happens in the cases a reader can reach:
- A door with no parts has nothing to bring, so it has no expand segment. The same goes for a door that a comparison removed, a door whose single-part chain folds to a module that is already open, and every door of a focus or an imported view, which keep their own extent. There `expand` stays in the address and acts when the focus lifts.
- A chain of modules with one part each folds, as it does when opened: the frame is the end of the chain. Collapse removes what the address asked for.
- A door that holds other doors: those become parts of the frame, as closed cards. A module inside an open frame is a part, never a door.
- A door that holds an expanded frame or the open module, which a relationship on the module itself draws: that frame nests inside the new frame. Collapsing the outer frame leaves the inner one open.
- An address that names an unknown module or one with no parts opens nothing for that identity, and the panel's list omits it, with a line that says how many it left out. No read refuses.
- A drawing that the core refuses stays the refusal that every drawing has: the last picture stays with Retry and Back.

Amendments after the build. Frames stand in one row, or fill rows as wide as the widest frame, so two frames stack and a small frame fills what a short row leaves. A flat board of several frames in any reading now takes the grid, and a nested frame keeps the ranks. The panel foot says Expand here or Collapse, as an outlined action. A holder of the scope that only an address can name draws as a nested frame with no gesture to reach it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The owner confirmed the reading: an open frame with its parts.

Built and committed. The projection treats every open module alike, so a reading of one frame is the case of an empty list. Rules live in packages/board/src/shared/rules/model-expansion.ts and apps/web/src/ui/rules/architecture-model/expansion.ts. The pointer, the panel and the E key reach one rule, toggled.

Measures on the real core under Bun, milliseconds. Base readings: Commands 176, Browser 172, Workspace packages 410. One expansion: Commands + Command contract 99, + Command startup 95, + Server access 93, + Workspace packages 504; Browser + Archboard server 286, + Workspace packages 351; Workspace packages + Agent CLI 367, + Browser 353, + Workbench example 223, + Archboard server 512. Two expansions reach 1448. 33 readings, 0 refused, 11 over 500. The router's greedy pass takes most of that time, and that code is unchanged.

Measures in a cold browser, click to new picture: 447 to 523 ms for the small expansions and 672 to 1005 ms for those with Workspace packages. One long task of about 330 ms comes before the picture, where the core takes about 100 ms under Bun. A door's navigation stays quicker because its picture is drawn ahead on hover. AC 5 stays unchecked: transitions, reduced motion and the landing hold, but the time does not hold on every expansion.

Merged to integrate/pr19, gate 21 of 21 in 165 s, server 17842 restarted. Criterion 5 stays open: 11 of 33 measured expanded readings pass 500 ms, the worst 1448 ms, and the router's greedy pass takes most of that time. Criterion 6 waits for the owner.

Correction to the note above: 11 of 33 measured expanded readings take more than 500 ms, and 22 stay under it.
<!-- SECTION:NOTES:END -->
