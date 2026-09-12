---
id: TASK-183.01
title: 'Draw status in the line itself, and one ring for attention'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 13:55'
updated_date: '2026-09-12 15:06'
labels: []
dependencies: []
parent_task_id: TASK-183
ordinal: 335000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first three complaints in the parent: the coloured band with a grey line, the three competing rings, and the dot painted over the words. This is presentation only — no schema field, no stored flag — and the faded band and its texture must come through untouched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Line, arrowhead and dots take the standing's ink in both grammars; the band, its texture, the line's dash and the line's weight are unchanged.
- [x] #2 The layer order is line, dots, then the opaque pill and its words, in both grammars; a removed relationship still sends no dots.
- [x] #3 A node, container, relationship or step whose reconciliation is unsettled wears a warning badge clear of its standing pin and of every word on it, and the same subject may be attended at the same time.
- [x] #4 The viewer no longer writes an inline style onto the picture to say a subject is disputed, and attention and dispute are independent states in the viewer's own model.
- [x] #5 A reader can find out in words what the warning is about, through the inspector or the standing disclosure.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make the standing's ink reachable: export `standingInk` from `lib/svg/standing.ts` (today it is private) so the line, the arrowhead marker and the dot can all ask the same question and get the same answer. The band, its dashes, its opacity and the pin are untouched.
2. `styles.ts`: `edgeAttributes(edge, palette, standing)` swaps only the stroke colour for the standing's ink, keeping `stroke-dasharray` (what sort of relationship) and `stroke-width`/`stroke-opacity` (how much attention) exactly as they are. `markerFor(weight, head, standing)` gains the standing in the marker id.
3. `document.ts`: build the arrowhead markers for every standing as well as the plain one — `ah-<head>-<weight>` keeps its id and its colour, `ah-<head>-<weight>-<standing>` is the same shape in the standing's ink. Ids stay stable so an unchanged picture draws the same bytes.
4. Both painters: pass the standing to the line and the head, colour the dots with the same ink, and re-order the group to line → dots → pill, so the words a relationship carries are never crossed by a travelling dot. A removed relationship's dots stay off.
5. The warning: a new badge in `standing.ts`, drawn in the palette's own warning ink with a distinct silhouette (not a standing pin's crossed bar, single bar or wave), sitting at the subject's top-RIGHT corner where the standing pin is at the top-left. A card, a container and a flow frame put it in the corner and shorten the words that would otherwise reach it — the box, the atlas and the page size are identical either way, which is the invariant the standing channel already holds to. A relationship and a step put it on the outside edge of their label pill, or at the label anchor when they carry no words.
6. The render contract gains one more derived, never-stored input beside `standing`: the ids the board says are unsettled. The render route already computes `waiting` for the pane, so it hands the same subjects to the renderer.
7. The viewer stops writing on the picture: `markDispute`, `DISPUTED_STYLE` and the disputed arm of `SubjectMark` go, `subjectMarks` returns attention alone, and the dispute is a fact the picture already carries. A subject that is attended and unsettled shows the ring and the badge by construction.
8. The inspector gains a section naming what a selected subject is waiting on, quoting the reconciliation's own repair line, so the badge is explainable where somebody clicked; the standing disclosure above the picture keeps listing them all.
9. Owners: a runtime owner over both grammars for the ink on line/head/dots, the layer order, the badge and its clearance; a viewer owner for attention and dispute being independent; browser visual QA in both themes and both grammars.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What changed

**One ink from end to end.** `standingInk` was private to the standing module; it is exported now and `lineColour(palette, weight, standing)` in `svg/styles.ts` is the single question the line, its arrowhead and its dots all ask. An SVG marker is painted in its own right and cannot inherit the referring line's colour, so `document.ts` emits one arrowhead per form, weight **and** standing — `ah-<head>-<weight>` keeps its old id and its old colour, so a board that is not a proposal draws the same bytes it always did. The band, its dash, its opacity, and the line's own dash and weight are untouched: a runtime owner spends every colour in the line's tag and compares it against the same line drawn with no standing, so a standing that ever took over the dash or the weight fails.

**The words over the dots.** Both painters now emit line → dots → pill. In the architecture grammar the pill was painted before the dots; in the sequence grammar the plate was too.

