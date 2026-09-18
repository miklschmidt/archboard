---
id: TASK-267
title: S07 expects a self message only one participant granularity can justify
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 11:42'
updated_date: '2026-09-18 13:31'
labels: []
dependencies: []
references:
  - evals/evals.json
  - skills/archboard/references/create-sequence.md
  - .skill-evals/2026-09-18T01-50-12-580Z/report.md
  - TASK-253.02
  - TASK-256.06
  - TASK-263
priority: high
type: bug
ordinal: 474000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S07's flow.message-kinds asks for "sync, return and at least one self or async message where the source justifies it". Whether src/flask/cli.py justifies one is not a property of the source: it is decided by how finely the author names participants, and nothing tells them which granularity this subject wants.

The only candidate for a self message is the fallback loop at cli.py:311-317, `for path in ("wsgi.py", "app.py")`. Keep to the participants the prompt names (Shell, FlaskGroup, run_command, ScriptInfo, run_simple) and the scan is ScriptInfo calling itself, so a self step with repeat 2 carries it. Give prepare_import and locate_app their own columns — which reading the source invites, and which TASK-253.02 positively requires of a function the board draws — and the repetition becomes an ordinary call to another column, leaving no self message anywhere in the exchange.

Measured in the 2026-09-18 batch: flow.message-kinds is missing in 4 of 6 S07 runs across both arms. run-d9445fe601 put repeat: 2 on the prepare_import step and passed flow.repeat while failing flow.message-kinds, which is not a worse board — prepare_import and locate_app are genuinely different functions. The one run that got both, run-9589d57705, modelled the scan as a self step; it is also the run the report lists as not having read references/create-sequence.md, and its verdict is one of the five the grader answered off-checklist (it is keyed flow.step-repeat, not the declared flow.repeat).

The recipe sentence that sends readers to the losing shape is deliberate, not a regression: TASK-256.06 AC#1 added "repeat sits on a self step as readily as on a call to another column" precisely so repeat would be reachable in both shapes, and it worked. TASK-256.06's own notes already record the cost of the other half, that forcing a drawn function into a column produced pictures where two alternative branches read as called in one pass. So the fix is not to revert either rule but to settle which reading of cli.py is the truthful one and make the scenario, the rubric and the recipe agree on it. Note also that the harness's own flow-with-steps outcome check for S07 asks only for sync and return, so the harness and the grader already disagree about whether a self step is required.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 It is settled and written down whether a self message is truthful for the flask run startup exchange, and the reason is recorded against the source
- [ ] #2 S07 expects of the author only what the source decides, not what a participant-granularity choice decides: either the scenario names the granularity it grades, or flow.message-kinds stops requiring a self or async message it cannot guarantee exists
- [ ] #3 The scenario feature and the flow-with-steps outcome check agree about whether a self or async step is required
- [ ] #4 references/create-sequence.md tells an author how to choose participant granularity for a subject like this one, without losing what TASK-253.02 and TASK-256.06 each bought
- [ ] #5 A later batch shows S07 runs passing or failing flow.message-kinds for a reason in the board, not for the granularity the author happened to pick
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read pinned Flask 3.0.0 cli.py (735a4701) and settle whether a self step is truthful for the flask run startup exchange; record the reason against source lines.
2. Rewrite S07 flow.message-kinds so it names the self step the source decides instead of 'self or async where the source justifies it'; cite the passages that teach it (SKILL.md runbook step 9, create-sequence.md step 1/3, sequences-views-walkthroughs.md Flows).
3. Make S07's flow-with-steps outcome check require the same kinds as the feature.
4. Check SKILL.md and create-sequence.md as they stand for criterion 4; close any remaining gap minimally in create-sequence.md only.
5. Verify with bun run eval:skill check; commit S07 + create-sequence.md; record notes. Criterion 5 stays pending the user's next batch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found during TASK-263's review, and it changes this task's framing: a flow's participants are a chosen SUBSET of the board's nodes. Every participant must name a node, but not every node need be a participant (src/runtime/semantic-board-store/lib/edit-views.ts:71,429). So a board may draw prepare_import and locate_app as children of flask.cli while the flow keeps ScriptInfo as one column — an author does not have to choose between an honest board and a self step, and cli.py:311-317 can be ScriptInfo calling itself without hiding the helpers.

That weakens, but does not remove, the case that S07 is at fault. It means the granularity conflict IS resolvable in guidance, and TASK-263 is adding the rule to the runbook's participant step. What remains for this task is whether the scenario should depend on the author finding that subset fact at all: flow.message-kinds still asks for a self or async message "where the source justifies it" while the harness's own flow-with-steps check for S07 asks only for sync and return, and the two should not disagree. Judge this task against a later batch run after TASK-263's rule lands: if S07 still fails flow.message-kinds with the rule in place, the expectation is wrong; if it passes, only the harness/grader disagreement is left to settle.

