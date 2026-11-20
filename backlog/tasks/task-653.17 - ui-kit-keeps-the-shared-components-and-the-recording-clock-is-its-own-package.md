---
id: TASK-653.17
title: ui-kit keeps the shared components, and the recording clock is its own package
status: Done
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-20T21:20:00Z'
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
- [x] #1 ui-kit's components have width 20 from 24 (type-inclusive ceiling 21 with DialogError): Resizable moves to the shell columns, buttonVariants is private behind Button and the four Base UI triggers render a Button, shownRepository and usesCommandKey stay exported, and Command, InputGroup, Separator, IconButton, Popover and Tabs stay; INTERFACE_WIDE clears
- [x] #2 Checkbox moves beside SemanticChanges and RadioGroup beside OpenerChoiceGroup, placed with shadcn's add -p, components.json unchanged, the exact-file lint paths swapped one for one with no wildcard, and a short digest README beside each moved file; the 12-line RadioGroup composite is deleted and OpenerChoiceGroup imports the registry file's two parts
- [x] #3 Fullscreen presentation lives in application state with its eleven tests, and ./fullscreen-presentation is gone
- [x] #4 Button has a typed href branch that draws a plain <a> with the same classes and no Base UI primitive, used by Notices.tsx, with a recorded deviation in button.tsx and no new name; a role check and screenshots prove it
- [x] #5 @archboard/ui-clocks sits at layer 0 in area ui with the entries ./frame-clock (frameClock, driveFramesFrom, createSteppedClock, class SteppedClock with now, requestFrame, cancelFrame, after, cancelAfter, advanceTo, runFrame, syncAnimations, paint: 13) and ./time (useClock, shortAge, clockDuration: 3) and no root, width 16; import specifier tails and oxlint lines change only the package name, and the controls chunk regex in vite.config.ts includes it
- [x] #6 Frame hashes of one replay, the three motion suites, both themes and the built chunk names are the same before and after, and the site audit passes
- [x] #7 One short ADR records that single-caller registry items with no shared dependent live beside their caller, the three rejected moves and why shownRepository stays; ADR 0041's import path is updated and CONTEXT.md is unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Built on deepen/653-17-ui-kit (5 commits on deepen/module-depth 25bd0dcb9a).

Widths (code check, types not counted): ui-kit 20 functions + 1 type (DialogError), logic 192; @archboard/ui-clocks 6 functions + 1 class (SteppedClock) with 9 methods = 16, logic 135 (measured with Frame clock rebound to packages/ui-clocks in the working tree only, then restored). No INTERFACE_WIDE or MODULE_SHALLOW on either. Ceilings (type-inclusive): ui-kit 35 -> 21, ui-clocks 7 (new).

Proof: replay frame hashes (canonical and retained talk, light and dark, 33 frames each) identical before and after; the three motion suites pass before and after; built chunk names identical (content hashes differ), index CSS byte-identical; browser lane 73 pass before and after. Screenshots and markup dumps in artifacts/653-17/shots, comparisons in artifacts/653-17/diff.

Deviations:
- shadcn add -p cannot place a ui item outside components.json's ui alias: add checkbox -p <dir or file> --dry-run and add switch -p ... --dry-run all target packages/ui-kit/src/ui/shadcn/components. The two files were moved byte for byte (git mv, cn import rewritten), as the workbench thread items were; each README says to compare with shadcn add <item> --diff and change by hand.
- Routing the four triggers and the notice link through Button merges their classes with cn once, as every other Button does. Three sites look different: the Explain menu icons 16 -> 14 px (size sm), the footprint facts icon 16 -> 12 px (icon-xs, as Refresh beside it), and the GitHub notice link medium weight and a 12 px icon like its sibling Opener settings. Before, the raw buttonVariants string kept both the base and the size classes and CSS order let the base win. Keeping the old look would need explicit size-4 on three icons and font-semibold on the link.
- The dock icon action and subtitles toggle gain tabindex="0" (Base UI Button on the trigger); classes unchanged.
- shownRepository and usesCommandKey stay exported; no fold commit.

Outside the slice: docs/readme/assets.json (README asset sources name packages/ui-clocks/src/ui beside ui-kit, so clips go stale when the frame clock changes); packages/ui-kit/src/ui/shadcn/components/README.md (digest rows moved, button deviation).

Footprint gate exits 1: the 13 modules changed (Code target, Shell, Picture cache, Camera glide, Picture transition, Replay page, ui-kit, Frame clock, Camera motion, Fly into a card, Camera controller, Camera and pointer, Shared components) are not yet named in proposal sL6y1FLr; the vault is unchanged here.

Merged into deepen/module-depth at cc1ef0fea4 (vault slice 57d0025903); footprint gate exit 1 with 7 import-only exceptions. Orchestrator accepted the three button looks (consistency with neighbouring buttons) and the hand move of the two registry files; both reported to the owner.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ui-kit keeps the shared components (20 names, ceiling 21 with DialogError); the frame clock and time as text are @archboard/ui-clocks at layer 0 (16 names: ./frame-clock 13, ./time 3). The stepped clock takes a window's frames over at creation and syncAnimations answers every violation so far. Resizable moved to the shell columns, fullscreen presentation with its eleven tests to application state, checkbox and radio-group registry files beside their one caller with digest READMEs and swapped exact lint paths; buttonVariants is private and Button draws a plain <a> for href. ADR 0093 records the placement rule; ADR 0041's path is updated. Replay frame hashes, motion suites and chunk names are unchanged; all lanes pass. Risks: the three sites that used raw buttonVariants now draw Button's merged classes (smaller icons, medium link weight); the footprint gate needs this slice named in proposal sL6y1FLr.
<!-- SECTION:FINAL_SUMMARY:END -->
