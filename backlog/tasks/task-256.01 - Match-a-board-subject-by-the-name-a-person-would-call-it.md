---
id: TASK-256.01
title: Match a board subject by the name a person would call it
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:39'
updated_date: '2026-09-17 19:01'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/reading.ts
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 451000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Outcome checks find a subject with an exact string comparison — nodeNamed is `content.nodes.find((node) => node.name === name)` (src/runtime/skill-evaluation/lib/reading.ts:88) — so a scenario that quotes a symbol only passes for an author who uses that symbol verbatim as a display name. In the 2026-09-17T16-31-08 batch this failed six runs whose boards the grader called accurate: five S07 runs named werkzeug's server `Werkzeug run_simple` against a check for `run_simple` (every one of them already kind external, so loose matching alone fixes all five), and baseline S01 r1 named the provider `Default JSON provider`, failing four checks on one name. The user chose loose matching.

It is not only nodes. The same exactness governs board names (reading.ts:128), variant names (:79, and outcomes-family.ts:228), relationship ends (edgesBetween, :99), node parents (outcomes-board.ts:268), drill-down targets (:317), flow names (outcomes-family.ts:309), view names (:384), walkthrough names and beat subject names (:425,:431), and group membership compared against what the CLI returned (outcomes.ts:105). It also governs captures: a view name the author spelled differently means a failed capture, which makes the run visually incomplete and drops it out of the token comparison entirely (report.ts:313) — a third failure mode the first description missed.

Three things must NOT be loosened. Negative checks — nodes-absent, no-edge-between, membersExclude — need the inverted rule: they pass vacuously today when a name misses, and a loose matcher that quietly pairs a name with something plausible would start passing them for the wrong reason, so they must fail when ANY plausible subject answers and say which. The ids-stable guardrail (guardrails.ts:43, renamedIdentities) compares node names exactly and does not import nodeNamed; loosening it would change identity results across the suite. And the product's own addressing (aggregate.ts findVariant/resolveVariant) is the ADR-governed `payments@variant` contract — the harness wraps it, never replaces it.

One consequence to accept deliberately: node-id-retained and node-field-retained currently fail an author who keeps a node's id but renames its display. After loosening they pass. That is probably right — the id is the identity and the name is display — but it is a decision, not a side effect.

Every verdict is a CheckVerdict {check, passed, detail} (reading.ts:63) written to outcomes.json and into bundle.json, which the grader reads, so "say what it matched" is an append to detail and nothing else changes; report-markdown never prints details.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A check matches the subject a person would say the prompt names — differing in case, separators, spacing or a qualifying word — for node, relationship-end, board, variant, view, flow, walkthrough and capture names, and its verdict says which name it matched
- [x] #2 A negative check fails when any plausible subject answers the name, and names it
- [x] #3 A check still fails when no subject plausibly answers, and an ambiguous name counts as no match
- [x] #4 The ids-stable guardrail and the product's variant addressing keep matching exactly
- [x] #5 A fast test owns the matcher, including a name that must not match and two candidates that must count as ambiguous
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/runtime/skill-evaluation/lib/naming.ts: a tiered name matcher (exact > same words after case/separator/camel folding > one name qualifying the other by an extra word). Ambiguity at the best tier is no match. It exposes namedSubject (the unique answer), plausibleSubjects (every candidate that could answer, for negative checks), namesMatch, namedEntry/namedValue for name-keyed maps, variantNamed/viewNamed wrapping the product's resolveVariant, and a synchronous recordingMatches scope that collects the looser names a check accepted.
2. reading.ts: nodeNamed and the board lookup in located() go through the matcher; variantOf keeps resolveVariant first and only then falls back to a loose variant name; add nodesPlausiblyNamed for the inverted rule.
3. outcomes-board.ts: nodes-absent and no-edge-between use the plausible set and name what they found; node-parent and node-drilldown (board and variant name) compare with namesMatch.
4. outcomes-family.ts: board lookups (onBoard, snapshot), variant-exists, current-variant (name loose, id exact), flow, view, walkthrough and beat subject names go through the matcher.
5. outcomes.ts: membersInclude matches loosely, membersExclude uses the plausible set and reports the actual member names; evaluateOutcomes wraps each check in recordingMatches and appends the accepted names to the verdict's detail.
6. captures.ts: expandCaptures resolves a named capture's board, variant and view against the saved boards before the rasterize command sees them, so a differently spelled view is still captured.
7. Leave exact: guardrails.ts renamedIdentities, the product's resolveVariant/findVariant contract, and the fixture $node() placeholder in vault.ts.
8. Export the matcher from index.ts and add src/runtime/skill-evaluation/tests/naming.test.ts covering case/separator/camel folding, a qualifying word, a name that must not match, and two candidates that make a name ambiguous; extend the outcome owners' tests for the loose and inverted paths.
9. Run bun test on the skill-evaluation module tests and bun run eval:skill check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. New src/runtime/skill-evaluation/lib/naming.ts owns the matcher: a name reads as words (separators, spacing and camel/acronym boundaries all end a word), and a candidate answers at one of three tiers — the same string, the same words, or the check's words plus a qualifying word the author added. The best tier decides, so an exactly named subject beats a qualified one; two subjects at the best tier make the name ambiguous, which is no match.

