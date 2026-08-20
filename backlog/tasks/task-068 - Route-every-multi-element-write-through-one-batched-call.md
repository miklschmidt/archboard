---
id: TASK-068
title: Route every multi-element write through one batched call
status: Done
assignee: []
created_date: '2026-08-20 20:13'
updated_date: '2026-08-20 21:11'
labels: []
dependencies: []
references:
  - src/core/element-ops.ts
  - src/cli/commands/elements.ts
  - src/cli/run.ts
  - src/server.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/design/server-is-the-truth.md
priority: high
type: enhancement
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 1 of docs/design/the-plan.md, and a prerequisite for everything after it. From ADR 0015: "Fan-out has to go first."

Four operations turn one logical intent into one HTTP write per element, in `src/core/element-ops.ts`:

  alignElements       line 90    Promise.all over N updates, concurrent
  distributeElements  line 116   N updates, sequential
  lockElements        line 161   Promise.all over N updates, concurrent
  groupElements       line 187   Promise.all over N updates, concurrent
  ungroupElements     line 230   Promise.all over N updates, concurrent

And `apply`, which is documented as the batch primitive and is not one. `src/cli/commands/elements.ts:54` loops the update list issuing one `PUT /api/elements/:id` per entry, then one `DELETE` per delete. Only `create` is batched, through `batchCreateElementsStrict`. `src/cli/run.ts:35` describes it as applying a patch "in one call", which is true of the caller's side and false of the wire.

WHY IT MATTERS MORE THAN IT LOOKS. Measured over 20 elements on a 300-element board: 20 concurrent PUTs cost 2.87 ms, the same intent as one batched write costs 0.13 ms. Twenty times the requests for twenty-two times the latency is a nuisance today. Under ADR 0015, where every write is a read-modify-write cycle against the note, it is twenty cycles racing on one file, which is lost updates rather than slowness. Under ADR 0016 each of the twenty would take and release the board lock separately, leaving nineteen gaps for another writer.

THE ROUTE ALREADY EXISTS. `POST /api/elements/changes` at `src/server.ts:1204` takes `upserts` and `deletes` and applies both in one pass. It is what the browser reports through. Two things stop an agent using it as it stands:

- `src/server.ts:1235` hardcodes `source: 'frontend_sync'` on every upsert, which is the field that distinguishes a human's edit from an agent's.
- `src/server.ts:1264` calls `noteChange(boardKeyForRequest, board, 'human')`, which would classify an agent's own drawing as human and make it eligible to be injected back at the agent (ADR 0005).

Both want an origin on the request, defaulting to the browser's current behaviour so the frontend does not have to change in the same commit.

NOT IN SCOPE. Returning the resulting document from this route is a separate task. This one is about how many writes an intent costs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 POST /api/elements/changes takes an origin, so an agent write is not stamped source: frontend_sync and is not classified as human by noteChange
- [x] #2 Omitting the origin keeps the exact behaviour the browser gets today
- [x] #3 align, distribute, lock, group and ungroup each issue one write, whatever the number of elements
- [x] #4 apply issues one write for its updates and deletes as well as its creates
- [x] #5 The CLI help for apply no longer claims a batch it does not perform
- [x] #6 bun run test is green, with check-geometry and check-surface-parity specifically exercised
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. POST /api/elements/changes takes origin ('human'|'agent'), defaulting to 'human' so the browser path is untouched: same merge, same source: frontend_sync, same noteChange(..., 'human').
2. An agent origin gets the same per-element semantics the single-element routes already give it, not a thinner second write path. Extract from PUT /api/elements/:id and POST /api/elements/batch: mergeElementUpdate (the merge, the text/originalText sync, sizeFromPath on new points, whether geometry moved or an arrow was re-pointed), buildCreatedElement (schema parse, id, fontFamily, version 1) and settleAfterWrite (re-route bound arrows, re-place bound labels). PUT and batch are then written in terms of them, so there is one implementation rather than two that must agree.
3. The agent path runs the whole intent in one pass: upserts (create or update by whether the board holds the id), then deletes, then one settle over everything that moved, then one broadcast and one noteChange(..., 'agent'). It returns the elements it created, because the server mints ids and an agent cannot name what it never chose. The resulting document is still TASK-074.
4. canvas-client gains applyElementChanges: one strict POST, origin 'agent', board attached like every other request.
5. element-ops: align, distribute, lock, group and ungroup each become one GET of the board and one write. The per-id GETs go too.
6. apply: one write for creates, updates and deletes together. Its 'Element X not found' check moves ahead of the write, so a bad id in the middle no longer leaves the earlier half applied.
7. New suite, one-write: a counting proxy in front of a real canvas, so the number of writes an intent costs is measured on the wire rather than asserted about the source. It also holds the properties the batched path must not lose: an agent write is not stamped frontend_sync and is not attributed to the human, a report with no origin still is, and a batched align still moves labels and re-routes arrows.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
WHAT MOVED.

