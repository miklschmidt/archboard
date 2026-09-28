---
id: TASK-364
title: >-
  A walkthrough step about a relationship or a sequence step lights and frames
  the cards at both ends
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 22:55'
updated_date: '2026-09-28 23:19'
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
- [x] #1 In an architecture picture, a presented beat that names a relationship lights both end cards (unveiled and marked as attended) and the camera frames them whole
- [x] #2 In a sequence picture, a presented beat that names a step lights and frames its sender and receiver (one participant for a self step)
- [x] #3 A named relationship or step the picture does not draw brings no ends with it; only named subjects are ever reported as not drawn
- [x] #4 The consumer skill says a relationship or step comes with the parts at its two ends, so a beat names a part on its own only when that part is its subject; recipes, the worked example and the S05 evaluation inputs no longer require the part a step runs on
- [x] #5 The narrative stage test owns the architecture and sequence cases
- [x] #6 While a presented step veils the picture, a group region stays at full strength only when a card the board places in that group inside that container is lit (a named card or a card at the end of a named relationship or step); every other group region recedes with the rest
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Board: Board viewer@TASK-364 adds one relationship, Drive walkthrough focus -> Resolve board meaning (call, "the ends of a named relationship or step"); no other board changes.
1. lib/narrative.ts: beatFocus takes the variant being read. For each named subject the atlas draws that is a relationship or a step (subjectOf in lib/board-document.ts), the from and to parts the atlas draws follow it into `drawn` (deduplicated), so they are lit, kept out of the veil, marked and inside the framed rect. A named subject the picture does not draw brings nothing; `undrawn` stays the named subjects only.
2. hooks/use-settled-focus.ts takes the variant reading and passes its variant on; SemanticBoardStage hands it the reading, so the component gains no branch.
3. tests/semantic-board-narrative.test.tsx owns it: a relationship-only beat and a message-only beat each light and frame both ends exactly as a beat naming the ends too; a relationship the picture does not draw lights nothing. The presentation helpers move to tests/presentation-probes.ts beside camera-probes.ts.
4. Consumer skill: sequences-views-walkthroughs.md states that a relationship or step comes with the parts at its two ends; create-sequence.md drops "with the parts they run on" from the ordering rule and Setup block from its worked example; evals/evals.json S05 feature text and beatSubjectKinds {step: 2}; the coverage.json row; bun run generate:skill-artifacts.
5. docs/design/operator-canvas-shell.md presentation sentence names the ends and the group regions.
6. Verify: the gate, and the web-shop PR walkthrough presented in headless Chromium against a scratch server on a free port (no re-recording, no voice files touched).
7. Group regions (user report, 2026-09-29): a region was drawn with data-group and no data-semantic-id, so the veil never dimmed it. drawingOf (blocks/index.ts, the one assembly every engine feeds) gives each DrawingRegion the members the board places in its group inside its container (isMemberOf, same parent); paintRegion writes them as data-members; the veil stylesheet dims [data-members]; markVeil lights a region while one of its members is lit. Board membership, as groups.ts reads it, rather than per-engine placement.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Endpoint rule built: beatFocus reads each named relationship or step through subjectOf and lights and frames its drawn ends; the hook takes the reading, so SemanticBoardStage keeps its complexity. Viewer module: 166 pass (--isolate); lint, fmt and type-check clean.

Verification: narrative stage tests (relationship and message cases each light and frame both ends exactly as a beat naming them; an undrawn relationship lights nothing; a region stands only with a lit member); group-regions renderer test (each region lists the cards its group places in its container, Track and Blocks); skill-evaluation and install-targets tests (239 pass); bun run check exit 0 (3901 tests, 0 fail). Browser: the web-shop PR walkthrough presented in headless Chromium on a scratch server (port 3411, own state dir). Step 2 lit Place order, Payment provider and Orders DB with both relationships, the Payments region round Payment provider at opacity 1 and the other regions at 0.28; step 4 (data-flow view) lit all five participants of its three messages; step 5 kept Fulfilment lit through Order events, an end of "publish order paid". Board viewer@TASK-364 adopted as version 15; ./bin/dogfood check: 0 diagnostics. Not changed on purpose: a container frame is its own subject and still recedes while a card inside it is lit; the voice already names a relationship by its ends, so narration is unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A presented walkthrough step that names a relationship or a sequence step now lights and frames the cards or participants at both of its ends, read from the board (narrative.ts beatFocus through subjectOf), and group regions recede under the veil unless a lit card is a member the board places in that group inside that container (renderer writes data-members from board membership; markVeil lights the region). The consumer skill tells authors the ends come with a relationship or step, and the sequence recipe and S05 inputs no longer require naming the part. Verified with the narrative and group-region tests, the full gate, and the README pull-request walkthrough presented in headless Chromium.
<!-- SECTION:FINAL_SUMMARY:END -->
