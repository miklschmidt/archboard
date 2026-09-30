---
id: TASK-269
title: >-
  eval:skill check refuses a fixture relationship that lands on a part with
  children
status: Done
assignee:
  - '@claude'
created_date: '2026-09-18 11:51'
updated_date: '2026-09-18 13:32'
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
- [x] #1 bun run eval:skill check refuses a fixture whose call relationship targets a node that some node names as its parent, and names the fixture, the relationship and the offending target
- [x] #2 The rule is evaluated against each fixture step's accumulated content, so a child added by a later edit step is caught
- [x] #3 A relationship that addresses a whole module is still allowed, and what distinguishes it from a landing is stated where the rule lives
- [x] #4 The 15 fixtures as they stand today pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A new module file, src/runtime/skill-evaluation/lib/landings.ts, sibling to leakage.ts. Its landingProblems is called from fixtureProblems in suite.ts, so it runs inside suiteProblems and loadSuite refuses on it, which covers eval:skill check. A separate file because suite.ts sits at the line cap.
2. A relationship lands when it ends on a part that some part names as its parent. Every kind lands except `dependency`, which addresses the whole module. This mirrors the run check no-edge-to-container-with-children (which allows no kind at all) and the skill's whole-module meaning.
3. Each fixture is walked over the names it writes, keeping per-variant state:
   - identity across renames, with a reused name minting a new part;
   - containment, placed after every stated node's names are folded (the store's second pass);
   - handles within a step;
   - a variant's own removals;
   - branch, adopt and resolve;
   - an edit carried into the drafts that follow its variant.
   After each step every variant is checked, so a later step that adds a child is caught.
4. Where the walk cannot reproduce the store, it errs toward refusing: a carried statement adds and never takes away, and a resolution takes everything the predecessor has. The one known miss is the merge of a part's name between a draft and its predecessor (R3). The applyStep doc names it, and TASK-272, laying fixtures through the real store, retires the model.
5. Tests live in src/runtime/skill-evaluation/tests/landings.test.ts. Verification: the focused tests, eval:skill check, tsc, oxlint, oxfmt, and an end-to-end probe on a scratch copy of evals/.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added src/runtime/skill-evaluation/lib/landings.ts with landingProblems, called from fixtureProblems in suite.ts (so it runs inside suiteProblems beside leakageProblems, and loadSuite refuses on it). It needed its own file: suite.ts is at the 600-line cap and the predicate's walk is over the complexity cap, and landings.ts takes Iterable<readonly [string, unknown]> the way leakage.ts takes unknown, which keeps it off suite.ts's types and out of a cycle.

How it reads a fixture. It walks the raw JSON rather than laying the fixture through the store: vault.ts (which owns resolvePlaceholders) imports suite.ts, so nothing suite.ts reaches can lay a board. Per board it keeps a key per part — the name it was created under — with every later name folded onto it, so $node(name) and a rename in a later edit stay one part; the children each key has; and every 'call' relationship written so far. A node is stated in full, so a node that no longer names a parent leaves the part it was under, and removeNodes takes a part off with its containment and its relationships.

The two traps. Accumulation: the check runs after each step against everything the steps have left, so an edge drawn in step 0 and a child added under its target in step 2 is refused, and the test proves the first step alone is clean. Whole-module: only kind 'call' is a landing, because a call names the part that runs the code while a dependency or an extends addresses the module itself; the reasoning is the doc comment on LANDING_KINDS in landings.ts.

Tests, in src/runtime/skill-evaluation/tests/suite.test.ts: a call onto a parent is refused and the line names the scenario, both ends and the child; the same shape split across steps is refused while the first step alone is not; a rename between them does not hide it; dependency and extends onto a part with children pass; and landingProblems(loaded.fixtures) is empty for the 15 real fixtures.

Verified: bun test src/runtime/skill-evaluation/tests/suite.test.ts (11 pass, 0 fail); eval:skill check (suite ok: 15 scenarios, 15 fixtures, 14 coverage parts); oxlint type-aware on src/runtime/skill-evaluation and baseline on its tests, clean; tsc --noEmit clean; oxfmt --check clean. End to end, a copy of evals/ in a scratch directory with one child added under a call's target under S01 makes loadSuite refuse with both offending relationships named — evals/ itself was not touched. No model evaluation was run.

Round 2, after review.

Kind rule flipped (review 1 and 6): every relationship kind lands except `dependency`. `extends` is not a kind in DEFAULT_SEMANTIC_POLICY. It was only a label on S04's dependency edges, so the old rationale was false. Every other kind names a receiver: call, http, rpc, event, queue, data, render, other. The run check no-edge-to-container-with-children filters no kind at all. The comment on WHOLE_MODULE_KINDS now states that dependency is the one kind that addresses the module itself. The test takes the kinds from DEFAULT_SEMANTIC_POLICY.relationshipKinds, so a new kind is covered without editing it.