src/server.ts. `POST /api/elements/changes` takes `origin`, 'human' by default.
The browser's path is the code that was there, moved into `applyReportedChanges`
and called with the same arguments; an agent's goes through `applyAgentChanges`,
which gives every element what the single-element routes give it and settles the
board once at the end of the intent. Three pieces came out of `PUT
/api/elements/:id` and `POST /api/elements/batch` so both sizes of write share
one implementation rather than two that have to agree: `mergeElementUpdate` (the
merge, the text/originalText sync, sizeFromPath on new points, whether geometry
moved or an arrow was re-pointed), `buildCreatedElement` and `settleAfterWrite`.
The route returns the elements it created, because the server mints ids; what it
changed is still TASK-074.

src/core/canvas-client.ts. `applyElementChanges` — one strict POST, `origin:
'agent'` stated in the one place agent writes go through.

src/core/element-ops.ts. align, distribute, lock, group and ungroup are each one
GET of the board and one write. The per-id GETs are gone too: a shared
`targets()` resolves the ids against one read.

src/cli/commands/elements.ts. `apply` is one write for creates, updates and
deletes together, and it resolves every id it was given before writing anything.

DECISIONS WORTH A SECOND OPINION.

One write, not two. AC 4 could be read as 'creates stay on the batch route and
updates and deletes join them in a second call'. It is one call, because a patch
is one intent and under ADR 0015 two writes are two read-modify-write cycles
against one note. That is why the route had to return created elements: `apply`
and `add` have always handed back what they created, and the server chooses the
ids.

`apply` is now atomic in its refusals. It used to throw 'Element X not found' in
the middle of the loop, leaving the updates before it on the board. Every id is
resolved first, so a bad one costs nothing. The check proves it.

`duplicate` was left alone: it was already one write, through the batch route
that returns what it created.

`updated` in apply's output counts the patch's own updates, not the elements the
board settled behind them. Counting the re-routed arrows there would answer a
question nobody asked, and is what TASK-075 is for.

REVERT-PROOF. New suite `one-write` (scripts/check-one-write.mjs, 31
assertions), a counting proxy between the client and a real canvas, so the
number of writes is measured on the wire rather than asserted about the source.

  · Revert element-ops.ts and cli/commands/elements.ts to HEAD, keep the server:
    10 of 31 fail. Six are the fan-outs, counted (20 PUTs for align, distribute,
    lock, unlock, group, ungroup), one is apply at 4 writes for one patch, one is
    apply applying half a refused patch, two are a batched move costing more than
    one write.
  · Keep the batching, route an agent's write through the browser's path: 4 of 31
    fail. The agent's element comes back stamped frontend_sync, the feed reports
    the agent's own drawing as ['human'], and the label and arrow behind a move
    are left where the box used to be.
  · Keep everything, drop `settleAfterWrite` from the agent path: 2 of 31 fail,
    both the label and the arrow.

bun run test is green: 16 suites. one-write 31, geometry 54, labels 128, obsidian
108, library 47, install 33, plus the pass/fail suites.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every multi-element intent is one write. align, distribute, lock, group, ungroup and apply each send a single POST /api/elements/changes instead of one HTTP write per element; the route takes an origin, defaulting to the browser's behaviour, so an agent's drawing is neither stamped frontend_sync nor reported to the change feed as a human's hands (ADR 0005). An agent's batched write is the same write a single-element PUT performs — one shared merge, one shared creation, one settling pass that re-routes arrows and re-places labels after the whole intent rather than after each element. Proved by a new suite, one-write, which counts writes on the wire through a proxy: reverting the batching fails 10 of its 31 assertions, reverting the origin fails 4, reverting the settling fails 2. bun run test green across 16 suites.
<!-- SECTION:FINAL_SUMMARY:END -->
