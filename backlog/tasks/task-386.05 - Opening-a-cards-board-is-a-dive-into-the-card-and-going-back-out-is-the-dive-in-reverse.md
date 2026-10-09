---
id: TASK-386.05
title: >-
  Opening a card's board is a dive into the card, and going back out is the dive
  in reverse
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
updated_date: '2026-10-03 17:31'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: medium
type: enhancement
ordinal: 726000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening a card's board cuts today: the old picture grows by 14 percent while it fades for 280 ms, and the new one assembles for 760 ms. The new board does not look as if it lies inside the card that the reader chose, and going back does not look like coming out of it. Every board's picture is drawn ahead and kept in IndexedDB (TASK-341, TASK-344), so the picture inside a card is ready when the reader chooses it. A drill-down stays a drill-down: the board, the address and the history entry are what they were.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Opening a card's board flies the camera into the card while the board inside it grows from the box of the card to fill the pane, and the pane then shows that board with no jump
- [x] #2 Going back out of a board reached by a drill-down shrinks it into the card it was opened from
- [x] #3 When the board inside is not ready, or the reader asked for reduced motion, opening and going back work as they do today
- [x] #4 A press, a wheel event or a key during the dive ends it at its destination
- [x] #5 The address changes once, and Back and Forward follow the drill-down as before
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure what exists: the old way out zooms the leaving picture 14 percent about the card and fades it in 280 ms, and the new board assembles in 760 ms, so the board never looks as if it lay inside the card. Every board's picture is drawn ahead and kept, so the picture inside a card is to hand when the reader chooses it.
2. The dive is the camera's. When the reader opens a card's board, the child's picture is put inside the card on the surface, in the parent's own coordinates and scaled to fit the card, so it moves with the camera and needs no second layer. The existing glide (the van Wijk path, on the frame clock) flies the camera to the one place at which that inset stands exactly where the child stands at its fit; the parent fades out and the inset fades in on the way. At the glide's end the pane does what it always did to open the board, and the board's own picture takes over from the inset in the same commit, at the same place, with no entrance and no glide (a flag, cut, for that one arrival).
3. Going back out is the same flight reversed: the surface is first given the parent (invisible) with the child as an inset in the card, at the camera that shows the inset where the child stood, so the first frame is the frame the reader was looking at; then the camera glides to the parent's fit while the parent fades in. At its end the pane goes back, and the parent's own picture takes over the same way.
4. Pure geometry in lib/dive.ts (where the inset sits, which camera puts it at the child's place). DOM in lib/picture-dive.ts (the inset and the fades). The flight and the handing-over in hooks/use-dive.ts, which the stage calls from onOpenDown and onBack and which falls back to the old way for anything it cannot do in time: reduced motion, no card box, a picture not to hand within a moment, a pane that moved on.
5. A press, a wheel event or a key during a dive ends it at its destination and is swallowed; the picture under the dive takes no pointer.
6. The durations join EXPLORING_MS. Tests: geometry (the inset stands where the child stands, both ways); the dive hook through the stage with a stepped clock (the inset is in the card, the camera flies, the board opens at the end with no entrance, an input ends it, reduced motion and a missing picture open at once); the old way stays what it was for everything else.
7. Board proposal: Board viewer@TASK-386.05.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned, with these decisions made on the way.

The board inside the card is in the parent's units. lib/dive.ts gives the geometry (where the board sits in its card, and the camera at each end of the flight). lib/picture-dive.ts puts the board's picture inside the card and fades the two pictures. hooks/use-dive.ts runs the flights. One request is in the air at a time. A second request ends the first at once and is made the plain way, because the breadcrumb calls the way back once for each level it crosses.

hooks/use-drill-moves.ts now holds what following a drill-down and going back do. They left SemanticBoardStage.tsx, which was already over its line limit. useAutoFit takes the camera from the stage, so the flight and the fit share one camera, and a picture that a flight arrived at is fitted at once (only when the picture changes, so a walkthrough step on that board still glides). usePictureTransition puts that picture up as it is, as it does for a reader who asked for no motion.

A real browser showed two things that the module tests cannot. The surface's recede (is-probing) dimmed the board inside the card, so app.css now gives that board no filter. The picture's own near and far cards follow an is-far class on an ancestor, so the board inside the card carries is-far when it will be seen from far where the flight meets it; otherwise the cards changed at the hand-over.

Not flown, on purpose: a reader who asked for no motion, a presented walkthrough, a card the picture does not draw, a picture that is not to hand in 140 ms, and a picture that changes under the flight. A press, a wheel turn or a key (Tab and the modifier keys excepted) ends the flight at its end and goes no further. I dropped the diveHold constant: nothing needed it.

The old module tests of a card's board assumed an instant cut. semantic-board-levels now mounts with motion off, because it is about what a level reads, and the switching-boards case of semantic-board-variants is now the dive's test. The browser owner semantic-board-exploring covers the flight in both directions, the recede and the far view in Chromium. semantic-drill-boundary and shell-layout fail without this change: they wait for a drill-down slot and a render matrix that the shell no longer has.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Opening a card's board is now a flight into the card, and going back is the same flight the other way. The board's picture sits inside the card in the parent's own units. The camera glides to the one place where that picture stands exactly where the opened board stands. What the card says goes first, then the board above fades, and the board's own picture takes over in the same commit with no entrance (hooks/use-dive.ts, lib/dive.ts, lib/picture-dive.ts, hooks/use-drill-moves.ts).

The board opens the plain way, as before, when the reader asked for no motion, when a walkthrough is presented, when the card is not drawn, when the board's picture is not to hand in 140 ms, when a picture is still coming in, and when the picture changes under the flight. A press, a wheel turn or a key ends a flight at its end. A second request ends the first at once, so the breadcrumb across two levels goes back the plain way.

Verified. Module tests with a stepped clock: the flight lands within a thousandth of a pixel where the board then stands, in both directions, and each fallback and each input is held (17 tests; each guard was also removed once to see its test fail). The browser owner semantic-board-exploring, three runs in Chromium: the board lands within 2 px of its last frame, the board in the card is not receded, and a missing app.css rule makes it fail. semantic-drill-address, semantic-walkthrough-presentation, semantic-board-viewer and semantic-traffic still pass. On Archboard server, in both themes, a stepped filmstrip of the flight in and out, a key pressed mid-flight, two levels in and one out, and reduced motion. Board proposal Board viewer@TASK-386.05 adopted; the vault check reports no diagnostics.

Not caused by this task: semantic-drill-boundary, workspace-address and measured-text fail the same way on a clean checkout of the commit before it, because they look for a drill-down slot, a pane tab group and a theme token that the shell no longer has.
<!-- SECTION:FINAL_SUMMARY:END -->
