---
id: TASK-263
title: Give the skill one ordered runbook for building a board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 10:51'
updated_date: '2026-09-18 11:48'
labels: []
dependencies: []
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/create-sequence.md
  - .skill-evals/2026-09-18T01-50-12-580Z/report.md
  - TASK-211
priority: high
type: enhancement
ordinal: 470000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 2026-09-18 batch shows the skill states what to author but never sequences it, so authors skip steps the text already covers. S07 failed 5 of 6 runs on `flow.repeat` and `flow.message-kinds` in BOTH arms even though create-sequence.md teaches both and carries a worked example structurally identical to what S07 needs (tries CLAUDE.md then AGENTS.md with repeat 2, against Flask's wsgi.py/app.py candidates). Every candidate run read that file and still missed it. The material sits in SKILL.md as principles ("Evidence before a write", four numbered items) and a catalogue ("Everything the code shows", fourteen rows) that an author is meant to walk unprompted; nothing tells them when to walk it, and nothing asks them to check their own work afterwards. Two passes are missing entirely: modelling the same subject a second way before committing to one, and a simplification pass at the end. The runbook belongs in SKILL.md itself, not a reference, because it is what routes to the references.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SKILL.md carries one numbered runbook covering both diagram types from empty request to verified board, one sentence per step
- [ ] #2 The runbook names, at its own step, when to gather source context, when to decide the parts, when to map relationships, when to run semantic compare, when to run check, and which steps or spans of steps to repeat
- [ ] #3 A step directs the author to look in the source for fixed-count repetition and participant self-calls before writing a flow, and S07 passes flow.repeat and flow.message-kinds in a later batch
- [ ] #4 A step models the subject a second way and states why the chosen shape was kept
- [ ] #5 A final step has the author read its own board back and simplify it before reporting
- [ ] #6 The catalogue and evidence material is reached from a runbook step rather than standing as separate prose an author may pass over
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the 2026-09-18 report's S07 verdicts (repeat and self missing in both arms while the notes state the two candidates in prose) and the five recipes, to fix what the runbook has to sequence.
2. Add one numbered runbook to SKILL.md, placed above Essentials as the primary tier: one sentence per step, from picking the workflow to releasing the claim, each step routing to the recipe table, the evidence rules or the catalogue rather than restating them.
3. Give the flow-specific step its own place before the payload: go back to the source for fixed-count repetition and participant self-calls, naming a prose note over a fixed count as a missing repeat.
4. Add a second-modelling step that keeps the shape whose advantage over the rejected one the author can state, and carry that reason into the answer.
5. Add a final read-back-and-simplify step before the report step.
6. Remove the reference rows the runbook now routes to from the closing table so each pointer keeps one home; run bun scripts/sync-skills.ts and the install-target system test.
7. Note in the task that acceptance criterion 3's later eval batch cannot be run here: the user runs skill evals by hand.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in skills/archboard/SKILL.md (commit 280481c4).

- New first section `## The runbook`: sixteen numbered steps, one sentence each, placed above Essentials so the ordered walk is the primary tier and the rest of the file is the detail its steps reach. Steps: 1 pick the workflow and read its recipe, 2 vocabulary/vault/claim, 3 gather source context, 4 decide the parts, 5 map relationships, 6 the second source read a flow needs, 7 walk the catalogue, 8 model the subject a second way, 9 turn the request into checks, 10 one payload, 11 read the answer against the checks, 12 look at the picture, 13 semantic compare for a proposal and archboard check after a vocabulary edit or warnings, 14 repeat steps 4 to 13 per further write, 15 read the board back and simplify, 16 release and report.
- Step 6 is the S07 fix: a count the source fixes is that step's `repeat` and a call a participant makes on itself is a `self` step, with the failure named positively — a `note` that states in prose what the source counts is a `repeat` left out. The six S07 verdicts in the 2026-09-18 report are exactly that: notes saying 'tries wsgi.py then app.py' with no `repeat`, and no `self` or `async` step though cli.py:311-317 and cli.py:924-934 justify one.
- references/create-sequence.md step 3 now checks the same two things when reading the answer back.
- The evidence rules were reordered into the order the runbook reaches them (boundaries, bind, relationships, checks) so the step links read 1, 2, 3, 4 in sequence; no wording changed.
- The five recipes left the closing 'When to read more' table, which now holds only the four conditional references; the table points back at 'Which recipe', which the runbook reaches at step 1. One home per pointer.

Acceptance criterion 3's second half (S07 passing flow.repeat and flow.message-kinds in a later batch) cannot be verified here: skill evaluations are run by hand by the user, never started from a session. The guidance change is in place and unmeasured until the next batch.

Verified: bun scripts/sync-skills.ts synced both skills; bun test tests/system/cli/install-targets.test.ts 9 pass; oxfmt --check clean on both edited files.

Review round 1: eight findings addressed (commit 2c689aff).

Product truth. A claim is on a board the vault already holds — semantic-lock-routes.ts refuses BOARD_MISSING rather than claiming a board into existence — and claim.ts refuses a claim without --reason. Step 2 now claims a board that already exists and says a board this walk creates is claimed after the write that makes it; the Claims bullet carries both facts. The self check I added to create-sequence.md could not fail: edit-views.ts sets kind 'self' whenever from.node.id === to.node.id, so a saved from==to step always reads self. Both the recipe check and runbook step 8 now ask for the structural thing — a step whose from and to are both that participant — which is what can actually be missing.

Duplication and pointers. The six steps that restated an Essentials bullet (claim, write, read the answer, look at the picture, compare/check, release and report) are now one clause plus a link into Essentials, the way the evidence steps already worked; steps that needed a reference got one (step 8 to sequences-views-walkthroughs, step 14 to variants, step 17 to authoring for the removal keys, the vocabulary step to Essentials which links schemas). The runbook's own claim about itself is now what it does: each step links the detail it needs where that detail lives.

Shape. Views and walkthroughs moved out of the later-writes step into the one payload, where both recipes' worked examples have them; step 17 removes only what the read-back shows rather than commanding a write; steps 14 and 15 are separate conditionals (compare a proposal, check after a vocabulary edit or warnings) instead of one dense step.

AC#1, both diagram types: I judged step 1's delegation insufficient and added a sequence step to the walk. Step 7 orders the exchange — participants in column order, every message in the order the source runs them, returns included — step 8 is the repeat/self pass, and step 12 names the data-flow view over the flow in the one payload. The walk now authors a sequence rather than handing the whole type to a reference.

TASK-208.02 followed into the files I own: semantic edit --variant now exists, so evidence rule 4 and propose-compare.md teach the flag (the payload variant says the same thing; where they differ the command line wins and the answer says so). propose-compare's worked example moves the variant from the payload onto the command. edit.md and variants.md are another worker's.

SKILL.md is 27.2 KB against 24.3 KB before this task: the duplication is gone, and what remains is the eighteen-step walk itself plus the sequence step.

Correction to the evidence, and the counter-evidence, from the 2026-09-18 report's own verdicts (report.json, scenario S07, six runs).

Per check, not per union: flow.repeat is missing in 4 of 6 runs and flow.message-kinds in 4 of 6; 5 of 6 runs miss at least one, which is the '5 of 6' figure the description uses. The passes are run-d9445fe601 (repeat) and run-0a5cb9fd81 (message kinds), plus run-9589d57705, whose verdict is keyed flow.steps and flow.step-repeat rather than the scenario's declared keys and which got both right.

The counter-evidence, recorded so the next batch is read honestly: run-9589d57705 is the single S07 run the report lists as NOT having read references/create-sequence.md, and it is the one run that carried both — a self step with repeat 2 and a note naming the wsgi.py/app.py fallback, graded 'the strongest startup run seen'. Every run that did read the recipe missed at least one check. So the batch does not show the material was unreachable; it shows that reading it did not help. That is consistent with the premise this task acts on — the skill stated what to author and never sequenced it — but it is not proof of it, and a later batch that improves S07 is evidence for the runbook only if the runs that improve are runs that read their guidance.

AC#3's second half stays unverifiable from a session: skill evaluations are run by hand by the user.

Participant granularity (commit 8d9a1530), and my judgement on how far guidance can take it.

What the source justifies is not a property of the source. Keep a helper inside the part whose body runs it and its repeated work is that part's own step; give the helper a column and the same repetition is an ordinary call between columns. Both boards are true, and the skill licenses both on purpose: create-sequence.md says a repeat sits on a self step as readily as on a call to another column (TASK-256.06 AC#1), and a function the request names or the board draws is a participant (TASK-253.02). An author who never makes that choice makes it by accident while reading source, and learns which message kinds the exchange can hold only after the flow is written. run-d9445fe601 is the measured case: repeat 2 on a call to another column, flow.repeat passed, flow.message-kinds failed, and its board is not the worse one.

So the walk now settles the columns before the messages, as its own step (7) ahead of the ordering step (8), the recipe holds the rule — the request's names and the parts the board already draws are columns; past those two it is a decision, made once, applied to every helper alike, and stated — and the report step carries the choice. The example stays archboard's own chooseDoc inside Setup block, never a scenario's.

What this does NOT do, stated plainly rather than papered over: it cannot make S07's flow.message-kinds deterministic. That check asks for a self or async message 'where the source justifies it', and with prepare_import and locate_app given their own columns — which the prompt's own wording invites — the repetition is an ordinary call and nothing else on the path is a participant acting on itself, unless the author counts run_simple's blocking serve as a self step, which is a framing choice too. An author can therefore do everything the runbook asks, deliberately and reportably, and still fail that check. Making the scenario, the rubric and the harness's flow-with-steps outcome check (which today asks only for sync and return) agree with the shapes the skill licenses belongs to TASK-267; TASK-263 owns the guidance and stops here. I edited no evals/ file.

Review round 2 (commit 7bfc993f).

The granularity dilemma was false, and the fact that dissolves it is in the product and was in no document: every participant must name a node (buildFlow resolves them, and settled() refuses NODE_IN_FLOW when one is gone) but no rule makes a node a participant, so a flow's participants are a subset of the board's nodes. A board may draw a helper as a child of the part that runs it and the flow still keep that part as the one column; the honest board and the self step were never in competition. It now sits in three places, because three things pushed the other way: runbook step 7 states it where the columns are chosen; evidence rule 3 adds that landing a call on the child is where a relationship goes rather than who takes part in an exchange; and sequences-views-walkthroughs states it where participants are defined, which is where step 9 sends the author. Neither the containment rule (TASK-253.02) nor the repeat-on-either-shape sentence (TASK-256.06 AC#1) moved — the subset is what lets all three stand together. This supersedes my earlier note that the conflict could not be closed in the skill: it can, and TASK-267 still owns whether a self message is truthful for that exchange and whether the scenario, the rubric and the flow-with-steps outcome check agree.

Also fixed: the --variant conflict is a Warning diagnostic the write emits, not something the machine-readable answer carries, so SKILL.md and propose-compare.md now use the phrasing edit.md and variants.md already use ('the command line wins, and the write warns naming both'). The claim on a board this walk creates is an instruction on the write step instead of a fact no step acts on, and step 19 releases a claim you took. drillDown moved to step 3, the listing step that finds the board. The temporary-directory rule for a picture and 'archboard repo add' reach the walk through the Verification bullet and evidence rule 2, which its steps already link.

Citation correction: the per-feature verdicts I counted are in .skill-evals/2026-09-18T01-50-12-580Z/graders/claude/verdict-*.json (S07 in verdict-1, -2, -5, -14), not in report.json, whose S07 node holds only the arm summary. The figures in the earlier note stand: flow.repeat missing in 4 of 6, flow.message-kinds missing in 4 of 6, 5 of 6 missing at least one.
<!-- SECTION:NOTES:END -->
