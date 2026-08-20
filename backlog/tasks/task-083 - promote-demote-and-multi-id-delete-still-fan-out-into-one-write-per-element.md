---
id: TASK-083
title: 'promote, demote and multi-id delete still fan out into one write per element'
status: To Do
assignee: []
created_date: '2026-08-20 21:19'
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
- [ ] #1 promote writes once, whatever the element count of the node, on the CLI and over MCP
- [ ] #2 demote writes once, on the CLI and over MCP
- [ ] #3 delete with several ids writes once
- [ ] #4 check-one-write counts all three on the wire and fails if any of them fans out
- [ ] #5 a promotion that is refused part way leaves the board untouched rather than half-applied, the way apply now does
<!-- AC:END -->
