---
id: TASK-372
title: >-
  A flow reads cleanly when a walkthrough lights it and when a comparison marks
  it
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 03:02'
updated_date: '2026-09-29 03:33'
labels:
  - renderer
  - viewer
dependencies: []
priority: high
ordinal: 658000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report 2026-09-29: flows (the data-flow grammar, drawn as sequence diagrams) look bad when a walkthrough highlights them and when a comparison marks them. Measured on examples/web-shop. Compared (Web shop@Queued fulfilment, view Place an order): every changed or removed message wears a tinted dashed swipe under its line and a dashed rule round its label, a reply adds its own dash on top, and the whole frame takes a dashed amber outline. The page reads as a column of dashed boxes. An added flow (Fulfil a paid order) marks every message, every label and the frame green, which says one fact many times. Presented (beat 4 of Why checkout stops waiting, and beat 2 of How an order is placed today): each lit participant gets a ring round its card and a tall ring round its lifeline, each lit message becomes a thick cobalt bar over the standing swipe, and the camera cuts the outer columns through their labels. The fix belongs to the renderer and the viewer. No board data changes (ADR 0023).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a compared flow, a message that is added, changed or removed is marked once, on its own row, in the standing's shape and ink; no message has a swipe under its line or a dashed rule round its label
- [x] #2 A flow's own standing is marked on its frame without re-marking the whole frame outline, and a message inside an added or removed flow carries no mark that only repeats its flow's standing
- [x] #3 A selected or presented message, and a selected or presented participant, is marked without a ring round the lifeline and without a band that hides the message's line or head
- [x] #4 A presented beat on a flow shows the whole flow when that costs little magnification, so no column is cut through its words
- [x] #5 The renderer and the narrative stage tests own the new rules, and the web-shop walkthroughs and comparisons are checked in headless Chromium in both themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Boards: no board is affected. The row marks (flow-rows.ts) and the message words (flow-words.ts) split internals of the Sequence painter node on Semantic renderer; the camera context stays inside Drive walkthrough focus and Control camera on Board viewer; no part or relationship is added, removed or rewired.
1. Comparison in a flow (renderer): a message that moved is marked on its row only: a tinted band across the frame behind the row (rows tile, so neighbours join into one band) and the standing pin in the frame's left margin, under the flow's own pin. Its line and head keep the standing ink and a removal stays ghosted. Drop the swipe under a message, the dashed rule on its plate, and the standing ink on a lifeline. A note's plate takes its row's tint.
2. A flow's standing is its corner pin; the frame keeps its own rule. A message inside an added or removed flow draws no row mark and no standing ink (markedWithin), while its group still states its real standing.
3. Selection and presentation (renderer): a lifeline and its bars are traced in the selection ink by hidden halos, replacing the strip halo that drew a capsule; a message gets a crisp trace in the selection ink with a lit arrowhead marker over a softer glow, and its plate gets a lit rule. The viewer carries every halo path of a line through a picture transition (picture-lines.ts).
4. Camera (viewer): a focus fit target may carry a context rect; cameraFor shows the context when it fits at 80% or more of the focus scale. beatFocus gives the frame of the flow that holds the focus as context.
5. Owners: sequence-marks.test.ts (row marks, frame pin, flow added whole, removed step, solid plates, four standings without colour, selection traces); semantic-board-flow-framing.test.tsx (whole flow when cheap, subjects when the flow is far wider). Update step-notes and standing tests that read the old swipe.
6. Docs: operator-canvas-shell.md presentation paragraph, NOTICE.md comparison bullet, standing.ts vocabulary comment.
7. Verify: bun run check, and the web-shop comparisons and walkthroughs in headless Chromium in both themes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification: sequence-marks.test.ts (row marks tile the frame with one pin in the margin under the flow's own; plates carry no standing rule; the frame keeps its rule; a flow added whole draws no row mark or standing ink; four standings apart without colour; a selected lifeline and its bars are retraced by halos of the same geometry; a selected message has a trace on its own line with a head in the selection ink and a lit plate rule); semantic-board-flow-framing.test.tsx (a step about part of a flow is framed exactly as the whole flow when the frame fits at 80% of the focus scale, and closer when the flow is three times wider; the first test fails with the rule off). bun run check exit 0: 3716 module tests, 182 system tests, repository and serial browser lanes green. Browser: scratch server on port 3431 over examples/web-shop plus three dogfood boards, frontend rebuilt, headless Chromium at 1920x1080. Compared Place an order on Queued fulfilment and Event-sourced orders read as diff hunks in light and dark; Fulfil a paid order (added whole) shows only the frame pin and the new participants. Beat 4 of Why checkout stops waiting and beat 2 of How an order is placed today now show the whole flow, cobalt dashed lifelines, cobalt traced messages with cobalt heads and lit plates, and no capsules, in both themes. Not changed on purpose: architecture lines keep their swipe and cobalt halo band; a flow's frame header still recedes under the veil, as containers do.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Flows now read cleanly when compared and when presented. A compared message is marked once on its row, the way a diff marks a line: a tinted band across the frame (neighbouring rows join) and the standing pin in the frame's margin, with the line in the standing ink and a removal ghosted; the swipe, the dashed plate rule, the lifeline ink and the frame outline are gone, and messages of a flow added or removed whole carry no repeated mark. Selected or presented, a lifeline and its bars are traced in the selection ink instead of ringed as a capsule, and a message gets a crisp trace with a lit arrowhead and a lit plate rule over a soft glow. A walkthrough step about part of a flow shows the whole flow when that costs at most a fifth of the magnification, so no column is cut through its words. Verified with sequence-marks and flow-framing tests, bun run check (exit 0), and the web-shop comparisons and walkthroughs in headless Chromium in both themes.
<!-- SECTION:FINAL_SUMMARY:END -->