Two passes (review 2): noteNodes folds every stated node's names and handles first, then places parents, as the store does. A child stated before the parent it names, in the same step that renames that parent, is now refused.

Variants (review 3): I chose per-variant state. The `new` step creates the first variant under its stated `variant` or the store's FIRST_VARIANT_NAME. A branch starts as a copy of its source and follows it. An edit applies to the variant it names, or to current, and is then carried into every draft that follows that variant, parent before child. An adoption makes the variant current and stops it following its source. Resolve steps are not followed. The carry approximates the store's three-way merge, and the comment on applyStep says so: a draft keeps the parts it removed (a carried statement does not bring them back, and a carried relationship to a removed end does not arrive), and it takes everything else. This closes (a): a removal on a draft no longer erases facts from the current variant. It also fixes (b): the relationship on one sibling draft and the child on another no longer combine. A landing is named once per board, on the first variant where it appears.

Handles (review 4): fold records a node's `as` as a key for that step only, so a parent named by handle resolves. removeEdges (review 5): a comment beside the EDIT fields says it needs handling only if an $edge(...) placeholder is ever added. Optional 7: the doc comment on fixtureLandings says a landing is reported when it first appears, even if a later step moves the child away.

Interface: the field names this reads are tied to the input types with `satisfies` (VariantEditInput, BoardCreateInput, SemanticNodeInput, SemanticEdgeInput). A renamed field now breaks type-check. landingProblems takes ReadonlyMap<string, Fixture> through a type-only import. My earlier stated reason, avoiding a cycle, was wrong.

Tests moved to src/runtime/skill-evaluation/tests/landings.test.ts, and suite.test.ts is back to its pre-TASK-269 content. I dropped the duplicate real-fixture assertion: suiteProblems(loaded) in suite.test.ts already owns it. The new cases cover refusal naming, the later child (by $node, parent-first rename, child-first rename, handle), every configured kind except dependency, a draft removal followed by a current-variant child, a child added on a draft, a current edit carried into a draft, and sibling drafts that must not combine. Run against the round-1 predicate, 4 of the 7 tests fail, so each test catches a real gap.

Verified: landings.test.ts 7 pass, suite.test.ts 9 pass, eval:skill check reports 'suite ok: 15 scenarios, 15 fixtures, 14 coverage parts', oxlint (type-aware on landings.ts/index.ts, baseline on tests) is clean, and oxfmt is clean. tsc --noEmit shows errors only in claude-grader.test.ts and report-completeness.test.ts, both from other workers' in-flight changes. There are none in these files.

Round 3, after review.

The check is now imprecise in only one direction: toward refusing. A spurious refusal is visible and safe, while a missed landing is the silent failure this guard exists to prevent. The comment on applyStep states this.

Carried statements are add-only (must-fix). The store merges a carried edit field by field against what the draft last agreed with: it keeps a field only the draft changed, and it keeps a part the draft changed even when the predecessor removed it. I took the add-only minimum rather than per-node base tracking.
- A carried node may add a parent on a draft but never takes one away (carryNode). A part the draft removed itself stays removed.
- Each variant now records the parts it stated itself since branching (`touched`: nodes it stated, and the ends of relationships it stated). A carried removal skips any touched part.
- A carried removal is no longer remembered as the draft's own removal, so a later re-addition from above still arrives. Before this change that was another quiet miss.
- The reviewer's M1 (a carried restatement with no parent) and M2 (a carried removal of a part the draft restated) are now tests. Both fail against 2b50686b and pass now.

Resolve (should-fix): a resolution is now followed with the same over-approximation. The resolved variant and its drafts clear their removed sets and absorb everything their predecessor has (names, containment, relationships), because a choice can restore a removed part or take the predecessor's parent. The test (a draft removes the child and adds the call, then a resolve naming the child) fails against 2b50686b and passes now.

Optional: `addressed` now carries a comment saying why falling back to current is safe: the store refuses an edit to a variant that does not exist, so such a fixture never lays.

Also fixed: a TS2322 narrowing error in noteRemovals (`statement.input[...]` does not narrow through Array.isArray). It was already in 2b50686b; my round-2 tsc run hid it behind `tail`. tsc --noEmit is now clean across the tree.

Verified:
- landings.test.ts: 10 pass. Against 2b50686b, the 3 new cases fail.
- suite.test.ts: 9 pass.
- eval:skill check: suite ok, 15 fixtures.
- oxlint type-aware and baseline, oxfmt, and tsc: all clean.

Round 4, after review.

