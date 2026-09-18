---
id: TASK-271
title: Correct the rubric contradictions the sweep found
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 12:34'
updated_date: '2026-09-18 12:42'
labels: []
dependencies: []
references:
  - evals/rubric.md
  - evals/evals.json
  - skills/archboard/SKILL.md
  - skills/archboard/references/authoring.md
  - TASK-268
  - TASK-270
priority: high
type: bug
ordinal: 478000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A full sweep of evals/rubric.md against all 15 scenarios and the skill (recorded in full on TASK-268, 2026-09-18) found seven confirmed contradictions and six suspected ones. TASK-268 is the systemic fix - making every expectation cite the skill passage it derives from - and none of its acceptance criteria require these particular corrections, so they would otherwise sit in a notes field while the next batch grades authors against them again.

They are cheap and independent: A1, A2, A3 and A7 are one-paragraph edits to rubric prose. Together A1 and A2 account for roughly 42 of the 2026-09-18 batch's ~120 missed rows and for the entire edit-workflow completeness figure (4.4/4.8, the lowest of any workflow, on the workflow whose requests are narrowest). A3 is the one that inverts the blame: run-578b7391da was written up for saying repeats did not apply, which is exactly what SKILL.md:221 instructs, because Flask's before_request_funcs loop length is decided by what an application registered rather than by the source.

The sweep's evidence for each finding is on TASK-268; this task carries the corrections.