**One ring, and a badge for the argument.** The dispute ring is gone. `standing.ts` grew a fourth channel that is deliberately not a standing: a warning triangle in the shell's own warning ink, in the subject's top-**right** corner where the standing pin is top-left, so a changed-and-unsettled subject says both and neither mark moves. Cards, containers, exchange frames, relationships and messages all wear it — a line has no corner, so it takes it on the leading edge of its pill, or at the label anchor when it carries no words. It sits inside the right-hand padding every box already leaves, so **no geometry changed**: same page, same size, same atlas with and without it, which an owner asserts directly.

**Where it comes from.** One more derived-and-never-stored render input beside `standing`: the ids the board says are unsettled. The render route already computes `waiting` for the sentences above the picture and now hands the same subjects to the renderer — so the badge and the words are two readings of one fact.

**The viewer stopped drawing on the picture.** `markDispute`, `DISPUTED_STYLE`, `DISPUTED_DASH` and the disputed arm of the mark map are deleted; `markSubjects` takes a set of attended ids and toggles one class. The parent's seam audit was right: one map holding one mark per subject lost `disputed` whenever `attended` won, and that case is now impossible by construction rather than by ordering.

**Words for the badge.** The inspector gained a "Nobody has decided this yet" section quoting the reconciliation's own field and repair line for the selected subject, narrowed from the variant's own reconciliation. The standing disclosure above the picture still lists them all.

## Verification

- `src/runtime/semantic-renderer/tests/status-legibility.test.ts` (new owner, 12 tests). Proven red first against the old behaviour: reverting `lineColour` to the weight's ink and swapping the pill back over the dots failed "the line, the arrowhead it ends in and the dots that ride it agree", "the band behind the line is untouched" and "the last dot is painted before the first word" (3 fail / 9 pass), all green after.
- `src/ui/semantic-board-canvas/tests/semantic-board-narrative.test.tsx`: the old owner asserted the inline dashed style; it now asserts that the viewer writes no style on any halo, that the words are in the disclosure, and that the subject the argument is about is ringed while still being argued about — the both-at-once case.
- `tests/system/browser/semantic-status-legibility.test.ts` (new browser owner, registered in the lane): in a real page, on a real proposal with a real reconciliation conflict, computed styles agree across line, band, arrowhead and dots; a removed relationship keeps its own ink and sends nothing; `elementFromPoint` at the centre of a pill hits the words rather than a dot; the unsettled card is badged with nothing selected and badged **and** ringed once picked; the inspector explains it; the same holds in the data-flow view and again on the dark ground. Three consecutive runs, all pass.
- `dataflow.ts` outgrew the 600-line limit, so the shared clock moved to `lib/svg/flow-clock.ts` and `STEP_WEIGHT` to `lib/dataflow-design.ts`, where both the painter and the clock can ask one question about how heavy a message is.

## Review round one

**The layering was wrong, and the reviewer's proof was exact.** A relationship's group held its route AND its words, so two routes that crossed decided whose label a reader got to read by whichever edge happened to be drawn second. With five parts wired to every later part, `e02`'s pill sits across the route `e03` takes — 19 such crossings on that one page.

Both grammars are now drawn as two layers. `paintEdgeLine` carries a relationship's band, halo, line and dots; `paintEdgeWords` carries its pill and its warning, and every relationship's words are painted after every relationship's route (and after the cards, which costs nothing — the label pass already treats every card as an obstacle). `paintStep` and `paintStepWords` do the same for an exchange: upstream's "a stack of horizontal runs at a fixed pitch cannot reach another row's plate" was mostly true and had to be re-derived every time somebody added a self-message loop or a taller plate, so the simple rule replaces it.

Identity survives because both groups say they are the same subject, which is how the container grammar has always drawn a frame and its title. A click on the words picks the relationship out, `markSubjects` lights every group carrying the id, and a removed subject's ghosting applies to both.

**A test helper was hiding it.** `routePoints` kept the last group it saw per id, which became the words group — so every route came back as an empty list and `routeCrosses` could never find anything. Groups with no path in them are skipped now. Before that fix the reviewer's own fixture reported zero crossings; after it, 19.

