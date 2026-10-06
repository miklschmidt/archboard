---
id: TASK-369.06
title: archboard-dev sets a task's footprint against its proposal at close
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:19'
updated_date: '2026-10-06 12:13'
labels:
  - history
  - skill
dependencies:
  - TASK-369.02
  - TASK-369.05
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: medium
type: chore
ordinal: 654000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a task closes, archboard-dev inspects each proposal against the code as built. The footprint shows at once which changed parts the proposal did not name, and which named parts the task never changed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The archboard-dev closing steps read the footprint of the task's commits against each proposal before adoption
- [x] #2 A changed part that no proposal names is either added to a proposal or explained in the task notes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Skill-only change: it affects no board (no code, command or route changes), so this task carries no board proposal.
1. Base rule: the parent of the task's first commit, found by the Refs: TASK-<n> trailer every task commit carries. Not the commit that recorded the plan: plans here are written in bulk days before the work (TASK-369.05's plan commit is 7 days older), so that base drags in a week of other work.
2. Add one closing step to skills/archboard-dev/SKILL.md before adoption (after the proposal is corrected to what was built, because the footprint reads the proposal, and before adopt, because an adopted proposal is the current variant and is refused NOTHING_TO_COMPARE): read semantic footprint <board> --base <base> --variant <proposal> for each proposal; how to read namedAndChanged / changedNotNamed / namedNotChanged, skipped and unread, large commits, commits of other work in the range; a changed part no proposal names is added to a proposal or explained in the task notes; a named part not changed is a deviation to explain; PARENT_SUPERSEDED reads against the restated proposal. Step 6 (behind) stays and covers boards no proposal names; steps are numbered so the code check of TASK-367.26 slots in beside them.
3. Trial on a task closed today (TASK-369.05): scratch server on a copy of the vault with the proposal restored as a draft; record the command output and what it told, in the notes.
4. Gate: lint, fmt:check, test:repository, one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What was built

Closing step 3 of skills/archboard-dev/SKILL.md (new): sets the task's commits against each proposal before adoption. The later steps move down by one (adopt 4, PARENT_SUPERSEDED 5, check 6, check --code 7); each step has its own Done line, so the code check of TASK-367.26 slots in beside step 3 or 7. No board is affected: the change is a skill. .archboard/README.md does not list the closing steps (it points at the skill), so it is unchanged.

## Decisions

1. Base rule: the parent of the first commit that carries the Refs: TASK-<n> trailer and changes anything outside backlog/ and .archboard/. Reasons: the trailer is on every task commit, so the rule needs no note that somebody could forget; the plan's commit is not a base because plans are recorded days before the work (TASK-369.05 was planned in a bulk commit on 09-29, the work started 10-06 13:38); the exclusion keeps a plan or vault-plan commit that carries the trailer (TASK-367.05: vault plan at 13:53, first code at 14:05) from moving the base. On a branch the base is main. The rule found 155bdef83 for TASK-368.08 (the base TASK-369.05's notes used) and a375e9e77 for TASK-369.05.
2. The step is before adoption and after the correction (step 2): the footprint reads the proposal as corrected, and an adopted proposal is refused NOTHING_TO_COMPARE.
3. Criterion 2: a changed part that no proposal names is added to a proposal when the commit added, removed, renamed or rewired something the board draws or changed what the part is for (the planning test of step 1); it is explained in one line of the task notes when the commit only changed how the part works inside. Decide before adoption, because later an addition costs a second proposal. Other tasks' commits in the range are left out of the notes: their closing covers them (ADR 0045).
4. After PARENT_SUPERSEDED the footprint is read against the restated proposal, which is named TASK-123 after TASK-122: the name TASK-123 alone resolves to the shelved original, and the command refuses it as not a draft (seen in the trial).

## Trial (scratch server on a copy of the vault, port 3416, stopped)

