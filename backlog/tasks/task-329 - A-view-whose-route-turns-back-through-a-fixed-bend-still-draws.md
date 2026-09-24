---
id: TASK-329
title: A view whose route turns back through a fixed bend still draws
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 13:37'
updated_date: '2026-09-24 14:14'
labels:
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 570000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by TASK-328 while drawing every view of the dogfood vault: `./bin/dogfood semantic rasterize "Voice coordinator" --view "Workhorse news"` fails every time with 'Layout relationship eRYh0zYO: Route run 6 reverses through a fixed bend' (src/transformers/semantic-renderer/lib/layout/curves.ts, reversesBend). The board is valid (./bin/dogfood check reports nothing) and the whole board draws; only this view fails, so a person opening it in the browser gets the error instead of a picture. The other 33 views of the vault draw. The renderer is tuned carefully: a fix must not make other boards worse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The Voice coordinator view 'Workhorse news' draws, headlessly and in the browser
- [x] #2 One test owner reproduces the failing route shape and fails without the fix
- [x] #3 Every view of every dogfood board still draws, and the renderer's recorded scorecards are unchanged or better
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce in-process and trace the failing route through settlement, routing and label correction.
2. Root cause: fix the stage that leaves an unroundable step in the settled drawing, narrowest correct change; no guard in the curve builder.
3. Unit owner reproducing the exact route shape, failing without the fix.
4. Baseline every view and whole board of a copy of the dogfood vault on a worktree server (port 3329), redraw after the fix, compare SVGs and inspect changed pictures.
5. Gate lanes one at a time; commit.
Board proposal: none affected. The fix is inside the existing label-channel correction of the renderer and changes no drawn architecture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause: eRYh0zYO's label cannot sit on its only vertical run (x=72.56, the channel left of the card column below) inside the page's 20px quiet margin, so it is reserved. Graphviz places the reserved badge flush at the left placement margin (x=24, centre 83.56). libavoid routes through the badge's centre pins and must then step 11px left to x=72.56 to clear card AjPVQ0BZ's routing footprint: a valid obstacle-free route, but a step shorter than two fixed bends (16). The settlement's existing repair for exactly this (label-runs channelCandidate, via alignLabelRows in correctLabelChannels) proposes centring the badge on the channel (box x=13), but rejected it because it enters the 20px quiet margin; with no other candidate the invalid attempt was kept, settled, and final emission threw. Router and curve builder are behaving to contract; the correction's page bound was the gap.
Fix: the channel correction may follow its route into the quiet margin but never off the page (insidePage with margin 0 for that candidate only). Rejected alternative: widening the step to exactly 2R by moving the badge away from the channel draws, but leaves two visible S-steps on the route (measured and looked at).

Test owner: src/runtime/semantic-renderer/tests/reserved-label-channel.test.ts reproduces the settled route shape and reserved badge from the failing view and asserts alignLabelRows proposes the badge on the route's own channel inside the page; it fails on HEAD's label-runs.ts (no anchor) and passes with the fix. alignLabelRows is exported through the layout test surface for it.
Drawings: a copy of the dogfood vault on a worktree server (port 3329); every whole board and named view drawn before and after with semantic render and rasterize (49 each). Before: 48 drawn, Workhorse news failed. After: 49 drawn; the other 48 SVGs are byte-identical, only Workhorse news is new. Looked at it: the badge sits on its route's straight left channel 13px from the page edge, no jog. Browser: with a fresh frontend build, the pane draws the view (data-state drawn); with the stale pre-fix build the same pane showed the error state.
Scorecards: docs/design/wide-board-layout-fixtures/measure.ts SAVE on HEAD's code, AGAINST with the fix: all 6 fixtures and 15 vault boards unchanged. The script itself fails on main because its fixtures lack edge order; measured with a scratch copy that wraps fixtures in orderedFixture (not committed).
wide-boards.test.ts: 2-4 whole vault boards exceed their wall-clock budget while the box is at load ~24 from other workers; the same failures occur on HEAD's code, and those boards draw byte-identically before and after.

Gate (worktree, one lane at a time): type-check 0, lint 0, fmt:check 0; test:modules exit 1 with 3390 pass / 4 fail, every failure a wide-boards.test.ts whole-vault-board wall-clock timeout that also occurs on HEAD's code under the same load (~24 on 24 cores from other workers' gates), boards drawn byte-identically before and after; test:system 180 pass 0 fail; test:repository 8 pass 0 fail; test:serial-browser 18 pass 0 fail. Board proposal: none affected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Voice coordinator view 'Workhorse news' drew nothing ('Route run 6 reverses through a fixed bend'). Its reserved label was placed flush at the page margin, 11px off the only channel past the card below, so the router stepped sideways by less than two fixed bends. The settlement's existing channel correction refused to centre the badge on that channel because it enters the 20px quiet margin the route already runs in. That correction may now follow its route into the margin, never off the page (label-runs.ts). Verified: reserved-label-channel.test.ts reproduces the route shape and fails without the fix; all 49 whole boards and views of a copy of the dogfood vault draw, 48 byte-identical to before; the view draws in the browser pane; wide-board scorecards unchanged for 6 fixtures and 15 boards.
<!-- SECTION:FINAL_SUMMARY:END -->
