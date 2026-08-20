---
id: TASK-081
title: Teach the canvas skill when to claim a board and when not to
status: To Do
assignee: []
created_date: '2026-08-20 20:17'
labels: []
dependencies:
  - TASK-080
references:
  - skills/excalidraw-skill
  - docs/adr/0016-one-writer-at-a-time-per-board.md
type: docs
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 9 of docs/design/the-plan.md, after the claim exists. ADR 0016 puts the judgement in the skill rather than in the code, and deliberately: "The skill teaches the judgement: claim when the work is substantial and you know it in advance, do not claim to move one box."

A claim that an agent takes for every write is a lock held for the whole session, which is the design ADR 0016 rejected in its second paragraph. A claim an agent never takes leaves nineteen gaps in a twenty-element redraw. The code cannot tell which situation it is in; only the agent about to do the work knows, and only before it starts.

WHAT THE SKILL HAS TO SAY, at minimum:

- CLAIM when the work is substantial and known in advance: redrawing a board from code, restructuring a subsystem, working through a list of elements, anything where an intermediate state would be wrong to look at.
- DO NOT CLAIM to move one box, to change a colour, or to read anything. The per-write lock already covers those and is measured in milliseconds.
- STATE A REAL REASON. It is shown on a 75-inch display to somebody standing in front of it wondering why the board stopped responding. "Redrawing the payments board from src/payments" is a reason. "Working" is not.
- RELEASE WHEN DONE, and do not hold one across a pause waiting for a human to say something.
- LOSING A CLAIM IS NORMAL, not an error. A human's touch takes the board back. Stop, say what was and was not finished, and do not retry into it.
- WAITING IS NORMAL TOO. An agent blocked by a human waits rather than failing, because the expected wait is under a second, and when the cap is hit it says who holds the board and since when. In a voice session that is something to say out loud rather than going quiet.

WHERE. `skills/excalidraw-skill`, which is used outside this repo and stays path-free (CLAUDE.md). Run `node scripts/sync-skills.mjs` after editing, since `.agents/skills/` and `.claude/skills/` are derived.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The skill says when to claim, when not to, and what a good reason string looks like
- [ ] #2 The skill says that losing a claim to a human is normal and what to do about it
- [ ] #3 The skill says that waiting for a board is normal and what to say while waiting
- [ ] #4 The skill stays path-free, since it is used outside this repo
<!-- AC:END -->