Correction to the note above, from TASK-263's round-3 review: column granularity is NOT the axis that decided S07, so the framing in this task's description and in the previous note is too narrow.

Re-read of all six verdicts: run-9589d57705, the only run to pass both checks, GAVE prepare_import and locate_app their own columns — the same nine participants as the runs that failed. run-0a5cb9fd81 had a self step ("ScriptInfo choosing its source") but no repeat; run-d9445fe601 had repeat 2 on ScriptInfo -> prepare_import but no self step. So dropping the helper columns was never required, and the coarse-column reading is not what separated the passing run.

What separated it: the author modelled the candidate SEARCH ITSELF as one step with ScriptInfo at both ends carrying the repeat, separate from the prepare_import call it makes per candidate. The work a part does to decide what to do next is its own step; the calls it then makes are others. Nothing in the skill said that, and "a call a participant makes on itself" does not reach an author who reasons that ScriptInfo calls prepare_import rather than itself — which is exactly what run-d9445fe601 did.

TASK-263 is adding that rule as a clause on its step 9. What remains for this task is unchanged in substance but should be judged on the right axis: whether S07's flow.message-kinds asks for something the source decides, and whether the grader feature and the flow-with-steps outcome check (which asks only for sync and return) should disagree. Judge against a batch run after TASK-263's clause lands.

AC1 settled against pinned Flask 3.0.0 cli.py (735a4701): a self step IS truthful, and not because of column granularity. The flask entry point is FlaskGroup(name='flask') with no create_app (cli.py:1051), and plain 'flask run' with no --app leaves app_import_path None (_set_app, cli.py:394-400), so run_command -> info.load_app() (cli.py:898) takes the fallback at cli.py:311-317: 'for path in ("wsgi.py", "app.py")', prepare_import(path) and locate_app(...) per candidate, then 'if app: break'. The iteration over a literal two-item tuple and the stop on the first that yields an app are ScriptInfo.load_app's own lines; neither prepare_import nor locate_app performs them. So whichever columns the helpers take, ScriptInfo's search is a step with ScriptInfo at both ends, separate from the per-candidate calls - exactly TASK-263's runbook step 9. Nothing in cli.py is fire-and-forget (run_simple blocks; any reloader process is werkzeug's), so async is never justified here.

AC2/AC3: flow.message-kinds now names that self step instead of 'self or async where the source justifies it' and says no async; its citations add SKILL.md#the-runbook (step 9 teaches the deciding step) to create-sequence.md (step 1's rule, step 3's self check) and sequences-views-walkthroughs.md#flows (self kind, participants as subset). The flow-with-steps outcome check now requires kinds [sync, return, self], so harness and grader agree. evals/rubric.md untouched: its Flows row ('self as the source justifies') already supports this.

AC4: SKILL.md step 7 (columns are a subset, choose before messages) and create-sequence.md step 1 already teach how to choose granularity while keeping TASK-253.02 (a function the request names is a participant; one the board draws is a candidate) and TASK-256.06 (repeat on a self step as readily as on a column call). One gap remained: create-sequence.md said a helper given a column makes 'the same call an ordinary message between columns' with no caveat, which is the reasoning run-d9445fe601 followed. Added one sentence: either way, the caller's deciding work is its own step at both ends, separate from the per-candidate calls. Generic, no Flask content.

Verified: bun run eval:skill check -> suite ok: 15 scenarios, 15 fixtures, 14 coverage parts. Commit 89e53ab7.

AC5 pending the user's next batch (not run here). Evidence that would count: S07 verdicts where flow.message-kinds passes on a run that has a ScriptInfo->ScriptInfo search step and fails on one that lacks it, independent of whether prepare_import/locate_app got columns; and the flow-with-steps outcome agreeing with the grader verdict per run.

REWORK after review (commit 9654eb96), superseding the AC1-AC5 notes above where they differ.

