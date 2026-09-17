---
id: TASK-256.02
title: 'Ask the S05 beat for the ordering it explains, not one named part'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:39'
updated_date: '2026-09-17 19:01'
labels: []
dependencies: []
references:
  - evals/evals.json
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 452000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S05 asks the author to explain why the request context is pushed before dispatch, and two separate mechanisms judge the answer. The outcome check (evals.json, S05 outcomes: walkthrough-beat-references, minBeats 1, subjectKinds step and node) pooled the subjects of EVERY beat of every walkthrough and only asks that the union covers a step and a node; it passed 5 of 6 runs and failed only candidate r3. The expected feature (walkthrough.beat-subjects: "a beat whose subjects include the push step (by same-write handle or id) and the view node") reaches the LLM grader through bundle.json and failed all six.

Read against the saved boards, the six runs fall into two groups, and not the ones the first description named. Candidate r1 and r2 wrote ONE beat naming the push step, the dispatch steps and the part they run on — the shape the candidate guidance asks for — and failed only for not naming `View function`. Baseline r1 and r3 split the ordering across beats: the push side in one, `View function` in a later one. Baseline r2 named a single node; candidate r3 named both sides but no part at all, which the check caught.

That split is the trap. Because beatReferences (outcomes-family.ts:422-433) pools subjects across all beats, adding subjectNames ["View function"] to the check would pass baseline r1 and r3 and keep failing candidate r1 and r2 — backwards from both the grader and the intent. A per-beat predicate is a capability the check does not have: it needs a new field evaluated beat by beat with an "at least one beat satisfies all of it" rule, honouring check.walkthrough so another walkthrough's beats cannot answer for this one. Note also that beatReferences.names inserts an empty string for every non-node subject, so its name set is polluted.

Where an implementer edits: the check in evals/evals.json S05 outcomes plus OutcomeCheckSchema (suite.ts:83-144) and walkthroughBeatReferences (outcomes-family.ts:422-466); the grader's side in evals/evals.json S05 expectedFeatures only, keeping the feature string walkthrough.beat-subjects, since semanticallyCompliant keys on it. The grader prompt carries no scenario text and must not be touched.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The S05 expected feature and its outcome check are satisfied by a SINGLE beat that names the push step and any subject on the dispatch side it enables, with the part it runs on
- [x] #2 An ordering split across two beats, a beat naming one side only, and a beat naming no part all still fail
- [x] #3 The check evaluates beats one at a time and only within the walkthrough it names
- [x] #4 A fast test owns the rule with two beats that jointly, but not individually, satisfy it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `beatSubjectKinds` to OutcomeCheckSchema (suite.ts): a record of subject kind -> minimum count that ONE beat must reach on its own, beside the existing pooled `subjectKinds`.
2. In outcomes-family.ts, split beatReferences into the beat selection (which honours check.walkthrough by name) and what those beats pool, then add a per-beat predicate: a beat satisfies the check when its own subjects hold at least the stated count of each kind. The check passes only when at least one selected beat satisfies it; the pooled minBeats, missing-kind/name and dangling rules stay as they are.
3. Say in the detail whether a single beat answered, and with what.
4. evals.json S05: replace the pooled subjectKinds [step, node] with beatSubjectKinds { step: 2, node: 1 } — one beat naming the push step, a step on the dispatch side it enables, and the part it runs on. Update the walkthrough.beat-subjects requirement text to the same single-beat shape, keeping the feature key.
5. Test in outcomes-family.test.ts: two beats that jointly but not individually satisfy the rule fail, one beat holding all of it passes, a beat naming one side only or no part fails, and a walkthrough the check does not name cannot answer for the one it does.
6. Run the module tests and bun run eval:skill check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. New field `beatSubjectKinds` on OutcomeCheckSchema (suite.ts): a partial record of subject kind -> least count that ONE beat must reach on its own, beside the existing pooled `subjectKinds`. Zod 4 makes z.record over an enum exhaustive, so it is z.partialRecord.

The beat machinery moved out of outcomes-family.ts into a new lib/beats.ts (the file was over its 600-line limit after the change, and the beat reading is its own subject): beatsOf selects the beats the check looks at and honours check.walkthrough by name, beatReferences pools what they refer to, and singleBeatStanding counts each beat's own subjects by kind and reports whether any one beat reaches the stated counts. walkthroughBeatReferences now fails unless some single beat does, on top of the unchanged minBeats, missing-kind/name and dangling rules, and the detail says which way the single-beat rule went.

evals.json S05: the outcome check's pooled subjectKinds [step, node] became beatSubjectKinds { step: 2, node: 1 } — one beat naming the push step, a step on the dispatch side it enables, and the part they run on. The walkthrough.beat-subjects feature keeps its key (semanticallyCompliant and coverage.json both key on it) and its requirement now states the same single-beat shape. The grader prompt was not touched.

Test (outcomes-family.test.ts, 'an ordering is explained by one beat, never by two beats between them'): two beats holding two steps and one node between them fail; one beat holding all three passes; a beat with one step and the part fails; a beat with both steps and no part fails; and with two walkthroughs on the board, naming 'Elsewhere' fails while naming 'Tour' passes, so the rule is scoped to the walkthrough the check names.

Verification: bun test src/runtime/skill-evaluation/tests/ -> 146 pass, 0 fail. bun run eval:skill check -> suite ok: 15 scenarios, 15 fixtures, 14 coverage parts. bunx tsc --noEmit clean, bun run lint:policy clean, bun run fmt:check clean. bun run lint:baseline still fails only on src/runtime/semantic-board-store/tests/aggregate-writes.test.ts max-lines, another worker's in-flight file.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The S05 walkthrough check asks one beat to carry the ordering alone: a new beatSubjectKinds least-count that a single beat must reach, scoped to the walkthrough it names, with the beat reading split into lib/beats.ts. Two beats that satisfy it only between them now fail, which is what the pooled check allowed. Verified in the wave gate: lint, fmt:check and type-check clean, the frontend build, 3572 module tests, the system lanes for semantic-boards/cli/canvas-state/process-contracts/code-targets, the repository lane, and the full serial browser lane at exit 0 with no failures.
<!-- SECTION:FINAL_SUMMARY:END -->