Carried removals now take nothing away. noteRemovals returns immediately for a carried statement, and `touched` is deleted. The per-part set could never be complete: the store keeps a draft's part when the draft changed it, and keeps the whole draft whenever a carried removal would leave anything in it naming a part that is gone. Neither can be told from names alone. The code now does exactly what the applyStep doc says: a carried statement adds and never takes away. A carried node never loses a parent, and a carried removal removes nothing. Its only cost is refusing in cases where the store would have dropped the part. That is the refusing direction.

The reviewer's P1 and P2 are now separate tests:
- P1: a child added on the draft under a part the current variant then removes.
- P2: a carried removal of two parts where one is still named by the draft, so the store keeps the whole draft.
Each fails against de9aecc2 and passes now. They are split so that each failure shows on its own.

The round-3 'second quiet miss' (a carried removal recorded as the draft's own removal) can no longer happen: a carried removal records nothing. It therefore has no test of its own.

The approximation caveat is unchanged in direction: the check is imprecise only toward refusing. A draft can hold a part under two parents after a carried restatement. It keeps parts the store would drop after a carried removal. A resolution is assumed to take every choice.

Verified:
- landings.test.ts: 12 pass. Against de9aecc2, the 2 new tests fail.
- suite.test.ts: 9 pass.
- eval:skill check: suite ok, 15 fixtures.
- tsc --noEmit -p .: exit 0, with the whole output captured to a file (0 lines).
- oxlint type-aware and baseline: exit 0.
- oxfmt: clean.

Round 5, after review.

Reused names (must-fix, R1). Each variant now records the name each part goes by now (`names`, by key). `fold` goes through `identify`:
- A node stated by id is the part that id names.
- A node stated by name alone is the part currently going by that name, which is how the store matches.
- A name that only a renamed part used to go by names no part. The store mints a new part for it, so this mints a fresh key and points the name at it.
- A later $node(name) on that variant, or on its drafts, therefore resolves to the new part, as vault.ts resolves it against the variant as it stands. The old name's mapping for carried references is untouched, because only an id-less statement of a new part mints a key.
- I also dropped the old `keys.set(key, key)`: restating a renamed part by id would have pointed its reused old name back at it.
- Problem lines now print current names rather than keys.
- R1 is its own test. It fails against 79686f63 and passes now.

The applyStep doc now says what the walk models and what it does not. It models identity across renames and name reuse, containment with parents placed in a second pass, handles, the variant's own removals, branching, adoption, and carry-down. It does not model the store's field-by-field merge or which side a resolution chooses; for those two it errs toward refusing. The doc says plainly that anything else the store decides and this does not reproduce can still hide a landing, and that laying through the store is what would close that. The earlier 'errs in one direction only' was not true in general, so I narrowed it to those two stated gaps.

landings.ts is now exactly 600 lines, the policy cap. Any further growth needs a split, which is another argument for the structural change below.

STRUCTURAL QUESTION: can the check lay fixtures through the real store? Yes, and cheaply.
- The constraint is real but narrow. vault.ts imports FixtureStepSchema from suite.ts as a VALUE, so a suite.ts -> vault.ts import would be a runtime cycle.
- Nothing requires the check to live in suite.ts. A new lib file, say lib/lay.ts, can import both suite.ts and vault.ts with no cycle. It would take resolvePlaceholders from vault.ts, and from the store's index the pure transitions: createBoardTransition, editVariantTransition, branchVariantTransition, settleVariantTransition, adoptVariantTransition.
- suite.test.ts's 'every fixture lays' test already does exactly this in process, with no canvas, no CLI and no vault on disk: transitionOf(resolved).apply(before, at).
- Rough cost:
  - move transitionOf and variantOf from that test into lay.ts (about 50 lines);
  - add a layFixture/fixtureLandingProblems that applies each step and, after each step, reads every variant's content with the same rule as no-edge-to-container-with-children, minus dependency edges (about 40 lines);
  - call it from scripts/evaluate-skill.ts wherever loadedSuite() gates a batch (check, run), or add it to the module index next to loadSuite;
  - rewrite landings.test.ts to go through it.
  - About half a day, including moving the suite.test.ts laying test onto the shared lay.ts.
- Benefits:
  - It would retire landings.ts's model entirely: merge, carry-down, resolution, name resolution and containment would all be the store's own.
  - A fixture that does not lay would be refused at check time instead of hours into a batch, which the suite.test.ts comment says eval:skill check cannot do today.
  - The accumulated-state requirement falls out for free by checking after each step.
- The one design point: loadSuite throws on suiteProblems, so either loadSuite moves beside lay.ts, or the scripts call the laying check separately after loadSuite. Both are small.

Verified:
- landings.test.ts: 13 pass. Against 79686f63, R1 fails and the other 12 pass.
- suite.test.ts: 9 pass.
- eval:skill check: suite ok, 15 fixtures.
- tsc --noEmit -p .: exit 0, with the whole output captured to a file (0 lines).
- oxlint type-aware and baseline: exit 0.
- oxfmt: clean.

Round 6, after review.

R2, a regression 4095d158 introduced (79686f63 refused it):
- Steps: a draft renames X to X2 by id and draws A->X2. The current variant then restates X by name alone and adds a child c under X.
- The store keeps the draft's name X2, puts c under that same part, and A->X2 lands.
- The cause: the carried id-less restatement ran identify against the draft's names, where the part now goes by X2, so X looked like an old name and a fresh key was minted.
- Fix: a carried statement never mints (identify takes `carried`). R2 is now a test; it fails against 4095d158 and passes now.

KNOWN LIMITATION, R3, deferred to TASK-272:
- Steps: after R2's steps up to the current restatement, the draft restates X2 by name alone and adds a child c under X2.
- The store refuses (A->X2 lands). This walk reports it CLEAN.
- The cause: the carried fold rewrote the draft's current name for the part to X, so the draft's own X2 reads as a new part.
- R2 and R3 share one root, merging the `name` field between a draft and its predecessor, which this walk does not model. Either guess can split one part in two, and a split hides a landing.
- I kept R2 closed over R3 because R2 was a regression and has the simpler trigger: only ordinary current-variant edits after a draft rename. R3 also needs the draft to restate by name.
- The applyStep doc now names this as the one known miss, with R3 as the example, and points at TASK-272.

Doc: 'a part's identity across renames' is now qualified to 'on the variant an edit addresses'.

landings.ts stays at the 600-line cap, with no module split. The trims:
- isRecord had one caller, so it folded into records.
- VariantState.keys has a one-line doc.
- applyStep's doc no longer repeats editFamily's sentence about carrying.
- The two-line family guard is one line.

Verified, with every output captured whole:
- landings.test.ts + suite.test.ts: 23 pass, 0 fail. R2 fails against 4095d158.
- tsc --noEmit -p .: exit 0, 0 lines.
- oxlint type-aware on landings.ts: exit 0, 0 lines.
- oxlint baseline on landings.test.ts: exit 0, 0 lines.
- oxfmt: clean.
- eval:skill check: exit 0, 'suite ok: 15 scenarios, 15 fixtures, 14 coverage parts'.
- End to end: a scratch copy of evals/ with a child added under JSON helpers in S01 makes loadSuite refuse. The refusal names S01, the step, the board and variant, both relationships and the child. evals/ itself was not touched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`bun run eval:skill check` now refuses a fixture that draws a relationship onto a part with children. That is the shape TASK-264 removed by hand after graders found it in a paid batch.

**What changed**
- src/runtime/skill-evaluation/lib/landings.ts (new) holds landingProblems. It is called from fixtureProblems in suite.ts, so loadSuite refuses on it.
- Every relationship kind lands except `dependency`, the one kind that addresses a whole module. This matches the skill and the run check no-edge-to-container-with-children. The reason is stated on WHOLE_MODULE_KINDS.
- The rule is evaluated after every step against per-variant state accumulated over the fixture's names, so a child added by a later edit is caught.

**Limits**
- The walk is an approximate model of the store, not the store.
- Where it cannot reproduce the store's field-by-field merge or a resolution's choice, it refuses rather than misses: a carried statement adds and never takes away, and a resolution takes everything the predecessor has.
- There is one known miss. When a draft and its predecessor disagree about a part's name, the walk can split the part in two, which hides a landing (R3 in the notes). The applyStep doc names this.
- TASK-272 is the structural fix: it lays fixtures through the real store and retires this model.

**Verification**
- AC1: a scratch copy of evals/ with a child added under a called part in S01 makes loadSuite refuse. The refusal names S01, the step, the board and variant, both relationships and the child. The same refusal is also owned in landings.test.ts.
- AC2: landings.test.ts refuses a child added by a later edit (by $node, by rename in either order, by handle, on drafts, after carry-down and resolution), and shows the first step alone is clean.
- AC3: a dependency onto a part with children passes, and every other configured kind (read from DEFAULT_SEMANTIC_POLICY) is refused.
- AC4: eval:skill check reports 'suite ok: 15 scenarios, 15 fixtures, 14 coverage parts'.
- Tests: landings.test.ts and suite.test.ts, 23 pass. Each review round's cases fail against the commit before its fix.
- tsc --noEmit -p ., oxlint (type-aware and baseline) and oxfmt are all clean, each with its whole output captured.
<!-- SECTION:FINAL_SUMMARY:END -->
