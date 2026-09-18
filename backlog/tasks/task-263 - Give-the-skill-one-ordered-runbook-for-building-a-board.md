---
id: TASK-263
title: Give the skill one ordered runbook for building a board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 10:51'
updated_date: '2026-09-18 11:26'
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
<!-- SECTION:NOTES:END -->