**The light warning was too weak.** `#d29a1e` measured 2.51:1 against a white card, 2.12:1 against the region ground and 2.30:1 against its own knocked-out mark. The light ground now takes the shell's own `--warning-foreground`, `#6e4a00`: 7.95:1 against a card, 6.72:1 against the band, 7.29:1 for the mark. Dark keeps `#d29a1e` (6.13:1 on a card). The owner no longer pins a hex — it measures contrast, so a future retune that weakens the badge fails.

**The inspector's list had a duplicate key.** One subject can hold two `reference-lost` disagreements with no field — a relationship whose predecessor took both endpoints away — so the key is now kind, field and repair. Owned by extending the inspection owner: two such issues on one relationship, asserting both are rendered and that React logs no duplicate-key complaint. Red on the old key, green on the new.

## Verification of this round

- `status-legibility.test.ts` now holds the page-wide order for both grammars plus the reviewer's five-part fixture, and asserts a crossing really exists before asserting it passes under the words. Red-first: painting the words layer before the routes fails both order tests and the crossing test.
- `standing.test.ts`'s "marks a relationship's label along with its line" now reads both of a relationship's groups: two groups, one of them holding the words, both carrying the standing and the ghosting.
- The browser owner asks the browser: every `circle.ab-pulse` on the page precedes the pill in document order (`compareDocumentPosition`), and `elementFromPoint` at the pill's centre hits the words. Both grammars, both grounds.
- `dataflow.ts` outgrew 600 lines again, so a participant's column of time moved to `lib/svg/flow-columns.ts`.
- Full gate after the round: `bun run check` → exit 0, 2924 passing (2746 module / 271 files, 155 system, 8 repository, 15 browser files). Log `/tmp/claude-1001/gate-183c.log`.

## Reviews and visual QA closed

Renderer review closed after the layering, helper and contrast fixes; the focused owner passes 14 of 14. Visible QA confirmed, on both grounds: an architecture and a mixed-status sequence drawn in green, amber and red through line, arrowhead and dots, with the faded bands kept and the label plates opaque over them; a changed message's dots `#dda24a`, an added message sending two `#4ec98c`, a removed one sending none; clicking "enqueue it" inspecting the right message ("2 of 4"); and the Writer card carrying its selection ring, its warning badge and its changed border at once, with the group colour right. The duplicate-key repair is closed.

## What the runtime owners actually cover

Stated exactly, because the picture's marks are easy to over-claim. `status-legibility.test.ts` asserts the warning badge on a **card**, on a **relationship that carries words**, on a **relationship drawn for context** (removed, no words, so the badge falls back to the label anchor), on an **exchange frame**, and on a **message** — the three drawn shapes of the architecture grammar and the two of the sequence grammar, with the unbadged subjects on the same page asserted bare. An **architecture container** is painted by the same `warningBadge` call on the container's title layer and is held only by types and by that shared call: it has no runtime owner of its own, and no fixture — demo or otherwise — is standing in for one. Worth one more case if a reviewer wants it owned rather than derived.

The layering, the ink agreement, the contrast floors and the no-overlap clearance are all runtime assertions over real renders; the browser owner adds the one thing a render cannot answer — what a browser paints on top and what a pointer finds over a pill.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A relationship is drawn in one ink end to end — line, arrowhead and travelling dots take the standing's colour, with the faded band, its texture, the line's dash and the line's weight all untouched — and the words a relationship carries are painted over its dots in both grammars. The three competing rings are one ring: a selection halo for what a person or a walkthrough is attending to, the subject's own border for how it stands, and a new warning triangle in the opposite corner for a reconciliation nobody has decided, drawn by the renderer from the reconciliation the pane's own sentences come from. The viewer no longer writes an inline style onto the picture, so attention and dispute are independent by construction rather than by ordering, and a selected disputed subject shows both. Verified by a new runtime owner proven red against the old behaviour, a rewritten viewer owner, and a new browser owner that checks computed inks, hit-testing under the pill, both grammars and both grounds in a real page.

Reviewed twice. The first round found the layering only held inside one relationship's group, so a later route painted over an earlier label at a crossing: both grammars now draw routes and words as two layers, words last, identity carried on both groups. It also found the light warning ink too weak to read (2.5:1 on a card) and a duplicate React key where one subject holds two endpoint disagreements; both fixed, and both now owned — contrast is measured rather than pinned, and the key is watched through React's own complaint. Closed with visible QA green on both grounds and both grammars.
<!-- SECTION:FINAL_SUMMARY:END -->
