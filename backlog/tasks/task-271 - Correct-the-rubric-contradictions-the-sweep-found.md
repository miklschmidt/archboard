---
id: TASK-271
title: Correct the rubric contradictions the sweep found
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 12:34'
updated_date: '2026-09-18 13:01'
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

REVIEW ROUND 1 FINDINGS, 2026-09-18, recorded here so they survive a machine reboot. Not yet addressed. Reviewer verified every cited skill passage against the rubric as it now stands, checked the batch's 90 verdicts, verified the digest claim in code, and ran eval:skill check (passes) and fmt:check (clean).

Criteria 2,3,4,5,7,8 met. Criterion 1 met but defective (F1, F2). Criterion 6 met in substance but in the wrong section (F3).

MUST FIX

F1. rubric.md:140-142 contradicts rubric.md:120-121, on exactly S13. The subject is "the subjects it added or RESTATED"; the empty-list clause then names "a removal that added nothing" as an empty-list case, and the null gloss is "created and EXTENDED nothing". S13 is a removal that restated a walkthrough beat - a subject by the first sentence, an empty list by the second. The implementation notes say S13 is scored, which is the reading the rubric's own text denies. The crack is wider than S13: three of the four edit scenarios write only restatements - S03 (restates nodes to add memberships, under "Nothing else changes"), S10 (restates three edges to change traffic), S13 - so the whole edit arm's completeness could come back null from one grader and scored from the next. The skill's own answer is narrower than the rubric's: references/edit.md:27 says "Walk the catalogue for what you add", which the rubric's paragraph does not cite. Resolution: pick one and say it in both places - either "added or restated" throughout (then the empty-list clause must read "added and restated nothing" and "a removal that added nothing" must go), or follow edit.md:27 and drop "or restated" (then S03, S10 and S13 are all null, which must be stated so nobody reads the missing figure as a regression).

F2. rubric.md:144-147 - the walk was rescoped, the score it feeds was not. behaviouralCompleteness still asks "does THE BOARD use every semantic the source justifies", with anchors "10 has every justified row used; 5 has the parts and calls and little else". On an edit the board is overwhelmingly inherited, so a grader can return an empty unprompted list under the new scoping and still score 5 because the BOARD has little else - which is precisely the 4.4/4.8 edit-arm figure finding A1 was measured on and meant to fix. AC#1 is therefore only half-delivered: the missed-row count moves, the score need not. Resolution: rescope the score sentence to the walk's subject ("does what the run wrote use every semantic the source justifies for it") and restate the 10/5/0 anchors against that subject.

OPTIONAL

F3. AC#6's correction is in the wrong section for the failure it names. The six write-ups were CONCERNS, not unprompted entries - four found verbatim in the batch (S01 run-d8418dceef, S14 run-f62d961d5a, S00 run-578b7391da, S14 run-04f27a34ab), each of the form "the final message claims X was not applicable, which overstates the case". The fix sits inside the unprompted section (rubric.md:139-140); the Concerns section (rubric.md:227-231) is unchanged and is the instruction the graders were following. The B3 distinction is sound and leaving rubric.md:23-27 alone is right. One clause in Concerns would close it.

F4. A3's residual: the graders' error was factual, not only loose wording. Their reason was "Two steps loop over lists the source fixes", a wrong claim about Flask. The new paired clause says "a data-dependent loop" while the skill says "a loop over a list of unknown length" (SKILL.md:222), and the real discriminator is that before_request_funcs' length is decided by what an application registered - a grader can reason a registration list is not data-dependent. Naming the discriminator would make the 8 repeat misses on S00/S05 unreachable. S07 is unaffected either way.

F5. The old null gloss survives in the report's own legend: report-markdown.ts:320 defines the Completeness column as "how far a board that wrote something uses the semantics", the pre-edit rule, and report-change.ts:160 and :225 repeat it in doc comments. The grader never sees these so they do not defeat the correction, but they are now the wrong definition of the column for every human reading report.md. Reviewer confirms that APART FROM grader.ts:250 and :45 (routed to TASK-268), no corrected rubric text is restated anywhere the grader sees it.

F6. fixture: routing is real but low-visibility. Graders already use the prefix (19 prefixed concerns in the batch), nothing in the code consumes it, and report.md prints no concerns section at all - so an inherited omission reaches a human only through report.json or the verdict jsonl. The new rule will push noticeably more traffic down it, potentially one concern per justified row per untouched part.

F7. rubric.md:112's note row omits "a caveat", which the new Flows bullet at :79 adds (SKILL.md:255 has it). rubric.md:108's relationship list is narrower than SKILL.md:251's - pre-existing, untouched by A5, harmless for the Flask scenarios, but a rubric/skill gap in a row this commit edited.

