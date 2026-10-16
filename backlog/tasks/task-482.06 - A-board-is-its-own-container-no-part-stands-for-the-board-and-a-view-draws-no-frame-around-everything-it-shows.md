---
id: TASK-482.06
title: >-
  A board is its own container: no part stands for the board, and a view draws
  no frame around everything it shows
status: Done
assignee:
  - '@claude'
created_date: '2026-10-16 01:21'
updated_date: '2026-10-16 03:53'
labels: []
dependencies: []
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: high
ordinal: 847000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-16 the owner found the Agent workbench board drawn as one giant container in every reading. Nine or more dogfood boards hold a root part that stands for the board itself, with every other part inside it, because the skill taught agents to draw a module as a container and the ADR 0052 overview (root parts plus the parts one level inside) needed that outer part. A selection view also draws every container that holds a part it shows, so a view whose parts all sit in one container draws a box that says nothing (the Voice view of Agent workbench drew three frames around three cards).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The overview draws the root parts with every container closed
- [x] #2 A view does not draw a container that it pulls in only by following containment, when that container holds every part the view draws
- [x] #3 No dogfood board holds a root part that stands for the board itself, and archboard check reports no OVERVIEW_CROWDED
- [x] #4 ADR 0052 and the archboard skill state both rules
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scope.ts: the overview draws root parts with every container closed; a selection leaves out a container that holds every part it asked for.
2. Tests: scope, proposal drawing, overview budget.
3. Vault: for 14 boards, a draft TASK-482.06 removes the root part that stands for the board, makes its children root parts, and moves each line or flow step that ended on it to the part whose code it names; code check with and without the drafts must match; look at overviews; adopt.
4. ADR 0052, CONTEXT.md, the archboard skill, the sequences reference and the edit help state the rules.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed the outer part from Agent workbench, Archboard server routes, Archboard server, Board persistence, Board viewer, Browser application, Codex session, Codex workhorse, Command interface, Live panes, Renderer layout, Semantic renderer, Skill evaluation and Voice coordinator. Command dispatch kept Command routing: it is one module among the board's parts, not the board. Lines that ended on an outer part moved to the part that owns the anchored code: Semantic context input (Archboard server; new part on Live panes), Gate protocol operations (Codex session), Board change feed (new, Board viewer), Version pins (new, Skill evaluation). Removed lines whose anchor no remaining part binds and whose fact another line already draws: Archboard server -> Semantic renderer (Route handlers draws it), Semantic viewer -> Frame clock, Walkthrough replay -> Semantic viewer (useOverlayPlace), Bun host -> Renderer core (FACES), Server entry -> Archboard server on Live panes, and the step 'why the start failed' of The server starts. Code check with --variant TASK-482.06 equals the baseline except the outer parts' EXPOSED_UNUSED information, which is gone with them. Overviews after (parts/lines): Agent workbench 7/20, routes 11/24, Archboard server 9/19, Board persistence 10/23, Board viewer 12/21, Browser application 7/21, Codex session 12/18, Codex workhorse 5/9, Command interface 6/13, Live panes 13/23, Renderer layout 7/9, Semantic renderer 9/17, Skill evaluation 11/21, Voice coordinator 9/20. archboard check: no diagnostics. Looked at Agent workbench overview, The two threads and Voice, Board viewer and Browser application overviews.

Gate after the change (2026-10-16, machine loaded by a parallel worktree gate, load 16-25): lint, fmt and all module tests pass except wide-boards.test.ts. Three renderer tests asked the default reading for the whole board; they now ask Everything, or name the container in their view. Open: Codex workhorse (track) Everything draws relationship 4DGyP7RO from the container Coordinator callbacks through its own child Tell coordinator, a track routing defect that the new layout exposed (being fixed separately); the timing cases must be measured again on a quiet machine.

Final verification 2026-10-16 on a quiet machine: scope.test.ts covers the overview drawing root parts closed and the frame rule; no dogfood board holds a root part that stands for the board, archboard check reports nothing, archboard check --code equals the baseline. Gate: lint and fmt pass; test:modules 4752 pass, 3 fail (wide-board timing only: Archboard server routes blocks and Command interface blocks over 20 s, Board viewer track 3.8 s against 3 s); test:system 240 pass; test:repository 27 pass; test:serial-browser 19 of 19 files. Four system and browser tests that expected a container's parts on the default reading now ask for Everything or a view that opens it. Track and blocks defects that the new structure exposed are fixed with regression tests (holdSinks, relaid labels and regions, rerouted blocks, beside lines).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A board is now its own container: the overview draws the root parts with every container closed, and a view leaves out a container that holds every part it asked for. Fourteen dogfood boards lost the part that stood for them. ADR 0052, CONTEXT.md, the skill and the edit help state the rules. Verified with the scope tests, archboard check, the code check against its baseline, the pictures of the affected views and the full gate, whose only failures are the three wide-board timing cases.
<!-- SECTION:FINAL_SUMMARY:END -->
