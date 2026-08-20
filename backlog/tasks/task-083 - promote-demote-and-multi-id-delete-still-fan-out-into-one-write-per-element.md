---
id: TASK-083
title: 'promote, demote and multi-id delete still fan out into one write per element'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 21:19'
updated_date: '2026-08-20 21:49'
labels: []
dependencies:
  - TASK-068
references:
  - src/cli/commands/promote.ts
  - src/core/mcp-dispatch.ts
  - src/cli/commands/elements.ts
  - scripts/check-one-write.mjs
  - docs/design/the-plan.md
priority: high
type: enhancement
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while landing TASK-068, which routed align, distribute, lock, group, ungroup and `apply` through the one batched write. Three callers were left behind, and they are the same bug rather than a related one.

`promote` and `demote` issue one PUT per element in `plan.updates`, on both surfaces: `src/cli/commands/promote.ts:53`, and `src/core/mcp-dispatch.ts:941` and `:949`. A node is not one element. The shipped PostgreSQL stencil is seven lines, so promoting it is seven writes for one intent — and promotion is the act that TASK-053 made outrank the element type, so drawing a node from a stencil is the ordinary path, not an edge case.

`delete <id> <id> <id>` is one DELETE per id at `src/cli/commands/elements.ts:133`.

Today this is a nuisance that costs latency. Under stage 8 of docs/design/the-plan.md each write becomes a read-modify-write cycle racing on a single note, which is lost updates, and under stage 9 each is a separate acquisition of the board lock with a gap after it. ADR 0015's "one intent must be one write" covers these exactly as it covered the five TASK-068 fixed, so stage 8 is not safe while they stand.

Nothing new has to be built. The route takes `upserts` and `deletes` in one pass and accepts `origin: 'agent'`, and `applyElementChanges` in `src/core/canvas-client.ts` is the one place that states it.

Count the writes on the wire, not in the source. `scripts/check-one-write.mjs` already proxies the server for exactly this reason: a check that reads source cannot tell a batched call from a loop written on one line.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 promote writes once, whatever the element count of the node, on the CLI and over MCP
- [x] #2 demote writes once, on the CLI and over MCP
- [x] #3 delete with several ids writes once
- [x] #4 check-one-write counts all three on the wire and fails if any of them fans out
- [x] #5 a promotion that is refused part way leaves the board untouched rather than half-applied, the way apply now does
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. promote/demote on the CLI (src/cli/commands/promote.ts): the loop over plan.updates becomes one applyElementChanges({ upserts }), skipped entirely when the plan changes nothing so a no-op demotion still costs no write.
2. promote/demote over MCP (src/core/mcp-dispatch.ts): the same, on both branches, replacing the per-element updateElementOnCanvas calls and their per-element failure messages with one failure for the intent.
3. delete with several ids (src/cli/commands/elements.ts): every id resolved against one read of the board first, so a missing id is refused with nothing deleted, then one applyElementChanges({ deletes }) — the shape apply already has.
4. check-one-write: drive each of the three through the code the CLI and MCP call, count on the wire, and hold what batching must not lose — the metadata actually lands, demotion strips it, a refused delete leaves the board whole.
5. AC 5: work out whether promotion can still be refused part way once it is one write. targetElements already resolves every id before planning, so state plainly whether anything is left to guard.
6. Revert-proof each of the three separately and report the counts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WHAT MOVED.

src/cli/commands/promote.ts. `applyUpdates` is one `applyElementChanges({ upserts })`
instead of a PUT per element, and it does nothing at all when the plan changes
nothing, so a demotion of something that was never promoted still costs no
write. Both `promote` and `demote` go through it, as before.

src/core/mcp-dispatch.ts. The same, in `writePlan`, which both arms of
promote_selection/demote_selection call. The per-element failure message
("Failed to write metadata to element X") became one failure for the intent
naming every element in it, because there is now one thing that can fail.

src/cli/commands/elements.ts. `delete <id> <id> <id>` reads the board once,
refuses if any id is missing, then sends one write. It used to be a DELETE per
id, so a bad id was refused with the ones before it already gone.

CLAUDE.md. The one-write paragraph names promotion, demotion and multi-id
delete alongside the five TASK-068 fixed.

MEASURED ON THE WIRE, through check-one-write's proxy. A node of seven line
elements, which is what the shipped PostgreSQL stencil is:

  promote, CLI    7 writes -> 1
  demote, CLI     7 writes -> 1
  promote, MCP    7 writes -> 1
  demote, MCP     7 writes -> 1
  delete a b c    3 writes -> 1

AC 5 IS VACUOUS, AND HERE IS WHY.

Both surfaces resolve every id against a read of the board before they build a
plan (`targetElements` on the CLI, the same lines inline over MCP), so a
promotion naming something the board does not hold is refused before it writes.
That was already true; the batching removes the second refusal point, because
one write cannot stop in the middle. The check pins both halves: 0 writes, and
no metadata on the six elements that were fine.

There is one residual hole, and it is not promotion's. `applyAgentChanges`
mutates the board as it walks its upserts, so an upsert the server cannot build
throws with the earlier ones already applied. Measured against a throwaway
canvas: two upserts, the second naming an id that is not there, returns 500 and
leaves the first element's customData written. No caller can reach it by
getting an id wrong; it needs the element deleted between the caller's read and
its write, which is a second writer, which is ADR 0016's subject. It is common
to every batched agent intent, `apply` included, so it is filed as TASK-084
rather than fixed here.

REVERT-PROOF, against the new 49-assertion suite.

  · Revert src/cli/commands/promote.ts only:  2 fail, both counted (7 PUTs).
  · Revert src/core/mcp-dispatch.ts only:     2 fail, both counted (7 PUTs).
  · Revert src/cli/commands/elements.ts only: 3 fail — 3 DELETEs for one
    delete, 2 DELETEs for a delete that should have written nothing, and the
    board left half-emptied by the refusal.
  · All three:                                7 fail.

bun run test is green, 17 suites, exit 0. one-write went from 31 assertions to
49.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The three callers TASK-068 left behind are batched. promote and demote each send one POST /api/elements/changes instead of a PUT per element, on the CLI and over MCP alike, and delete with several ids sends one write after resolving every id against the board. Promotion is where it mattered: a node is not one element, and the shipped PostgreSQL stencil is seven lines, so declaring it a datastore cost seven writes for one sentence somebody said out loud. Measured on the wire through check-one-write's proxy, which grew from 31 assertions to 49: 7 writes to 1 for promote and demote on both surfaces, 3 to 1 for a three-id delete. Reverting the CLI promote fails 2, the MCP promote 2, the delete 3, all three 7. AC 5 turned out vacuous and is recorded as such: both surfaces already refused a bad id before writing anything, and one write cannot stop half way. The one residual half-apply lives in applyAgentChanges, needs a second writer to reach, is common to every batched intent including apply, and is filed as TASK-084. bun run test green, 17 suites.
<!-- SECTION:FINAL_SUMMARY:END -->