The adopted proposals of TASK-369.05 cannot be read any more (the current variant is the proposal). I restored the draft in a copy of the vault: Command interface, variant 'TASK-369.05 after TASK-369.03' made a draft, TASK-369.03 current again, its adoption dropped. Base by the rule: a375e9e770c7bc40f92cb33afddacb0a1ea62ac0. HEAD was 67abff5ed, so the range holds 34 commits, after the task's end too.

    ARCHBOARD_URL=http://127.0.0.1:3416 ARCHBOARD_VAULT=<copy> ./bin/archboard semantic footprint "Command interface" --base a375e9e77... --variant "TASK-369.05 after TASK-369.03"
    Footprint of "Command interface" at "TASK-369.03" against proposal "TASK-369.05 after TASK-369.03": 5 of 34 commits since the merge base with a375e9e770c7bc40f92cb33afddacb0a1ea62ac0 changed a part it read.
    Named and changed (1):
      Footprint (src/cli/commands/semantic-footprint.ts): 2 commits; named: added; added relationship Footprint -> Server client; added relationship Contract execution -> Footprint
    Changed but not named (4):
      Command catalogue (src/cli/commands/run.ts): 1 commit
      Vault check (src/cli/commands/vault.ts): 1 commit
      Commands (src/cli/commands): 5 commits
      Locality (src/cli/commands/semantic-locality.ts): 1 commit
    Named but not changed (2):
      Contract execution (src/cli/command-contract/lib/execution.ts): 0 commits; named: added relationship Contract execution -> Footprint
      Server client (src/runtime/engine/server-client.ts): 0 commits; named: added relationship Footprint -> Server client
    Skipped, in no list: 4 parts.

The range by task (git log --format='%h %(trailers:key=Refs,...) %s' base..HEAD): of the 5 commits that changed a part, 0c606eead and c0b7a4332 are TASK-369.05, 495cd7147 is TASK-367.05, e932123c4 is TASK-369.03, 7aa84e38e is TASK-368.07.

What the steps told:
- Footprint: named and changed. The plan as built.
- Command catalogue (changed, not named): 0c606eead registered the command in run.ts. The task's own commit, and the board's test fails: the registration is a list entry, and the proposal draws the call through Contract execution as the other commands are drawn (review decision of TASK-369.05). Explained in the notes, not added.
- Commands (changed, not named): a container bound to the directory src/cli/commands. 5 commits from three tasks; the task's two are the Footprint part's files. Needs no line.
- Vault check (495cd7147, TASK-367.05) and Locality (e932123c4, TASK-369.03): other work in the range. Left out.
- Contract execution and Server client (named, not changed): named only by the added relationships; a new caller does not change the file it calls. Normal.
- Skipped 4: all drill-down parts (Command routing, Archboard server, Board rasterizer, Walkthrough recorder); Archboard server had a TASK-369.05 proposal, so the step is run on it too.

Second trial, no proposal: Renderer layout from the base of TASK-368.08 by the same rule (155bdef83): 2 of 57 commits changed 6 parts (Compound graph, Layout engines, Block engine, Renderer core, Entry row 2 commits each; Card blocks 1), 5 skipped. 57 commits is the range of a task that shared main with five other tasks that day, so the trailer listing is how the step tells the task's commits from the others.

## Gate

bun run lint pass; bun run test:repository 20 pass, 0 fail; bun run fmt:check: skills/archboard-dev/SKILL.md is clean; the only file it lists is src/runtime/history-lens/lib/coupling.ts of TASK-369.04, in progress by another agent.

Parent verified on 2026-10-06: the step's base command gives a375e9e77 for TASK-369.05 and 155bdef83 for TASK-368.08, as the trial reported.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard-dev's closing steps now set the task's commits against each proposal before adoption (new step 3): the base is the parent of the first commit with the task's Refs trailer outside backlog/ and .archboard/, the footprint is read per proposal, other tasks' commits in the range are left out by their trailers, a changed part that no proposal names is added to the proposal when it changed what the board draws and explained in the notes otherwise, and a restated proposal is named 'TASK-n after TASK-m'. Verified by a trial on a vault copy for TASK-369.05 and TASK-368.08, recorded in the notes, and by running the base rule on both tasks.
<!-- SECTION:FINAL_SUMMARY:END -->