AC1 corrected: a self step is a NOTATION CHOICE for the flask run exchange, not something cli.py forces. The lines above are right (cli.py:311-317 is load_app's own loop), but the loop body is exactly two calls, prepare_import and locate_app; apart from iterating and 'if app: break' it does nothing else. It is a loop header, which a sequence diagram draws as a loop fragment around two calls, and archboard has no loop fragment. So 'the search as a self step with repeat 2, then each call' and 'repeat on the per-candidate calls, plus a note for the early exit' are two equally truthful approximations. Contrast the skill's own example: chooseDoc (src/cli/commands/lib/repo-setup-block.ts:77) is a real function Setup block calls on itself (via chooseSetupDoc, :237), a genuine self-invocation; cli.py has no equivalent. run-d9445fe601 drew the second shape, was judged truthful, and the earlier harness change would have failed it.

Circularity that prompted the user's decisions: runbook step 9's 'the work a part does to decide what to do next is its own step, separate from the calls it then makes per candidate' was written from what S07's one passing run did, and the first commit then graded S07 against it. A rule shaped by one scenario's success breaks the same standing rule as one shaped by its failure (skill examples never from evals).

User decision 1, done: SKILL.md step 9 narrowed to real self-calls, grounded in the recipe's own example: a call a participant makes on itself (a function or method invoking another of its own, as Setup block reaches its own chooseDoc) is one step with that participant at both ends; a count the source fixes is the repeating step's repeat, on a self step or a call to another column alike, and a note stating the count in prose leaves it out. The deciding-work framing is gone; no Flask, no scenario trace. create-sequence.md: removed my added deciding-work sentence; 'the same call is an ordinary message between columns' is true again unqualified, and 'Both shapes carry the repeat the source fixes' plus TASK-256.06's 'on a self step as readily as on a call to another column' read coherently.

User decision 2, done: flow.message-kinds now requires sync and return with the candidate search in either truthful shape (a self step on ScriptInfo carrying the repeat, or the per-candidate calls carrying the repeat with a note) and says a self step is not required. flow-with-steps kinds back to [sync, return] (outcomes-family.ts:339 cannot express 'or'), so harness and grader agree (AC3). Dropped the 'no async' clause: run_command passes threaded=with_threads (cli.py:930, default True at :854) and werkzeug hands each request to a thread it does not wait for, so async request dispatch has evidence.

Citations for flow.message-kinds: SKILL.md#the-runbook (narrowed step 9 says the repeat goes on a self step or a call to another column alike), references/create-sequence.md#create-a-sequence-diagram (step 1: both shapes carry the repeat; repeat on a self step as readily as on a call to another column), references/sequences-views-walkthroughs.md#flows (kind vocabulary and repeat/note rules).

AC4: met by create-sequence.md step 1 as it stood before my first change (subset fact, keep-inside vs give-a-column choice, both shapes carry repeat) together with SKILL.md step 7; it keeps TASK-253.02 (named functions are participants, drawn ones candidates) and TASK-256.06 (repeat on either shape). No added text remains.

Verified: bun run eval:skill check -> suite ok: 15 scenarios, 15 fixtures, 14 coverage parts. bun scripts/sync-skills.ts run.

AC5 restated, pending the user's next batch: what counts is (a) whether runs that follow the guidance draw a truthful shape of the candidate search (either shape, repeat on the step that repeats, early exit in a note), and (b) whether any run whose flow is truthful is still failed on flow.message-kinds or flow-with-steps. A run failed only for choosing the column-call shape over a self step would show the expectation is still wrong.

ROUND 2 (commit f438fbc4), superseding the round-1 notes where they differ.

Step 9 made portable: the inline 'as Setup block reaches its own chooseDoc' is gone; the clause now reads 'a call a participant makes on itself (a recursive function, a method calling another of its own, a component updating its own state, a handler re-entering itself; the sequence recipe's example shows one)'. Still one sentence, still linking sequences-views-walkthroughs.md for the detail; no archboard part names in shared guidance.

create-sequence.md step 1: 'a loader trying its own candidates' removed from the self-call examples, replaced by 'a method calling another of its own'. It taught a candidate loop as a self-call, which is exactly the notation choice this task settled is not forced. The worked example is unaffected: its self step is grounded in chooseDoc being a real function the part calls.

flow.message-kinds reduced to kinds only: 'sync and return, with self or async only where drawn truthfully; neither is required'. Repeat placement now belongs to flow.repeat alone, so a run is not charged twice for it: 'the loading step, whichever step draws the search over the candidate files, carries repeat of at least 2: a self step on ScriptInfo, or a per-candidate call (one call carrying it with a note naming the calls that repeat is enough)'. This accepts run-d9445fe601's shape (repeat 2 on prepare_import). flow.repeat's citations gain SKILL.md#the-runbook (step 9: repeat on a self step or a call to another column alike) and references/create-sequence.md#create-a-sequence-diagram (both shapes carry the repeat). flow.message-kinds keeps the-runbook (step 9: what a self step is), create-sequence.md (step 1's kind list) and sequences-views-walkthroughs.md#flows (kind table). flow-with-steps stays [sync, return], matching the reduced feature.

Verified: bun run eval:skill check -> suite ok: 15 scenarios, 15 fixtures, 14 coverage parts; bun scripts/sync-skills.ts synced both skills.
<!-- SECTION:NOTES:END -->
