---
id: TASK-224
title: Comparison overlay routes an added edge through a removed node's ghost card
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 12:16'
updated_date: '2026-09-15 13:11'
labels:
  - renderer
dependencies: []
references:
  - evals/fixtures/S02.json
  - evals/fixtures/S06.json
  - .skill-evals/2026-09-15T03-21-37-188Z/report.md
priority: high
type: bug
ordinal: 384000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In a comparison rendering (a proposal drawn against its predecessor), an edge added in the proposal is routed straight through the dashed ghost card of a node the proposal removed, crossing the ghost's name and responsibility text. The skill-evaluation batch .skill-evals/2026-09-15T03-21-37-188Z failed every S02 and S06 run in both arms (12 of 12) on this one defect, so it is a property of the renderer and the fixture, not of the authoring skill, and it blocks the visual verdict of every scenario built on the Local stacks -> Context variables comparison. Shape that reproduces it (evals/fixtures/S02.json): a variant with Request context, App context and two stack nodes each receiving a push / pop call, branched into a draft that removes both stacks and adds one Context variables node receiving a set / reset call from each context; rendering the draft through the Contexts view against the current variant draws the Request context -> Context variables edge horizontally through the removed Request context stack ghost (or, depending on the run, through the App context stack ghost). Reference captures: .skill-evals/2026-09-15T03-21-37-188Z/runs/candidate/S02/1/captures/capture-1-contexts-proposal.png and .skill-evals/2026-09-15T03-21-37-188Z/runs/candidate/S06/1/captures/capture-0-contexts-current.png. Likely area: ghost geometry taken from the predecessor layout (src/runtime/semantic-renderer/lib/layout/compound-predecessor.ts) is not an obstacle when the added edges are routed, but that is a hypothesis to verify, not a plan.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An edge added in a comparison never crosses a removed node's ghost card or its text; a renderer test with the S02 fixture shape (two removed nodes, one added node, two rewired edges) asserts no route crosses a ghost using tests/drawn-routes helpers
- [x] #2 Rendering the S02 and S06 fixtures' comparison through the Contexts view and rasterizing it shows both set / reset edges reaching Context variables without passing through either ghost
- [x] #3 Existing drawn-route and skipped-connection tests still pass and the change does not move cards in a comparison that has no added edges
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: the new Context variables card is seeded beside its dependencies in the row of a removed stack; its incoming skip from Request context is a west-flank route (sidesOf: distance 2, so WEST/WEST) whose approach runs along that row through the ghost. Fix in lib/layout/compound-flanks.ts: once every card is seeded, a WEST/WEST skip whose approach would cross a seeded card that is neither endpoint nor a frame around one is reseated as SOUTH/NORTH and the engine routes it between rows; compound-predecessor.ts collects the seeded boxes, nodes and port owners for it. Reproduced and verified with a renderer-only script on the S02 shape (before: e5 through the App context stack ghost; after: no route crosses any card, picture rasterized and inspected). tests/comparison-approach.test.ts holds it. Renderer suite 167 pass with the same 3 pre-existing failures as the unpatched tree; server proposal-drawing tests pass; lint and fmt green. Design note updated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A skip whose west-face approach would run through a seeded card is now routed as a descent between rows, so an added relationship no longer crosses a removed node's ghost in a comparison. Verified with a new renderer test on the S02 shape, the renderer and proposal suites, and a rasterized picture.
<!-- SECTION:FINAL_SUMMARY:END -->
