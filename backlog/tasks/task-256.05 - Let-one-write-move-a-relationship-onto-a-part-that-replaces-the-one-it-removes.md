---
id: TASK-256.05
title: Let one write move a relationship onto a part that replaces the one it removes
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:40'
updated_date: '2026-09-17 19:01'
labels: []
dependencies: []
references:
  - src/runtime/semantic-board-store/lib/edit-content.ts
  - skills/archboard/references/edit.md
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 455000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
planRemovals (src/runtime/semantic-board-store/lib/edit-content.ts:86-103) takes every relationship touching a removed node off the board before stated relationships are applied, and edgeId (:329-340) then refuses a stated id that is no longer there, with a message that describes a typo: "there is no relationship X on this variant to replace. Leave the id out to add a new one". So the move a proposal is made of — remove the parts, add the part that replaces them, and point the relationships that landed on the old parts at the new one — cannot be one write. The module's own header (:19-26) states the opposite doctrine: "Removals resolve against the board as it stood, additions apply on top, and the only thing that has to hold is what is left at the end". The edge cascade is the one check never moved to the end; flows (NODE_IN_FLOW) and walkthroughs (SUBJECT_IN_WALKTHROUGH) already judge there, so this is one bug, not a family.

The two runs that hit it are not the same case, and the fix must get both right. Candidate S02 r2 restated edge Q6aQBVI5 changing only its `to` — a textbook continuation under variants.md:42-43, "One difference keeps the id: a clarified label, or the same labelled call now landing on a new node" — and must be accepted. Baseline S02 r3 restated dwt4Tu8d changing `to` AND `label`, which is a replacement by the same rule; after the fix it should meet EDGE_IDENTITY_REUSED (edge-identity.ts:53), the refusal that names the changed fields and says what to do, not UNKNOWN_EDGE.

Nothing noticed the identity loss. Both runs recovered by dropping the id and minting a new one — the deletion-and-addition CLAUDE.md's identity invariant exists to prevent — and both writes answered with no warnings at all. The ids-stable guardrail passed in both: reAddedRelationships (guardrails.ts:69-113) compares endpoints by node NAME, and the old and new `to` differ; identityViolations only compares variants present in the pre-run snapshot, which a freshly branched draft is not. The RELATIONSHIP_REPLACED notice cannot fire either — sameUnit requires identical endpoints.

The discriminator for the fix already exists: buildEdge resolves `from` and `to` against the post-removal nodes (:297,:301) BEFORE it touches the id, so "moved onto a surviving part" and "orphaned" are told apart by whether resolveNode succeeds — which means the refusal an implementer has to improve is the endpoint one (references.ts:81, "no node called Y to connect to"), not edgeId's. The cheapest shape is to subtract the restated ids from the CASCADE set before removals are applied, rather than widening edgeId's lookup: it preserves edge order in the document, and it keeps replacedRelationships reasoning about the set actually taken off.

