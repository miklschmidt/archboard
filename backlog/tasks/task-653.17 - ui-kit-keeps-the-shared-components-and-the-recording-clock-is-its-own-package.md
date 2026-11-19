---
id: TASK-653.17
title: ui-kit keeps the shared components, and the recording clock is its own package
status: To Do
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T17:34:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.16
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 14 of the archboard-deepen run, last on the TypeScript track. packages/ui-kit is wide (43 names): it holds components with one caller, a fullscreen presentation that is application state, and the frame-stepping clock tests and recordings use. Single-caller parts move to their caller and the clocks become @archboard/ui-clocks; recorded as a split by job, not depth. The settled design, every decision and its reason: the "Candidate 14, ui-kit: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-14-ui-kit.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: ui-kit (packages/ui-kit), the new @archboard/ui-clocks, and the callers in apps/web (shell columns, SemanticChanges, OpenerChoiceGroup, Notices, application state) and the test and recording fixtures that drive frames; vite.config.ts's controls chunk.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on ui-kit and @archboard/ui-clocks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ui-kit's components have width 20 from 24 (type-inclusive ceiling 21 with DialogError): Resizable moves to the shell columns, buttonVariants is private behind Button and the four Base UI triggers render a Button, shownRepository and usesCommandKey stay exported, and Command, InputGroup, Separator, IconButton, Popover and Tabs stay; INTERFACE_WIDE clears
- [ ] #2 Checkbox moves beside SemanticChanges and RadioGroup beside OpenerChoiceGroup, placed with shadcn's add -p, components.json unchanged, the exact-file lint paths swapped one for one with no wildcard, and a short digest README beside each moved file; the 12-line RadioGroup composite is deleted and OpenerChoiceGroup imports the registry file's two parts
- [ ] #3 Fullscreen presentation lives in application state with its eleven tests, and ./fullscreen-presentation is gone
- [ ] #4 Button has a typed href branch that draws a plain <a> with the same classes and no Base UI primitive, used by Notices.tsx, with a recorded deviation in button.tsx and no new name; a role check and screenshots prove it
- [ ] #5 @archboard/ui-clocks sits at layer 0 in area ui with the entries ./frame-clock (frameClock, driveFramesFrom, createSteppedClock, class SteppedClock with now, requestFrame, cancelFrame, after, cancelAfter, advanceTo, runFrame, syncAnimations, paint: 13) and ./time (useClock, shortAge, clockDuration: 3) and no root, width 16; import specifier tails and oxlint lines change only the package name, and the controls chunk regex in vite.config.ts includes it
- [ ] #6 Frame hashes of one replay, the three motion suites, both themes and the built chunk names are the same before and after, and the site audit passes
- [ ] #7 One short ADR records that single-caller registry items with no shared dependent live beside their caller, the three rejected moves and why shownRepository stays; ADR 0041's import path is updated and CONTEXT.md is unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->
