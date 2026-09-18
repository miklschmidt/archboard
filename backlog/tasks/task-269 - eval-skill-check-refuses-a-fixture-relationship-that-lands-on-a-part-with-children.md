---
id: TASK-269
title: >-
  eval:skill check refuses a fixture relationship that lands on a part with
  children
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 11:51'
updated_date: '2026-09-18 12:45'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/suite.ts
  - evals/fixtures
  - TASK-264
priority: medium
type: enhancement
ordinal: 476000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-264 removed the inherited fixtures' relationships that landed on containers, because a fixture teaches an author the shape it uses and this one taught the opposite of what the rubric grades — four S00 runs and the S14 runs failed edge.actual-receiver over exactly that shape. Nothing stops it coming back. The defect was found by graders in a paid model batch rather than by the suite, which is the expensive way to find it.

Requested by TASK-264's worker and its reviewer, who both judged suiteProblems the cheapest credible owner: it sits beside leakageProblems, runs under `bun run eval:skill check`, and is a predicate over real fixture content rather than a test that mirrors configuration.

Two things the predicate has to get right, from the worker that just did the fixture work by hand. It must be evaluated per accumulated fixture state, because a later `edit` step can add a child under a node an earlier step already drew an edge onto. And it must allow the case where the source genuinely addresses the whole module: the only such shape in the suite today is a `dependency` or `extends` edge, so restricting the rule to `kind: "call"` is the simplest honest form.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bun run eval:skill check refuses a fixture whose call relationship targets a node that some node names as its parent, and names the fixture, the relationship and the offending target
- [ ] #2 The rule is evaluated against each fixture step's accumulated content, so a child added by a later edit step is caught
- [ ] #3 A relationship that addresses a whole module is still allowed, and what distinguishes it from a landing is stated where the rule lives
- [ ] #4 The 15 fixtures as they stand today pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read suite.ts, leakage.ts and the fixtures; confirm how a fixture states containment (a node's `parent`) and a relationship (an edge's `from`/`to`/`kind`), and that only `new` and `edit` steps carry content.
2. Add landingProblems to src/runtime/skill-evaluation/lib/suite.ts, called from suiteProblems beside leakageProblems. It walks each fixture's steps in order over the raw JSON (vault.ts imports suite.ts, so the placeholder resolver and the store cannot be reached from here without a cycle), accumulating per board: a canonical key per node that survives renames ($node(name) and a stated id both fold onto the name the node was created under), children by parent key, and every `call` relationship's target. After each step it reports any accumulated call relationship whose target has children, so a child added by a later edit step is caught, and each relationship is named once.
3. State beside the rule why `call` alone: a call names the part that runs the code, which is never the container drawn around it, while a `dependency` or `extends` addresses the whole module and may point at a part with children.
4. Own it in src/runtime/skill-evaluation/tests/suite.test.ts: a fixture whose call lands on a parent is refused; the same shape split across steps (edge first, child added by a later edit) is refused; a dependency onto the same parent passes; the 15 real fixtures pass (the existing suiteProblems assertion already covers this, add the loaded-suite case explicitly).
5. Verify with the focused test file and `bun run eval:skill check`; do not run a model evaluation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added src/runtime/skill-evaluation/lib/landings.ts with landingProblems, called from fixtureProblems in suite.ts (so it runs inside suiteProblems beside leakageProblems, and loadSuite refuses on it). It needed its own file: suite.ts is at the 600-line cap and the predicate's walk is over the complexity cap, and landings.ts takes Iterable<readonly [string, unknown]> the way leakage.ts takes unknown, which keeps it off suite.ts's types and out of a cycle.

How it reads a fixture. It walks the raw JSON rather than laying the fixture through the store: vault.ts (which owns resolvePlaceholders) imports suite.ts, so nothing suite.ts reaches can lay a board. Per board it keeps a key per part — the name it was created under — with every later name folded onto it, so $node(name) and a rename in a later edit stay one part; the children each key has; and every 'call' relationship written so far. A node is stated in full, so a node that no longer names a parent leaves the part it was under, and removeNodes takes a part off with its containment and its relationships.

The two traps. Accumulation: the check runs after each step against everything the steps have left, so an edge drawn in step 0 and a child added under its target in step 2 is refused, and the test proves the first step alone is clean. Whole-module: only kind 'call' is a landing, because a call names the part that runs the code while a dependency or an extends addresses the module itself; the reasoning is the doc comment on LANDING_KINDS in landings.ts.

Tests, in src/runtime/skill-evaluation/tests/suite.test.ts: a call onto a parent is refused and the line names the scenario, both ends and the child; the same shape split across steps is refused while the first step alone is not; a rename between them does not hide it; dependency and extends onto a part with children pass; and landingProblems(loaded.fixtures) is empty for the 15 real fixtures.

Verified: bun test src/runtime/skill-evaluation/tests/suite.test.ts (11 pass, 0 fail); eval:skill check (suite ok: 15 scenarios, 15 fixtures, 14 coverage parts); oxlint type-aware on src/runtime/skill-evaluation and baseline on its tests, clean; tsc --noEmit clean; oxfmt --check clean. End to end, a copy of evals/ in a scratch directory with one child added under a call's target under S01 makes loadSuite refuse with both offending relationships named — evals/ itself was not touched. No model evaluation was run.
<!-- SECTION:NOTES:END -->
