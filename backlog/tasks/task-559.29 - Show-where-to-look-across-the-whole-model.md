---
id: TASK-559.29
title: Show where to look across the whole model
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T04:16:00Z'
updated_date: '2026-10-31T05:27:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.22
parent_task_id: TASK-559
priority: high
ordinal: 1001000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The reader answers where a design smells only for a person who already knows where to look. Which modules change most is CLI only. Audit rank 4. The server already answers for every part at once in LocalityAnswer, so one read holds hotspots and coupled pairs. ADR 0045:414 says that a selection makes the inspector ask, and the code waits for a button.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A selection reads its code history with no button, as ADR 0045:414 says
- [x] #2 A reader sees one list across the whole model, in reach of Diagram, of modules with their interface counts, commit counts and unjoined pairs, and can sort it by each
- [x] #3 A row selects its module on the picture
- [x] #4 An unread part states why, and no count is combined into a score
- [ ] #5 The owner accepts it by eye
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the locality read on this repository before deciding how it runs.
2. Make the read safe to start from a selection: fix what stalls the server, and keep the walk apart from the answer so that a model edit starts no walk.
3. Read history with no button: one query per revision, shared by a selection, About and Measures, with no signal and no retry.
4. Add the Measures tab with one sort control, joined from interfaceCounts and the locality answer, selecting through findModule.
5. Show the reading, read, partial, failed, unbound, original and empty states.
6. Test the orders and states in module owners and the workflow in one browser owner, and look at it at 1920 by 1080.
7. Update DESIGN.md, reader-redesign.md, frontend.md, CONTEXT.md, test-suite.md and ADR 0045, then run the gate.

Architecture model: no proposal needed. The change stays inside the modules Model reading (apps/web/src/ui/components/architecture-model), Model access (apps/web/src/ui/clients/architecture-model) and History lens (packages/code-intel/src/runtime/operations/history-lens). Their responsibilities and relationships stay accurate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on this repository on 2026-10-31: 524 modules, 459 read, 65 unbound, 5,089 commits walked, 192 large commits left out, 40 modules bound to a symbol, an answer of 1.16 MB.
Before the repair, a first read took 19 s and held the server for 11 s: a status request waited 11.2 s and a model read 18.15 s. commitsByBoundPath took 8.5 s in one turn of the event loop.
After the repair, a first read alone takes 10.0 to 10.9 s, and 18 s while other requests run all the time. A repeat takes 0.15 to 0.19 s. Another request waited under 1 s. commitsByBoundPath takes 0.34 s. In the browser, six selections made one request.

Decisions:
- code-intel changed, because an automatic read would otherwise stall every request. The commit path index is in commits.ts.
- The server keeps a walk apart from an answer, keyed by HEAD, period and what the parts bind, so an agent's model edit starts no walk.
- The query takes no signal, because a selection that moves on drops the last subscriber before the next one mounts. A started read finishes.
- One answer for each revision. A commit at the same revision shows after Refresh or a new revision. ADR 0045 said the next selection reads HEAD, so the ADR changed.
- Measures stands on a second tab row on every reading, because five tabs do not fit 320 px.
- The default sort is Commits, so the rows reorder once when a cold read answers.
- A selection on Diagram reads silently, and the right panel gains no history line.
- A row leaves out a count of none, except commits, and the count it is sorted by.
- Two modules of one name are told apart only by the code path on hover.
- A retained original offers Measures with interface counts only. A failed read keeps the interface counts on screen.

Architecture model: no proposal needed. Model reading, Model access and History lens keep their responsibilities and relationships.

Evidence:
AC 1: tests/system/browser/reader-measures.test.ts, history-on-selection.test.tsx.
AC 2 and 3: the same browser owner, module-measures.test.ts, model-measures.test.tsx.
AC 4: module-measures.test.ts, model-measures.test.tsx, and the rows of /tmp/integrate/slice29/02-commits.png.
Screenshots at 1920 by 1080, dark, viewed: 01-reading, 02-commits, 03-row-selected, 04-unjoined, 05-keyboard-deep, 06-failed, 07-unbound, 08-proposal-tabs, 09-proposal-measures. Light, viewed: 11-light.

Merged to integrate/pr19, gate 21 of 21 in 143 s, server 17842 restarted. First read about 10 s, repeat under 0.2 s. Open: criterion 5, owner by eye.
<!-- SECTION:NOTES:END -->
