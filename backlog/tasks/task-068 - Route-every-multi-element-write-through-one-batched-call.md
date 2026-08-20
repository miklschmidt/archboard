---
id: TASK-068
title: Route every multi-element write through one batched call
status: To Do
assignee: []
created_date: '2026-08-20 20:13'
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
- [ ] #1 POST /api/elements/changes takes an origin, so an agent write is not stamped source: frontend_sync and is not classified as human by noteChange
- [ ] #2 Omitting the origin keeps the exact behaviour the browser gets today
- [ ] #3 align, distribute, lock, group and ungroup each issue one write, whatever the number of elements
- [ ] #4 apply issues one write for its updates and deletes as well as its creates
- [ ] #5 The CLI help for apply no longer claims a batch it does not perform
- [ ] #6 bun run test is green, with check-geometry and check-surface-parity specifically exercised
<!-- AC:END -->
