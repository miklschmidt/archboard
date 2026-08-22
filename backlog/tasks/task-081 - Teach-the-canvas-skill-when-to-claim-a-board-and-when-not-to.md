---
id: TASK-081
title: Teach the canvas skill when to claim a board and when not to
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:17'
updated_date: '2026-08-22 15:34'
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
- [x] #1 The skill says when to claim, when not to, and what a good reason string looks like
- [x] #2 The skill says that losing a claim to a human is normal and what to do about it
- [x] #3 The skill says that waiting for a board is normal and what to say while waiting
- [x] #4 The skill stays path-free, since it is used outside this repo
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the variant-and-swap route against a throwaway canvas on :3999 before documenting it: does `board save --board <b>@wip --as <b>` pass ADR 0006's hash check, and does the pane holding the source follow?
2. SKILL.md gains one section, `## Workflow: One writer at a time`, after Variants and comparison: the claim/do-not-claim rule, what a real reason string is, revoking is not undoing (leave the board sensible after each write, or work on a variant and swap, with the commands), losing it is normal, waiting is normal.
3. SKILL.md Error Recovery gains BOARD_HELD and CLAIM_REVOKED, which it mentions neither of today.
4. SKILL.md CLI Quick Reference gains one row pointing at the section; the cheatsheet's CLI table gains `claim`/`release` rows, which TASK-080 left only on the MCP side. The cheatsheet's MCP paragraph is left alone and not restated: the judgement lives in SKILL.md.
5. bun scripts/sync-skills.mjs, then bun run test (23 steps, both browser checks headless).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified the variant-and-swap route against a throwaway canvas on :3999 before documenting it (the user's canvas on :3000 untouched).

`board save --board payments@wip --as payments` passes ADR 0006's hash check and overwrites without --force, because the canvas wrote those bytes itself: saveKind branch, overwrote true, and the destination board reads the variant's content afterwards.

But a pane holding the destination hears nothing. The save's pane switch reaches the panes holding the SOURCE (src/server.ts:3805, `watching`), and the swap's source is the variant, so a pane on `payments` keeps rendering the pre-swap scene. Measured with a socket standing in for a pane: 10 elements before, 10 after the swap, 12 after a following `board open payments`. --reload is not needed; a plain `board open` repaints it. So the documented route ends with `board open <name>`.

WHAT WAS WRITTEN, AND WHERE.

SKILL.md gains one section, `## Workflow: One writer at a time`, placed after Variants and comparison so the variant route can lean on branching already being taught. Four beats: waiting (with the sentence to say out loud rather than going quiet), a two-row claim / do-not-claim table, the reason string with a real one against "Working", and then the two parts an agent gets wrong — a claim is not a transaction, and losing one is normal.

Error Recovery gains BOARD_HELD and CLAIM_REVOKED, which it named neither of. Exit code deliberately not quoted for either: both come back as the generic 1, so the code on the JSON is the thing to match on.

The CLI Quick Reference gains one row, a pointer rather than a second account.

KEEPING IT TO ONE ACCOUNT. TASK-080 put the judgement in the cheatsheet's MCP paragraph, which would have made it the second copy the moment SKILL.md said it properly. That paragraph is now the mechanics plus a pointer, and its lead-in likewise. The cheatsheet's CLI reference, meanwhile, had no claim/release at all — TASK-080 only reached the MCP table, and check-surface-parity reads only that table, so nothing noticed. Two rows added, mirroring where the MCP section sits.

architecture-workflow.md gets one line: a whole architecture pass is claim-shaped work. A pointer, not a third telling.

Verified: bun run test, 23 steps, green, both browser checks headless. check-install-doc and check-surface-parity both read the skill and both pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The canvas skill now teaches when to claim a board and, more to the point, what a claim is not.

The judgement is one table: claim for a redraw, a restructure, a list of elements, anything whose half-finished state would be wrong to look at; do not claim for one box, a colour, a promotion or a read, because an ordinary write already holds the board while it writes. The reason string is taught against a real example, since it is what somebody standing at a 75-inch display reads when their board stops responding.

The part the ADR said would go wrong gets its own heading. Revoking is not undoing: every write is already in the note, so an agent does not have the board until it says otherwise, it has it until the person standing at it wants it. Two ways out, both concrete — leave the board sensible after every write, or branch to a variant and swap it in — and the variant route is written as four commands rather than as advice.

The fourth of those commands came out of verifying the route rather than reading about it. The swap passes ADR 0006's hash check and needs no --force, but the save's pane switch follows the panes holding the SOURCE, and the swap's source is the variant, so the person's pane goes on showing the pre-swap board until a plain `board open`. Measured against a throwaway canvas with a socket standing in for a pane: 10 elements, 10 after the swap, 12 after the reopen. A doc that stopped at the swap would have left the human looking at the old board.

Error Recovery names BOARD_HELD and CLAIM_REVOKED, where an agent that has just lost a board looks and previously found nothing.

Kept to one account: TASK-080's cheatsheet paragraph, which had been the only place the judgement lived, is now mechanics plus a pointer. And the cheatsheet's CLI reference gained claim/release, which TASK-080 had put only on the MCP side — check-surface-parity reads that table alone, so nothing had noticed.

Verified: bun run test, 23 steps, green, both browser checks headless.
<!-- SECTION:FINAL_SUMMARY:END -->
