---
id: TASK-386.03
title: >-
  The selection tab lists a part's connections, and reach lights what depends on
  it
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
updated_date: '2026-10-03 16:22'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: medium
type: enhancement
ordinal: 724000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The selection tab already lists a picked part's relationships as Sends to and Receives from, and a click on a row picks the part at the other end (DetailsPanel, brought in with the prototype picks). Three things are missing. Pointing at a row does not show where its line runs on the picture. Following a row can leave the part it picks out of view, because only a panel laid over the picture ever moves the camera. And nothing answers the question that comes after "what is it wired to": how far does a change to it reach? The first two make the list and the picture one thing, and a person can walk the architecture from either. The third is a wave across the picture that shows its depth at a glance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Pointing at or focusing a relationship row in the selection tab lights that relationship and its two parts on the picture, as lightly as a resting pointer does
- [x] #2 Choosing a row picks the part at the other end and moves the camera once, just far enough to show both parts when they are not both in view, and moves nothing when they are
- [x] #3 Two controls light everything the part depends on, or everything that depends on it, hop by hop with the nearest strongest, and each says how many parts that is
- [x] #4 Every new control is reachable from the keyboard, has an accessible name and state, and honors reduced motion
- [x] #5 A sequence view keeps the selection tab it has
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Peek. A row of the Relationships section lights its relationship and its two parts on the picture while it is pointed at or focused. A small context (components/Peek.tsx), provided by the stage over the picture and the sidebar, carries what is peeked and what is traced from the sidebar to the picture; it holds nothing else.
2. Reveal. When the pick changes by anything but a click on the picture (a row of the list, the part search, an agent), the camera glides once, just far enough to bring the new part into view, and the part the reader was on with it when the two are wired together. Pure arithmetic in lib/reveal.ts; the hook (use-reveal.ts) decides who picked. Nothing moves when the parts are already in the comfortable area of the viewport.
3. Reach. lib/reach.ts walks the relationships from a part (and what it holds) in one direction: onward along what it sends to, or back along what sends to it. Each part and relationship gets the number of hops it is from the part. The Relationships section gets two toggles, Trace onward and Trace back, each saying how many parts that is. A traced direction lights what the pick lights and, beyond it, each further hop at a lower strength: is-reach-2 and is-reach-3 (and beyond) in app.css, which fade in one hop after another by transition-delay, so the trace spreads outward. The lines of each new hop are drawn on in turn.
4. The sidebar-only states stand down with the pick: a trace belongs to the part it was asked of.
5. Tests: reach.test.ts and reveal arithmetic tests; stage tests for peek, for reveal (moves when out of view, stays when in view, includes the wired part), and for the trace (levels, counts, toggling off); the narrative and group stand-downs keep holding.
6. Board proposal: Board viewer@TASK-386.03.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope. DetailsPanel already listed Sends to and Receives from with a click to pick the other part (the prototype picks), so this task adds what was missing: a row lights its line, a pick from outside the picture is brought into view, and a trace shows how far a part reaches. The description and criteria were rewritten to say so before the work started.
Measured in headless Chromium at 1920x1080 on Archboard server (dark): Board write routes offers Trace onward 15 and Trace back 16 (the board is densely cyclic, so most of it is reached; the number is the truth of the board). Asking for the onward trace grades 11 subjects is-reach-2, 14 is-reach-3 and 43 is-reach-4, starts 25 sweeps staggered one reach hop (110 ms) apart, and a filmstrip of the animations seeked to 0, 140, 300, 520 and 900 ms shows the light spreading outward from the part, nearest strongest, and settling at 900 ms.
Decisions. A row, a trace and the camera's reveal share one small context (Peek) provided by the stage over the picture and the sidebar, which are siblings; it holds nothing else and resets when the pick changes, so a trace belongs to its part. The reveal needs no notion of who picked: a part picked from the picture is in view, and in-view parts move nothing (with 6 px of slack), so only picks from elsewhere ever move the camera; it stands aside while a walkthrough is presented or a panel floats over the picture, because those already own the camera. A trace is a walk along the relationships the board states and implies nothing about traffic. The reach grades are CSS classes with transition-delay by hop, so the wave is the browser's own and honors reduced motion by the media query that already removes the recede transition.
Validation: tests/reach.test.ts (walks, cycles, containers, counts), tests/reveal.test.ts (nothing in view moves, minimal move, both when they fit, the last alone when not, centring), tests/semantic-board-reach.test.tsx (a row lights its relationship and gives the pick back, focus does too, trace onward and back with counts and grades, a trace goes with its part, no trace for nothing reached, the reveal glides once for a far part and moves nothing for a near one). bun test over src/ui passes except the 10 drill-down tests, the pane-news and navigator-tree tests that fail on a clean HEAD. Type-check is clean and lint is clean for the files this task adds; DetailsPanel lost one of its nine baseline findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The list and the picture are now one thing. Pointing at or focusing a relationship row lights its line and its two parts, choosing a row brings the part at the other end into view with one glide (and moves nothing for a part already in view), and two controls trace how far a part reaches, onward or back, lighting each further hop more faintly and one hop after another. Verified by new arithmetic and stage tests, a filmstrip of the wave and counts on the densest board, and the unchanged UI lane. Board proposal Board viewer@TASK-386.03 adopted.
<!-- SECTION:FINAL_SUMMARY:END -->