F8. The walk's subject paragraph (rubric.md:120-127) sits AFTER the 14-row table, so a grading model reads every row before learning the scope. Moving it above the table would co-locate the scope with the rows it governs.

ON THE CRITERION 1 JUDGEMENT CALL: the reviewer endorses scoping over exemption and would have made the same choice, for the reason given plus a stronger one - edit.md:27 says it more directly than SKILL.md:241 or edit.md:9-13. Checked against the batch, the scoping lands where A1 measured the damage: S03's 2 traffic + 2 emphasis misses, S10's 3 flow + 3 view misses, and S13's 12 misses all fall outside a scoped walk. Two caveats: a removal's scoping is under-defined (F1), and a removal is the one case where a scoped walk can miss real damage - an author removing a node and leaving inbound calls un-redirected wrote nothing, so unprompted sees nothing. That gap is covered by S13's declared features and by semanticCorrectness/architecturalTruth, so it is a tolerable consequence rather than a hole.

NO MISFIRES FOUND beyond F1/F2: the emphasis cap retires the 14 unsatisfiable penalties without granting a blanket exemption (one hero of three on S01 is still within the cap and still markable), and the traffic exclusions make S07's startup board justify no traffic, with no scenario declaring traffic on a startup board.

AC#8's digest claim verified TRUE and is the stronger guarantee: rubric is a LoadedSuite field (suite.ts:405, read at :503); inputDigest (provenance.ts:29-34) hashes the rubric bytes; assertBatchInputs (provenance.ts:107-119, called from grading-run.ts:40) refuses grading OR reporting on a mismatch; and boundByOlderPins cannot rescue an old batch because it recomputes the digest with today's rubric text.

ROUND 2, addressing the review findings.

F1 (must fix) - one definition, stated once, used everywhere. The authority is references/edit.md:27, "Walk the catalogue for what you add". What the run added: on a board it created, the whole board; on a board it changed, every subject it created and every existing subject it gave a new value in any field (a relationship restated to carry traffic, a node restated with a membership or binding, a beat restated to name a different part). A subject restated unchanged, a removal, and every subject never written add nothing. Why 'a new value in any field' rather than 'a new semantic': the grader has the before and after boards, so a changed field is checkable by comparison, while 'new semantic' would need a grader judgement about which fields count; and S10's traffic write is scored under it, as the reviewer required. Walking every row of a touched subject (not only the changed field) follows SKILL.md:147-148: a restated subject is restated whole, so the author did write all of its fields. The rows that ask whether the board should hold a new exchange, subset or explanation (flow, view, walkthrough) are walked only on a board the run created - this is what keeps S10's flow and view misses out - while a flow, view or walkthrough the run did add is walked like any subject, its steps for repeat and note. The old 'added or restated' paragraph, the 'removal that added nothing' clause and the 'created and extended nothing' null gloss are gone; the inherited section says 'only on inherited subjects' in the same words. NULL IN THE CURRENT SUITE: S06 (adopt) and S09 (read), and any run that only removes. S03, S10, S11 and S13 add values and are scored; a null there is a grader error. This is written in pins.json so nobody reads a missing figure as a regression; the rubric itself names kinds, not scenario ids, because it is the grader's instruction and should not couple to the suite.

F2 (must fix) - behaviouralCompleteness now asks whether what the run added uses every semantic the source justifies for it, says to score the walk's subject and never the inherited rest, restates 10/5/0 against that subject (10 includes the case where nothing beyond the request was justified), and is null exactly when the run added nothing.

F3 (taken) - the Concerns section says a final message naming the rows the author judged not to apply is what the skill asks for and no concern; a disagreement is a missed entry in unprompted. rubric.md:23-27 still untouched.
F4 (taken) - the Flows bullet and the note row now use the skill's discriminator, a list of unknown length (SKILL.md:222), and name what decides it: data or an application's own registrations, such as the hooks an application registered.
F7 (taken) - the note row carries 'a caveat' (SKILL.md:255); the relationship row lists calls, renders, reads from, emits an event or message to, depends on or publishes to (SKILL.md:251). Row keys unchanged: the table still has exactly the fourteen keys TASK-268 reads.
F8 (taken) - the scope now sits above the table.
F6 (noted, no change) - fixture: concerns are consumed by nothing and report.md prints no concerns section, so an inherited omission reaches a human only through report.json or the verdict files; the scoping will send more down that channel. Surfacing concerns in report.md belongs to whoever owns the report code (TASK-268's module).
F5 - not mine; routed by the coordinator to TASK-268.

Verified: eval:skill check passes (15/15/14); bun test src/runtime/skill-evaluation/tests 162 pass 0 fail; oxfmt clean on both files. Still no model evaluation run, so the effect on grading is unmeasured. grader.ts:250 and :45 still restate the pre-TASK-271 null gloss and whole-board walk; that remains with TASK-268.
<!-- SECTION:NOTES:END -->
