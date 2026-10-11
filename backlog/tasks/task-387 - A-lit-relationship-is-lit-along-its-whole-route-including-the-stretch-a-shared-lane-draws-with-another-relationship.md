---
id: TASK-387
title: >-
  A lit relationship is lit along its whole route, including the stretch a
  shared lane draws with another relationship
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 18:48'
updated_date: '2026-10-03 19:01'
labels:
  - frontend
dependencies: []
references:
  - docs/adr/0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md
  - src/transformers/semantic-renderer/lib/svg/crossings.ts
priority: high
type: bug
ordinal: 727000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reader picks a card and the picture lights the card's relationships, but a relationship is lit only up to the first junction on its way from the card. Beyond it the line looks receded. Measured on 2026-10-03 on the Archboard board: with Repository checkout picked, the line that resolves code targets from Archboard server is bright from the card to the junction dot, then pale for the rest of the way to the server. The cause is in the picture, not the light: where routes of one kind lie on one line, the renderer has the heaviest (then the earliest) draw the stretch once and cuts it out of the other routes with a mask, so a trunk reads as one line. The viewer lights by relationship, so the stretch of a lit route that another route draws is that other route's ink, and it recedes with it. The viewer must show a lit relationship along its whole route without the renderer's output changing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A relationship that is lit shows its line along its whole route, from its source to its target, including a stretch of a shared lane that the picture draws with another relationship's line
- [x] #2 A relationship that is not lit still recedes past the junction where the lit one parts from the shared lane
- [x] #3 A crossing's gap on a lit line, a selected relationship and a presented step's veil are drawn as before
- [x] #4 semantic render and semantic rasterize write the same bytes as before
- [x] #5 It is seen working on the Archboard board with Repository checkout picked, at 1920x1080, in both themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measured on the Archboard board, Repository checkout picked: the lit route from Archboard server to it is bright from the card to the first junction and pale from there to the server. The route's own path runs the whole way, but its group carries a mask that cuts out the stretch another route of the trunk draws (the renderer's trunk cutouts, crossings.ts), so on that stretch the only ink is the other route's, which is receded. Hiding the other route showed the lit route paints nothing there.
2. The viewer lights by relationship, so it must give a lit route its ink back on that stretch. New lib/lit-ink.ts, lightInk(root): for each relationship line group that has a mask, is lit and is not the selected one, point it at a copy of its mask without the trunk cutouts (the black paths with butt caps; crossing cutouts have round caps and label cutouts are rects), and give a group that is no longer lit its own mask back. The copy sits beside the original, once per picture, under the id of the original plus -lit. use-viewer-marks.ts runs it after the marks it reads (selection, veil).
3. Not chosen: mask none on a lit group, which loses the gap at a crossing and reads as a join; lighting the route that draws the stretch, which lights its branch too; a change to the renderer, which changes every export.
4. Tests: lit-ink through the module's lighting entrypoint; the stage with a picture that has a trunk; the renderer owner pins that trunk cutouts have butt caps and crossing cutouts round caps, which the viewer depends on; the browser owner semantic-board-exploring checks on a real board that a lit route's ink is not cut at its trunk stretch.
5. CONTEXT.md (Light) and ADR 0042 say that a lit relationship is lit along its whole route.
6. Board proposal: Board viewer@TASK-387.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: the renderer draws a trunk once. Where routes of one kind lie on one line, the heaviest (then the earliest) draws the stretch and the others have it cut from their group by a mask (trunkCutouts in crossings.ts). The viewer lights by relationship, so the stretch of a lit route that another route draws was that route's receded ink. Measured on the Archboard board with Repository checkout picked: the lit route's pixels along the shared stretch were pale (BAE5E1) with the other route hidden too, and vivid (46BDB4) once the cutout was lifted.

Fix: lib/lit-ink.ts. A lit relationship that is not the picked one is pointed at a copy of its mask without the trunk cutouts, kept beside the original under the original's id plus -lit. The cutouts for a crossing stay, because a gap is what tells a crossing from a join, and so do label cutouts. A picked relationship keeps the picture's own rule (.is-selected[mask] draws it in full). The renderer's output does not change; it tells the two kinds apart by their caps (butt for a trunk, round for a crossing), and a new renderer test holds it to that.

Where it runs: use-viewer-marks.ts, in the two effects that set the marks it reads (attention and the veil), so a presented step's veil gets the same treatment as a poke. The light's traffic layers are separate groups and are not masked, so they needed nothing.

Not chosen: mask none on a lit group (a lit line then crosses another with no gap and reads as a join), lighting the route that draws the stretch (it lights that route's branch too), and a change to the renderer (it changes every export).

Known and left alone: where several lit dashed routes share a trunk and start from different places, their dashes now overlap on the shared stretch, because each draws its own. The picture does the same for a picked route.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A lit relationship is now lit along the whole of its route. Where the picture has another relationship draw a stretch of a shared lane, the lit route is pointed at a copy of its mask without the cutout for that stretch (lib/lit-ink.ts, run from use-viewer-marks.ts), so its own ink shows there. The gap under a crossing line, a label's cutout and the picture's rule for a picked route stay as they were, and the renderer's output is unchanged.

Verified. Seven module tests of the mask surgery and two stage tests with a picture that has a trunk (each guard was removed once and its test failed). A renderer test pins the caps that tell a trunk's cutout from a crossing's gap. The browser owner semantic-board-exploring now builds a fan-out board, picks a card whose line the picture cuts for a trunk, and checks the browser paints that line whole; it fails when the light is taken out. On the Archboard board with Repository checkout picked, at 1920 by 1080 in both themes, the line from Archboard server is lit all the way and the line to Board vault stays receded past the junction. The module run, with the renderer's own tests, fails only on the twelve tests that failed before, and the browser owners for drill addresses, walkthroughs, groups, claims, traffic and the viewer pass. Board proposal Board viewer@TASK-387 adopted; the vault check reports no diagnostics.
<!-- SECTION:FINAL_SUMMARY:END -->