A4 and B2 are deliberately NOT in scope here. They are the same vocabulary question as TASK-270, which records the decision that whether something exists is a fact about a variant and never about a node, and they wait for that ADR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The unprompted catalogue is walked only over what a write created or extended, matching SKILL.md:241-243 and references/edit.md:9-13, or the rubric states that a row already absent from the inherited board is not the author's miss - the protection rubric.md:132-140 already grants to inherited inaccuracies
- [ ] #2 The emphasis row carries the skill's cap, subject and exemption: hero on about a third of the relationships and never past half (SKILL.md:253), emphasis is a property of a line and never of a part (authoring.md:199-201), and a board with no spine correctly marks nothing (authoring.md:166-171)
- [ ] #3 The Flows bullet no longer says repeat and note are given where the exchange has them; repeat is required exactly where the source fixes the count, and a data-dependent loop, a branch or a caveat is a note, agreeing with rubric.md:107 and SKILL.md:221-223
- [ ] #4 The relationship row no longer invites an architecture edge for a return, which authoring.md:218-219 forbids
- [ ] #5 The tooling prefix marks only what it was defined for: neither a harness failure the author did not cause nor an ordinary CLI refusal the author repaired carries it
- [ ] #6 The rubric gives the author a way to say a row is out of scope, so a run following SKILL.md:244 is not written up for saying which rows it judged not to apply
- [ ] #7 Each suspected finding B1, B3, B4, B5 and B6 is either corrected or explicitly judged correct as it stands, with the reason recorded
- [ ] #8 evals/pins.json records that this rubric revision makes batches either side of it incomparable, beside the fixtures line TASK-264 added
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify every sweep citation in SKILL.md, authoring.md, edit.md, variants.md, the rubric and the scenarios before editing (done: all confirmed; B5's gloss sits at rubric.md:123-124, not 130).
2. A1/AC#1: scope the unprompted walk to what the run wrote - the whole board on a create, the subjects added or restated on an edit - and route an inherited omission to a 'fixture:' concern. Chosen over the 'already-absent row' route because that route is row-granular and would blind the walk to a real omission on brand-new material.
3. A2/AC#2: rewrite the emphasis row with SKILL.md:253's cap, authoring.md:199-201's subject and authoring.md:166-171's exemption.
4. A3/AC#3: replace 'repeat and note where the exchange has them' with the repeat/note split SKILL.md:221-223 teaches.
5. A5/AC#4: drop 'returns to' from the relationship row and name the flow step instead (authoring.md:218-219).
6. A7/AC#5: say the 'tooling:' prefix marks product-source reads alone - a harness failure is a plain concern, a repaired CLI refusal is no concern.
7. B3/AC#6: say the author naming the rows it judged not to apply is SKILL.md:244 obeyed; judge the judgement, never the saying.
8. AC#7: correct B1 (--from is optional), B4 (name which subjects need an id), B5 (null is 'created or extended nothing', not 'wrote nothing'), B6 (the traffic row carries SKILL.md:252's full exclusion list); record the reason for each.
9. AC#8: add a pins.json rubric revision note beside the fixtures one.
10. Verify with bun run eval:skill check under the memory scope; no model evaluation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in evals/rubric.md and evals/pins.json. Every sweep citation was re-read before acting on it; all held. Two corrections to the sweep's own line numbers: B5's "wrote nothing" gloss sits at rubric.md:123-124 (the unprompted paragraph), not at 130, and B4's permission is SKILL.md:144-146, not 145-147. Neither changes a finding.

JUDGEMENT ON CRITERION 1 - scoped the walk (the first route), not the already-absent-row protection (the second). The second route is row-granular: once a row is missing anywhere on the inherited board, it can never be a miss again, so an author that adds a brand-new hot-path edge to a fixture that happens to carry no traffic is unreachable by the walk. Scoping the walk to the subjects the write created or restated keeps the signal exactly where the author is answerable, reads straight off SKILL.md:241 ("before every write that creates or extends a board") and edit.md:9-13, and subsumes the second route's protection for the inherited remainder. Nothing is lost: the inherited section now routes an inherited omission to a fixture: concern, the same place an inherited inaccuracy already went, so the harness still hears about it.

CORRECTED, confirmed findings. A1: the opening of "What the skill adds unprompted" no longer says "for every run that created or changed a board", and a new paragraph before the unprompted contract names the walk's subject - the whole board on a create, the subjects added or restated on an edit - and sends an inherited omission to concerns as fixture:. "What the run inherited" carries the matching sentence. A2: the emphasis row now carries SKILL.md:253's cap (hero on the spine, about a third, never past half, muted on context), authoring.md:199-201's subject (a property of a line; a node and a step carry none) and authoring.md:166-171's exemption (a board with no spine marks nothing, which is correct for it). A3: the Flows bullet reads "repeat exactly where the source fixes the count, and a data-dependent loop, a branch or a caveat is a note", matching SKILL.md:221-223 and the rubric's own repeat/note rows. A5: the relationship row drops "returns to" and says a return travelling back is a flow step (authoring.md:218-219). A7: a closing paragraph says the tooling: prefix marks product-source reads alone - a harness failure the author did not cause is a concern without the prefix, and a CLI refusal the author read and repaired is the ordinary use SKILL.md:116-119 and authoring.md:252-263 teach, so no concern at all.

SUSPECTED FINDINGS - all five corrected, none judged correct as it stands. B1: the Lifecycle bullet now reads "derived from its predecessor, which is the current variant unless --from names another" (variants.md:5-7 makes --from optional, so S12 run-53cffd48e9 was written up for doing what the skill permits). B3: the unprompted paragraph now says the author naming the rows it judged not to apply is SKILL.md:244 obeyed - judge that judgement against the source, and let the saying of it cost nothing. This is deliberately NOT a change to not-applicable at rubric.md:23-27: that verdict is about declared features and is correct as it stands; the six written-up runs were using the catalogue's vocabulary, not the verdict's. B4: the incorrect bullet now says "a display name where only an id can name the subject: a group membership, or a relationship or step, which have no name - a node takes either", because SKILL.md:144-146 permits naming a node by either. B5: behaviouralCompleteness returns null "exactly when the walk had no subject: the run created and extended nothing", and the unprompted empty-list sentence matches. Under that rule S06 (adopt) and S09 (read) are correctly null, S11 (settling that restores a node) and S13 (a removal that restates a beat) are scored, so an arm's completeness figure stops silently resting on two thirds of its runs. B6: the traffic row carries SKILL.md:252's and authoring.md:186-189's full list - never teardown or cleanup, an error path, an optional hook most passes skip, startup, registration or a one-shot call - plus the inclusion clause (a call every normal pass makes counts even where an error could skip it), so a startup scenario like S07 justifies no traffic at all.

OUT OF SCOPE as instructed: A4 (the external row) and B2 ("a planned part stays unbound") untouched; both are TASK-270's vocabulary question.

AC#8: pins.json gains a rubric block beside fixtures, naming the revision and what stops being comparable. Note this is documentation of a fact the harness already enforces: the rubric text is a field of LoadedSuite and so part of inputDigest (provenance.ts:29-34), so a batch recorded before this edit is already refused for grading or reporting under today's inputs by assertBatchInputs.

VERIFIED: bun run eval:skill check passes (15 scenarios, 15 fixtures, 14 coverage parts); bun test src/runtime/skill-evaluation/tests 162 pass 0 fail; oxfmt clean on both files (the table repadded). No model evaluation was started, so the effect of these edits on grading is unmeasured and is not claimed.

LEFT UNDONE, and it matters: src/runtime/skill-evaluation/lib/grader.ts:250 restates the old rubric wording in the prompt itself - "one entry per catalogue row the source justifies on the board whether or not the request named it" and "a run that wrote nothing returns an empty list and null" - which now contradicts A1 and B5 in the same prompt as the corrected rubric. grader.ts:45's doc comment repeats the same gloss. Both belong to TASK-268 (its AC#5 is about these two fields) and to whoever owns that file; this task did not touch it.
<!-- SECTION:NOTES:END -->