Qualification is deliberately one-directional: only a LONGER subject name answers a shorter asked name. Both directions were tried first and broke S02, whose proposal replaces `App context stack` with `App context` and whose nodes-absent check would then have reported the removed part as still present. That direction is now a named refusal with its own test.

Sites changed: reading.ts (nodeNamed, the board lookup in located, variantOf keeping resolveVariant first, plus nodesPlausiblyNamed/edgesPlausiblyBetween/nodeNameOf for the inverted rule); outcomes-board.ts (nodes-absent and no-edge-between over the plausible set and naming what they found, node-parent, node-drilldown board and variant); outcomes-family.ts (board lookups in onBoard and the snapshot, variant-exists, current-variant, flow, view, walkthrough and beat subject names); outcomes.ts (membersInclude loose, membersExclude over the plausible set reporting the real member names, and evaluateOutcomes wrapping each check in recordingMatches so a loose match is appended to the verdict detail); captures.ts (expandCaptures resolves a named capture's board, variant and view against the saved boards before rasterize sees them, and leaves a name nothing answers to as written).

Left exact on purpose: guardrails.ts renamedIdentities (identity), findVariant/resolveVariant (the payments@variant contract, which variantNamed wraps and only falls back from), and the fixture $node() placeholder in vault.ts. Also left exact: the render-ok and inspect-group requests the harness sends to the CLI, which the task description's site list does not name; a render-ok check still addresses the board/variant/view the scenario wrote.

Tests: new tests/naming.test.ts owns the matcher (folding, the qualifying word, the refused shorter name, a name that says something else, and two candidates that make a name ambiguous plus the plausible set they yield). outcomes.test.ts gains the check-level loose/negative/ambiguous cases; outcomes-family.test.ts gains the variant/flow/view/walkthrough names; captures.test.ts gains the resolved named capture.

Verification: bun test src/runtime/skill-evaluation/tests/ -> 144 pass, 0 fail. bunx tsc --noEmit clean. bun run lint:policy clean. bun run eval:skill check -> suite ok: 15 scenarios, 15 fixtures, 14 coverage parts. bun run lint:baseline still fails only on src/runtime/semantic-board-store/tests/aggregate-writes.test.ts max-lines, which is another worker's in-flight file and untouched here.

Added a behavioural owner for the identity half of AC4: outcomes-family.test.ts 'identity compares a name exactly' renames Dispatch to dispatch under a new id and requires ids-stable to report no kept name — a loose identity comparison would fail it. Final run: bun test src/runtime/skill-evaluation/tests/ -> 145 pass, 0 fail; lint:policy clean; bunx tsc --noEmit clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A subject is matched by the name a person would use — same words folded across case, separators and camel boundaries, or the check's words plus a qualifier the author added — with the looser name named in the verdict. Negative checks read the plausible set and say what they found; ids-stable and the payments@variant addressing stay exact. Qualification is one-directional after the both-directions version broke S02's removed 'App context stack'. Verified in the wave gate: lint, fmt:check and type-check clean, the frontend build, 3572 module tests, the system lanes for semantic-boards/cli/canvas-state/process-contracts/code-targets, the repository lane, and the full serial browser lane at exit 0 with no failures.
<!-- SECTION:FINAL_SUMMARY:END -->
