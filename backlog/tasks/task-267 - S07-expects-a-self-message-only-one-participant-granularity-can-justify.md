---
id: TASK-267
title: S07 expects a self message only one participant granularity can justify
status: To Do
assignee: []
created_date: '2026-09-18 11:42'
updated_date: '2026-09-18 11:55'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found during TASK-263's review, and it changes this task's framing: a flow's participants are a chosen SUBSET of the board's nodes. Every participant must name a node, but not every node need be a participant (src/runtime/semantic-board-store/lib/edit-views.ts:71,429). So a board may draw prepare_import and locate_app as children of flask.cli while the flow keeps ScriptInfo as one column — an author does not have to choose between an honest board and a self step, and cli.py:311-317 can be ScriptInfo calling itself without hiding the helpers.

That weakens, but does not remove, the case that S07 is at fault. It means the granularity conflict IS resolvable in guidance, and TASK-263 is adding the rule to the runbook's participant step. What remains for this task is whether the scenario should depend on the author finding that subset fact at all: flow.message-kinds still asks for a self or async message "where the source justifies it" while the harness's own flow-with-steps check for S07 asks only for sync and return, and the two should not disagree. Judge this task against a later batch run after TASK-263's rule lands: if S07 still fails flow.message-kinds with the rule in place, the expectation is wrong; if it passes, only the harness/grader disagreement is left to settle.

Correction to the note above, from TASK-263's round-3 review: column granularity is NOT the axis that decided S07, so the framing in this task's description and in the previous note is too narrow.

Re-read of all six verdicts: run-9589d57705, the only run to pass both checks, GAVE prepare_import and locate_app their own columns — the same nine participants as the runs that failed. run-0a5cb9fd81 had a self step ("ScriptInfo choosing its source") but no repeat; run-d9445fe601 had repeat 2 on ScriptInfo -> prepare_import but no self step. So dropping the helper columns was never required, and the coarse-column reading is not what separated the passing run.

What separated it: the author modelled the candidate SEARCH ITSELF as one step with ScriptInfo at both ends carrying the repeat, separate from the prepare_import call it makes per candidate. The work a part does to decide what to do next is its own step; the calls it then makes are others. Nothing in the skill said that, and "a call a participant makes on itself" does not reach an author who reasons that ScriptInfo calls prepare_import rather than itself — which is exactly what run-d9445fe601 did.

TASK-263 is adding that rule as a clause on its step 9. What remains for this task is unchanged in substance but should be judged on the right axis: whether S07's flow.message-kinds asks for something the source decides, and whether the grader feature and the flow-with-steps outcome check (which asks only for sync and return) should disagree. Judge against a batch run after TASK-263's clause lands.
<!-- SECTION:NOTES:END -->
