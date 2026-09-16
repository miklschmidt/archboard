---
id: TASK-245.04
title: >-
  Stop guessing skip faces before layout, on first renders and under a
  predecessor
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
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
- [ ] #3 Fit in the reference pane on the vault boards and the fixtures is no lower than the baseline, no route passes through a card, and bends per edge stay within the wide-board bounds
- [ ] #4 TASK-237's crash is fixed by this change with a test, or the reason it is still open is recorded on TASK-237
<!-- AC:END -->
