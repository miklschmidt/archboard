---
id: TASK-364
title: >-
  A walkthrough step about a relationship or a sequence step lights and frames
  the cards at both ends
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-28 22:55'
updated_date: '2026-09-28 23:04'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 605000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A beat that names a relationship or a sequence step shows the line or message and crops the cards at its ends, and the presentation veil fades those cards to 28% opacity. The viewer fits the camera to the union of the named subjects' atlas boxes (src/ui/semantic-board-canvas/lib/narrative.ts beatFocus), and a relationship's box spans only its route between card borders; a sequence step's box is a thin band at its row. The narration usually talks about exactly those cards: the README pull-request walkthrough (examples/web-shop, "Why checkout stops waiting") names a card plus its two relationships in two beats, and three messages with no participant in a third, so the provider, the database and every participant are cut off or faded. Authors cannot be relied on to list the ends, and the rule for views already says both ends of a shown relationship and every participant of a shown flow come with the selection. The user decided (2026-09-29) that no camera or view field goes into a beat: ADR 0023 stands, and the viewer owns this.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In an architecture picture, a presented beat that names a relationship lights both end cards (unveiled and marked as attended) and the camera frames them whole
- [ ] #2 In a sequence picture, a presented beat that names a step lights and frames its sender and receiver (one participant for a self step)
- [ ] #3 A named relationship or step the picture does not draw brings no ends with it; only named subjects are ever reported as not drawn
- [ ] #4 The consumer skill says a relationship or step comes with the parts at its two ends, so a beat names a part on its own only when that part is its subject; recipes, the worked example and the S05 evaluation inputs no longer require the part a step runs on
- [ ] #5 The narrative stage test owns the architecture and sequence cases
- [ ] #6 While a presented step veils the picture, a group region stays at full strength only when a card drawn inside it is lit (a named card or a card at the end of a named relationship or step); every other group region recedes with the rest
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Board viewer@TASK-364 adds one relationship, Drive walkthrough focus -> Resolve board meaning (call, "the ends of a named relationship or step"); no other board changes.
1. lib/narrative.ts: beatFocus takes the variant being read. For each named subject the atlas draws that is a relationship or a step (subjectOf in lib/board-document.ts), the from and to parts the atlas draws follow it into `drawn` (deduplicated), so they are lit, kept out of the veil, marked and inside the framed rect. A named subject the picture does not draw brings nothing; `undrawn` stays the named subjects only.
2. hooks/use-settled-focus.ts takes the variant; SemanticBoardStage passes reading?.variant ?? null.
3. tests/semantic-board-narrative.test.tsx owns it: a relationship-only beat lights and frames both end cards; a step beat through a data-flow view lights and frames both participants.
4. Consumer skill: sequences-views-walkthroughs.md states that a relationship or step comes with the parts at its two ends; create-sequence.md drops "with the parts they run on" from the ordering rule, its worked example and its check step; evals/evals.json S05 feature text and beatSubjectKinds {step: 2}; coverage.json row if it names the part; bun run generate:skill-artifacts.
5. docs/design/operator-canvas-shell.md presentation sentence names the ends.
6. Verify: the gate lanes, and screenshots of the web-shop PR walkthrough presented in headless Chromium against a scratch server on a free port (no re-recording, no voice files touched).

7. Group regions (user report, 2026-09-29): a region is drawn with data-group but no data-semantic-id, so the veil never dims it. Carry the members each engine already places in a region (Blocks regionRows, Track readRegions) through DrawingRegion, write them on the region element, dim regions under the veil in the renderer stylesheet, and light a region in markVeil when one of its drawn members is lit. Drawn members, not board membership: a card in two groups is drawn inside one region.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Endpoint rule built: beatFocus reads each named relationship or step through subjectOf and lights and frames its drawn ends; the hook takes the reading, so SemanticBoardStage keeps its complexity. Viewer module: 166 pass (--isolate); lint, fmt and type-check clean.
<!-- SECTION:NOTES:END -->
