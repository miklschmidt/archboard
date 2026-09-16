---
id: TASK-245.04
title: >-
  Stop guessing skip faces before layout, on first renders and under a
  predecessor
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
updated_date: '2026-09-16 09:57'
labels: []
dependencies:
  - TASK-245.03
references:
  - src/runtime/semantic-renderer/lib/layout/brackets.ts
  - src/runtime/semantic-renderer/lib/layout/compound-flanks.ts
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
  - docs/design/layout-rules.md
parent_task_id: TASK-245
priority: high
type: enhancement
ordinal: 427000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A forward skip's faces are decided from ranks before the engine has placed anything, and every rule that reads geometry to repair that guess (hasTopApproach, the previousSides tie-break, reseatBlockedFlanks in compound-flanks.ts, the lane and badge logic in compound-node-hints.ts) runs only under a predecessor. docs/design/layout-rules.md section 1 diagnosed this; its recommendation 1 landed for hub skips on first renders only (brackets.ts keeps one west bracket per non-hub card beside its own chain, and under a predecessor every new skip still takes the flank). Measured 2026-09-16: leaving every non-containment face to the engine, returns and steps included, grows pages and bends (Board viewer 1376x1443 to 1211x1871; Semantic renderer bends 1.3 to 1.9 per edge), so the step and return conventions stay and the bracket is the guess to remove. Under a predecessor, layout-rules recommendation 3 applies: solve once with free skip faces and inherit faces from that drawing, one extra solve rather than a rule family. TASK-237 (a backward relationship ending on a container crashes when a predecessor supplies its faces) lives in the same code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a first render a forward skip has no fixed face; only containment, the adjacent forward step and the return keep their reading convention
- [ ] #2 Under a predecessor a surviving relationship keeps its drawn faces and a new skip's faces come from a free solve, never from rank or from the predecessor's card positions; hasTopApproach, brackets.ts and the flank reseating in compound-flanks.ts are deleted and the tests that pinned them are re-derived as reader invariants (no route through a card, a skip beside its own chain still drawn beside it after layout, bounded bends, label on its own route)
- [x] #3 Fit in the reference pane on the vault boards and the fixtures is no lower than the baseline, no route passes through a card, and bends per edge stay within the wide-board bounds
- [x] #4 TASK-237's crash is fixed by this change with a test, or the reason it is still open is recorded on TASK-237
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TASK-237: reproduce and fix; a frame's relationship with a card outside it gets no fixed face; test both directions.
2. Delete hasTopApproach and the flank reseating (compound-flanks.ts); the seeding record keeps ports and faces.
3. Under a predecessor a surviving relationship keeps its drawn faces; a relationship the proposal adds is settled twice (faces from a first render of the same content, and no fixed face) and the drawing with no route through a card, then fewer bends, is kept (lib/layout/proposal-skips.ts).
4. Measure removing the bracket on first renders, with every engine placement and layering option and with faces fixed from a free solve; keep it only if it earns fit.
5. Re-derive the tests that pinned the deleted rules as reader invariants; measure the vault's proposals and a one-skip edit of each fixture before and after; layout-rules.md section 15.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed: TASK-237 fixed (frame-relationships.test.ts, both directions; pre-existing on 8d45c285). hasTopApproach and compound-flanks.ts (reseatBlockedFlanks) deleted. Under a predecessor, added relationships are settled with first-render faces and with no fixed face, keeping the drawing with no route through a card then fewer total bends; neither reading alone held (first-render faces sent the added skip in skipped-connections through a pinned card; no face snaked the added route in predecessor-routing to six turns). Vault proposals (Canvas server, Renderer layout, Semantic renderer Readable layout) draw identically before and after; one-skip fixture edits: flask-map-1 unchanged, flask-map-2 1876x2590 bends 2.3 -> 1815x2753 bends 2.8, flask-map-3 2616x2106 bends 2.8 -> 2616x2161 bends 2.9 (two routes through cards on flask-map-3's edit both before and after, pre-existing, not fixed). First-render fits unchanged on all fourteen boards and fixtures; no route through a card, flank fan at most 1, no label off its run. NOT landed: deleting brackets.ts (AC1, and that part of AC2). Leaving every skip free on a first render costs fit (flask-map-1 0.46->0.44, flask-map-2 0.35->0.31, flask-map-3 0.45->0.37, Board viewer 0.62->0.51); Brandes-Köpf, balanced BK, linear segments, network-simplex layering, a straightness priority on steps and faces fixed from a free solve were each measured and none recovers every baseline (Board viewer never above 0.53). The bracket is kept as a reading convention that earns its fit, per ADR 0028's fit measure; table in layout-rules.md section 15. Tests re-derived: skipped-connections (skip keeps to one side of the card it skips, crosses no card), predecessor-routing (label on its run within the engine's half-unit centring, bends per route within the wide-board bound, no card crossed), crossings (the corner case held on the fixture's first render, which still crosses beside a turn). Validation: renderer suite 187 pass; renderer/UI/server modules 565 pass; lint:policy on src; lint:baseline; fmt:check; type-check.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Faces under a predecessor now come from solves rather than guesses: hasTopApproach and the flank reseating (compound-flanks.ts) are deleted, a surviving relationship keeps its drawn faces, and a relationship a proposal adds is settled with a first render's faces and with no fixed face, keeping the drawing with no route through a card and fewer bends. TASK-237 is fixed by giving a frame's relationship with an outside card no fixed face, with a test. First-render fits are unchanged on every board and fixture and the vault's proposals draw identically. Not met: AC1 and the brackets.ts part of AC2. Removing the bracket lost fit on four boards (Board viewer 0.62 to 0.51) and no engine option measured recovers it, so the bracket stays as a reading convention; recorded in layout-rules.md section 15. Verified with the renderer suite, module suites, both lint configurations, fmt:check and type-check.
<!-- SECTION:FINAL_SUMMARY:END -->
