---
id: TASK-185
title: Give a route room to turn as well as room to point
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 18:26'
updated_date: '2026-09-12 19:31'
labels: []
dependencies: []
type: bug
ordinal: 342000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two reader screenshots, one geometry budget. The endpoint fix in TASK-184.01 reserved twelve units of dead-straight line before a route's first and last turn, but the router still allocates exactly twelve units between a card's face and the nearest track, so that turn rounds with nothing left over and comes out square (node_modules/.cache/archboard-review/square-bends.png). The same blindness shows in the labels: a gap's depth is budgeted for the lines that cross it and not for the pills those lines carry, so where two arrows run in opposite directions through a short gap the second pill cannot sit anywhere on its own line and is pushed clear of the wire it names (node_modules/.cache/archboard-review/detached-label.png). Both are the router allocating room for one thing a drawn route needs while ignoring another. The canvas is infinite: spacing may grow where there is a real need, and neither the straight reservation nor the rounding cap may be weakened to fit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every turn of every drawn route on real boards rounds visibly: no endpoint-adjacent corner comes out with a zero or near-zero radius
- [x] #2 The twelve units of straight approach and the square side-normal direction at both endpoints, proven in TASK-184.01, still hold everywhere
- [x] #3 Every label pill sits on the route it names, or visibly attached to it, including where two arrows run in opposite directions through a short gap
- [x] #4 No pill overlaps another pill, a card or a band header, and no pill is placed by moving it off its own wire
- [x] #5 The room comes from the router's own allocation, not from capping a radius, shortening an approach or relaxing a clearance
- [x] #6 Both grammars and both themes hold, measured on the actual render path over every board of an isolated vault
- [x] #7 Visible QA on the two reported cases and the full gate pass at exit 0
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Both strands implemented and verified together on one source tree; nothing committed, awaiting parent review.

Full gate, isolated (ARCHBOARD_VAULT unset, XDG_STATE_HOME=/tmp/claude-1001/gate-185-state): GATE EXIT=0, zero (fail), zero script errors, 2953 passing — the 2943 of the last gate plus the ten new owners. Log: /tmp/claude-1001/gate-185.log.

Measured over every architecture variant of an isolated demo vault, both themes, 294 renders: 294 turns with none square and a minimum radius of 8, and 158 label pills with none off its own line. Data-flow views measured separately and unchanged: no turns at all, and every message's words the same five units above their own line.

Visible QA in a real browser on the demo (127.0.0.1:3200, isolated scratchpad vault): archboard/pipeline shows the reported corners rounded with the heads still square on straight line (node_modules/.cache/archboard-review/square-bends-fixed.png), and motion-clock shows 'the drawing' and 'asks' each sitting on its own line (node_modules/.cache/archboard-review/detached-label-fixed.png).

Page-size cost of both changes together: largest board 1658x950 -> 1662x978; motion-clock 428x368 -> 428x375; six of sixteen variants unchanged.

Second gate after the review fix, isolated (ARCHBOARD_VAULT unset, XDG_STATE_HOME=/tmp/claude-1001/gate-185b-state): GATE EXIT=0, zero (fail), zero script errors, 2954 passing. Log: /tmp/claude-1001/gate-185b.log. QA images refreshed from a real browser on the restarted demo: node_modules/.cache/archboard-review/detached-label-fixed.png and square-bends-fixed.png.

Third gate, isolated (ARCHBOARD_VAULT unset, XDG_STATE_HOME=/tmp/claude-1001/gate-185c-state): GATE EXIT=0, zero (fail), zero script errors, 2956 passing. Log: /tmp/claude-1001/gate-185c.log. QA images refreshed: node_modules/.cache/archboard-review/detached-label-fixed.png (both heads visible, each pill on its own wire) and square-bends-fixed.png.

Fourth gate, isolated (XDG_STATE_HOME=/tmp/claude-1001/gate-185d-state, ARCHBOARD_VAULT unset): GATE EXIT=0, zero (fail), zero script errors, 2956 passing. Log: /tmp/claude-1001/gate-185d.log. Demo restarted on the final source (pid 1488961); dark-theme QA of the reported pair at node_modules/.cache/archboard-review/detached-label-fixed-dark.png.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two reader screenshots, one geometry budget: the router was allocating room for one thing a drawn route needs while ignoring another. A turn beside an endpoint now has room to round because the clearance beside a card is the approach plus the smallest visible radius rather than the approach alone; and a label belongs to one line visibly because a face's port pitch, the snap, the gap's depth and the settler all account for the pill the line carries.

Verified by measuring drawn pages over an isolated demo vault, both themes, 294 renders: no square turn, minimum radius 8, and all 158 pills on the line they name with none across a line they do not. Ten runtime owners in route-approach.test.ts and route-labels.test.ts, each proven red against the exact line that fixes it. Visible QA in Chrome on both reported cases in both themes, accepted by the parent's independent reviewer: THREE_WAYS covers nothing, motion-clock's labels are distinct with full arrowheads, archboard/pipeline's approaches are rounded. Full gate isolated: GATE EXIT=0, zero failures, 2956 passing (/tmp/claude-1001/gate-185d.log).

What is claimed is those cases and every board of the vault, not every arrangement a board can hold. Preserved in the notes: a pill can still lie across a parallel run when the two travel a corridor instead of crossing a gap, two labelled branches of one stem share a departure port by design, and a label wider than its own run still overlaps its arrowhead. All three are pre-existing and none is the reported bug.

Page-size cost of the whole change: the largest board 1658x950 -> 1660x968, motion-clock 428x368 -> 428x390, six of sixteen variants unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->
