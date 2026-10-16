---
id: TASK-482.06
title: >-
  A board is its own container: no part stands for the board, and a view draws
  no frame around everything it shows
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-16 01:21'
updated_date: '2026-10-16 01:31'
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
- [ ] #1 The overview draws the root parts with every container closed
- [ ] #2 A view does not draw a container that it pulls in only by following containment, when that container holds every part the view draws
- [ ] #3 No dogfood board holds a root part that stands for the board itself, and archboard check reports no OVERVIEW_CROWDED
- [ ] #4 ADR 0052 and the archboard skill state both rules
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
<!-- SECTION:NOTES:END -->