One decision the implementer must not make silently: whether removeEdges naming an id AND a restatement of that id in the same batch is accepted (the module's doctrine) or refused (the precedent for nodes at :170-185). And one dependency: TASK-256.07 only has something true to report once the id survives — otherwise the comparison reads the move as a removal beside an addition.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One write that removes a part and restates a relationship whose endpoint moves onto another part keeps that relationship's id when that is its only change
- [x] #2 A restatement that also changes a second property is refused as a replacement, naming the fields it changed
- [x] #3 A relationship restated while still naming the part this write removes is refused, and the refusal says the part is one this command removes
- [x] #4 An agent that drops the id and re-adds the relationship instead is told so, since neither the write notices nor the ids-stable guardrail can see it today
- [x] #5 Tests own the accepted move, the replacement refusal and the orphan refusal, with the accepted move in the one-thing-asked-for-is-one-write group
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. planRemovals: the CASCADE set (edges whose endpoint this batch removes) loses every id the same batch restates in edit.edges. Explicit removeEdges ids are NOT subtracted. Edge order in the document is preserved because the edge stays in kept.edges and `place` replaces it where it sits, and replacedRelationships keeps reasoning about the set actually taken off.

2. DECISION TO RAISE (do not read as settled): removeEdges naming an id AND a restatement of that id in the same batch is REFUSED, not accepted. Reasons: it matches the node precedent at edit-content.ts:170-185 (statedId refuses a stated id the same command removed); the planRemovals doctrine paragraph licenses two removals of one edge agreeing, not a removal and a restatement contradicting; and it keeps today's outcome (UNKNOWN_EDGE) rather than changing it. Only the sentence improves: it says this command removes that relationship and what to do, instead of the typo sentence.

3. The endpoint refusal is the one that discriminates (AC#3). buildEdge resolves from/to against the post-removal nodes before it touches the id, so when resolveNode fails and the reference names a node this command removes, edit-content re-frames the refusal to say the part is one this command removes. Code stays UNKNOWN_NODE; references.ts:resolveNode stays generic.

4. AC#2 needs no new check: once the id survives, a restatement changing to AND label reaches edgeIdentityRefusal (edge-identity.ts) at the write boundary and is refused EDGE_IDENTITY_REUSED naming 'to, label'. That check compares a variant with its direct predecessor, so it is the proposal/draft case the evaluation hit; a root variant with no predecessor has no such check today and this task does not add one.

5. AC#4: replaced-relationships gains `continues`, the continuation rule counted whole (from, to, kind, label, description, emphasis, traffic; one difference is a continuation), used ONLY by reAddedInBatch. sameUnit/restates stay strict for duplicatedBeside and removedForCopy, because two calls to different parts under one label are ordinary when both stand, and widening those would warn about them. TASK-253.05's behaviour is otherwise untouched.

6. Tests: the accepted move and the orphan refusal go in aggregate-writes.test.ts's 'one thing asked for is one write' group (AC#5); the replacement refusal and the dropped-id notice go in edge-identity.test.ts beside the other identity owners. Assert refusal codes and warning codes/paths, not prose.

7. Run bun test on both owners plus settlement/branching/propagation as the neighbours that share planRemovals.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented.

edit-content.ts planRemovals: the cascade (edges whose endpoint the batch removes) now excludes every id the same batch restates in edit.edges. Ids named in removeEdges are still removed and are tracked separately as removals.statedEdges. Because the restated edge stays in kept.edges, `place` replaces it where it sits: document edge order is unchanged, and replacedRelationships still reasons about the set actually taken off.

New private file lib/stated-edges.ts holds the relationship half of the batch (placeStatedEdges, buildEdge, edgeId, the endpoint resolution and saidOfEdge). edit-content.ts had reached the 600-line lint ceiling and buildEdge the complexity ceiling; the split is along the seam the fix itself draws — endpoints resolve against the surviving nodes, and the id is read after that.

Two refusals now say which mistake was made:
- an endpoint that resolves to nothing but names a part this command removes refuses UNKNOWN_NODE saying the part is one this command removes and to point the relationship at what replaces it (was: 'no node called X to connect to', which reads as a typo);
- a stated edge id this command named in removeEdges refuses UNKNOWN_EDGE saying the command removes it and states it again (was: the typo sentence).

replaced-relationships.ts gained `continues`, the continuation rule counted whole (from, to, kind, label, description, emphasis, traffic; one difference is a continuation), used ONLY by reAddedInBatch. sameUnit and restates are unchanged, so duplicatedBeside and removedForCopy behave exactly as TASK-253.05 left them; widening those would have warned about two calls to different parts under one label, which is ordinary when both stand. Consequence worth knowing: the one-write drop-the-id move now warns; the two-write version (add beside in one write, remove the original in the next) still does not, because there the endpoints differ and both relationships stood.

DECISION RAISED, NOT SETTLED QUIETLY — removeEdges naming an id AND a restatement of that id in the same batch: refused. Reasons: it matches the node precedent in the same module (statedId refuses a stated id the same command removed); the planRemovals doctrine licenses two removals of one edge agreeing, not a removal and a restatement contradicting; and it keeps today's outcome (UNKNOWN_EDGE) rather than changing behaviour as a side effect of the cascade fix. Only the sentence improved. If the parent wants the module's 'what is left at the end' doctrine applied instead, the change is one line (subtract restated ids from the whole removal set rather than the cascade) plus flipping that test.

Scope note: skills/archboard/references/edit.md still does not say the move is one write. Out of this session's file scope; flagging for the parent.

Verification: bun test --isolate src/runtime/semantic-board-store (134 pass, 0 fail); bun test --isolate src/shared/semantic-board src/transformers/semantic-renderer (139 pass); bun test --isolate --max-concurrency=1 tests/system/semantic-boards (30 pass); bun test --isolate tests/system/repository-policy (8 pass); bunx tsc --noEmit clean for this module (the only errors are another worker's in-flight src/runtime/skill-evaluation files); lint:policy config over src/runtime/semantic-board-store clean; oxfmt applied. Each new test was confirmed red against the unfixed code by reverting the cascade filter and by reverting continues to sameUnit. The real S02 r2 batch (two parts out, one in, two relationships moved, endpoints by name) was replayed through the store and lands applied with both ids and the edge order kept and no warnings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A relationship whose endpoint moves onto the part that replaces the one a write removes keeps its id: the cascade no longer takes an edge the same batch restates. A restatement changing two properties still refuses as a replacement naming the fields, and an endpoint left on a removed part refuses saying so. Replayed the real candidate S02 r2 move (applies with both ids and edge order kept, no warnings) and the baseline S02 r3 shape (reaches EDGE_IDENTITY_REUSED). Verified in the wave gate: lint, fmt:check and type-check clean, the frontend build, 3572 module tests, the system lanes for semantic-boards/cli/canvas-state/process-contracts/code-targets, the repository lane, and the full serial browser lane at exit 0 with no failures.
<!-- SECTION:FINAL_SUMMARY:END -->
