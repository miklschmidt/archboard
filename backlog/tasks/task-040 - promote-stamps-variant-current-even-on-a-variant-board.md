---
id: TASK-040
title: promote stamps variant current even on a variant board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 03:29'
updated_date: '2026-08-20 04:18'
labels: []
dependencies: []
references:
  - src/core/promote.ts
  - src/core/compare.ts
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while rewriting the skill for TASK-037. src/core/promote.ts around line 383 stamps customData.archboard.variant with 'current' regardless of which board the node is being promoted on. Promote a node on payments@option-a and the node records that it belongs to current.

This is the same defect family as TASK-035, which fixes save --as leaving copied nodes claiming the old variant. TASK-035 is scoped to the copy path, so this one survives it: even after TASK-035 lands, a node promoted directly on a variant board is stamped wrong, and compare reports it as a variantAnomaly.

The skill currently works around it by telling the agent to pass --variant when promoting on a variant board. That instruction should not have to exist. A node's variant is a fact about the board it is on, and the board is always named on the call, so nothing needs to be passed.

Sequence this after TASK-031 and TASK-035, both of which are in flight and touch the same files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Promoting on a variant board stamps that board's variant, with nothing passed by the caller
- [x] #2 compare reports no variantAnomaly for a node promoted directly on a variant board
- [ ] #3 The skill's instruction to pass --variant when promoting is removed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/promote.ts: PromotionRequest gains a required boardVariant, the variant of the board being promoted on. planPromotion resolves `request.variant ?? request.boardVariant`, and DEFAULT_VARIANT goes away. The literal 'current' was the bug: it made a fact about the board something the caller had to state.
2. src/cli/commands/promote.ts: read the board's identity with getBoardInfo() and pass its variant as boardVariant. --variant stays as an override.
3. src/core/mcp-dispatch.ts: the same, in the promote_selection arm only.
4. scripts/check-geometry.mjs passes boardVariant on its one planPromotion call, since a .mjs caller gets no type check. scripts/check-branch-compare.mjs is untouched: it passes --variant explicitly on purpose.
5. scripts/check-boards.mjs, in the TASK-035 variant block: promote through the real CLI on a variant board with nothing passed, and assert the stamp is that board's variant; assert --variant still overrides; assert a current board still stamps current; and compare a board against a variant branched from it where the node was promoted directly, asserting no variantAnomaly.
6. Report the skill text to remove as a task comment, since a sibling agent owns skills/excalidraw-skill/.
7. bun run test, plus the negative control: patch the resolution back out of dist and count the checks that fail.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The default now comes from the board, not from a literal.

promote.ts: PromotionRequest gains a required boardVariant and planPromotion resolves `request.variant ?? request.boardVariant`. DEFAULT_VARIANT is gone. Both surfaces read the board's identity for it: the CLI and the MCP promote_selection arm each call getBoardInfo(), which needs no vault, so promote still works on an unsaved or scratch board. --variant survives as an override for the promotion that really does mean another variant.

AC1: five checks in scripts/check-boards.mjs, in the TASK-035 variant block, driving the real CLI. Promoting on shipping@option-a with no --variant exits 0 and stamps 'option-a'; the same call on the current board still stamps 'current'; --variant option-z still wins. Over MCP, promote_selection {board: 'freight@option-a', kind: 'service', elementIds: [...]} against a throwaway server returns variant 'option-a' and the element reads back 'option-a'.
AC2: with a node promoted on each of shipping and shipping@option-a, compare reports nodesChanged 0, nodesUnchanged 1, and no stale-variant warning. The existing TASK-035 check that a node genuinely copied between boards still reports variantAnomaly is untouched and still passes.
AC3: not done here. A sibling agent owns skills/excalidraw-skill/ this run, so the four passages to remove are in a comment on this task.

Negative control: patching dist/core/promote.js back to `request.variant ?? 'current'` makes exactly 3 of the 5 new checks fail, with the reported symptom in the output: variantAnomaly {from: null, to: 'current'} on rate-quoter and the stale-variant warning naming it. The two that stay green are the two that should, the current-board stamp and the --variant override.

scripts/check-branch-compare.mjs is untouched and passes: it passes --variant explicitly, which is now an override rather than the only correct spelling. scripts/check-geometry.mjs got boardVariant on its one planPromotion call, because a .mjs caller gets no type check.

bun run test exits 0.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 04:16
---
AC3, for whoever owns skills/excalidraw-skill/ (a sibling agent holds that directory this run, so the code change landed without it). Four sites, all now false:

1. skills/excalidraw-skill/SKILL.md:54 — drop the flag from the worked example.
   archboard promote --board payments@option-a --ids cache --kind datastore --variant option-a
   becomes
   archboard promote --board payments@option-a --ids cache --kind datastore

2. skills/excalidraw-skill/SKILL.md:391-393 — remove:
   - **`--variant <v>`** must match the board when the board is not `current`;
     the default is `current` and a wrong stamp shows up as a change in every
     `compare`. `--level` records the abstraction tier the same way.
   suggested replacement:
   - **`--variant <v>`** overrides the board's own variant, which is what a node
     promoted on it records by default. Nothing has to pass it. `--level` records
     the abstraction tier the same way.

3. skills/excalidraw-skill/SKILL.md:519-524 — remove the whole paragraph, replacing it with nothing:
   **Promote with the board's own variant.** `promote` stamps `variant: current`
   unless told otherwise, so a node promoted on `payments@option-a` claims to
   belong to `current` and `compare` flags every one of them as changed. Pass
   `--variant option-a` when promoting on a variant board. Nodes copied by the
   branch carry the source's stamp and will be flagged the same way: that is
   bookkeeping, not architecture, and reporting it as a difference is wrong.
   Both halves are now wrong: promote reads the variant off the board (TASK-040), and branching restamps the copies (TASK-035).

4. skills/excalidraw-skill/references/architecture-workflow.md:126-128 — the anti-pattern keeps its point but loses the promote clause:
   - Reporting a node's `variantAnomaly` as an architectural change. It means the
     node's own `variant` stamp disagrees with the board it sits on, which is
     bookkeeping left by a copy or by a promote that did not pass `--variant`.
   becomes
   - Reporting a node's `variantAnomaly` as an architectural change. It means the
     node's own `variant` stamp disagrees with the board it sits on, which is the
     trace of a node copied in from another board without being re-promoted.

Nothing in references/cheatsheet.md or evals/evals.json teaches the workaround, so those stay as they are.
---
<!-- COMMENTS:END -->
