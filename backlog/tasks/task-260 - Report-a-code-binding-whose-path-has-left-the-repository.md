---
id: TASK-260
title: Report a code binding whose path has left the repository
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-17 22:29'
updated_date: '2026-09-17 22:50'
labels: []
dependencies:
  - TASK-259
references:
  - src/runtime/semantic-board-store/lib/diagnostics.ts
  - TASK-257
ordinal: 467000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A node's binding is part of its meaning and is what "open the code" resolves, and nothing notices when the path stops existing. The dogfood refresh found 9 of 89 bindings naming files the renderer's move into src/transformers had taken away, a year after the fact, only because somebody went looking. Measured after the rewrite: 221 bindings across every variant, and the 5 that still name a missing path all sit on a frozen historical variant.

It belongs in the vault checker rather than at the write boundary, for the same reason the drill-down checks do: the answer depends on a filesystem the board does not own, so it is true when written and goes stale on its own. And it must not run on historical variants — a binding that named a file which existed then is a correct record, and a check that flagged it would push somebody toward rebinding history to today's files, which would make the record lie.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The vault checker warns per node when a binding names a path that is not in the repository, naming the path
- [x] #2 The warning is not raised for a historical variant
- [x] #3 A test owns both, and the tracked vault passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/runtime/semantic-board-store/lib/bindings.ts: for every node carrying a binding on a variant that still accepts content edits (TASK-259's contentCheckedVariants), resolve the binding's repo to a checkout on this machine through repo-registry's checkoutFor, resolve the path inside it, and warn BINDING_PATH_MISSING naming repo, path and checkout when nothing is there. Reuse code-target's isPathWithin rather than writing a second containment rule; resolve each repository once per check run.
2. A repository this machine has not registered says nothing: skip it rather than warn, because that is a fact about this machine, not about the vault, and it would fire on every board of a fresh clone.
3. Call it from checkSemanticVault beside the drill-down checks, in the same board-order pass.
4. Own it in src/runtime/semantic-board-store/tests/bindings.test.ts with its own ARCHBOARD_REPOS registry and a throwaway checkout: a present path is silent, a missing path is warned once and names the path, an unregistered repo is silent, and the same missing binding stops being reported once its variant is frozen as historical.
5. Verify with the focused owners at --max-concurrency=1 and ./bin/dogfood check against the tracked vault (221 bindings, the 5 missing ones all on Renderer layout/Initial, which is historical).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation. New src/runtime/semantic-board-store/lib/bindings.ts, called from checkSemanticVault in the same board-order pass as the drill-down checks. For every node carrying a binding on a variant that still accepts content edits (TASK-259's contentCheckedVariants), it resolves the binding's repo to a checkout through repo-registry's checkoutFor — memoized once per check run, so a vault bound to one repository reads the registry once — resolves the path inside it, and warns BINDING_PATH_MISSING naming the node, the path, the repo and the checkout the path was looked for in. Containment reuses code-target's exported isPathWithin rather than a second lexical rule; existence is a plain fs.existsSync, so a dangling symlink counts as gone. Severity is warning, like every other checker finding: the board still draws and the repair is an ordinary agent write (ADR 0026).

Two deliberate silences, both in the file header. A repository this machine has not registered says nothing — where a repo identity lives here is machine-local, so warning would fire on every bound node of every board in a fresh clone and none of it would be about the vault. And a historical variant says nothing — the binding was true when it was written, and flagging it would push somebody toward rebinding history to today's files, which would make the record lie.

Kept synchronous. code-target's snapshot resolvers are async and checkSemanticVault is called synchronously by the server route and the CLI; making the checker async would ripple into files this task does not own, for no extra truth.

Validation. New owner src/runtime/semantic-board-store/tests/bindings.test.ts brings its own throwaway checkout and its own ARCHBOARD_REPOS registry: a present path is silent, a missing path is warned exactly once and the message names the path, an unregistered repository is silent, and after branching a rebound proposal and adopting it the same missing binding is still on the frozen variant and no longer reported. Flipping bindings.ts back to board.variants makes that last test fail, so it owns the exemption. bun test --isolate src/runtime/semantic-board-store/tests/ --max-concurrency=1: 146 pass, 0 fail.

Against the tracked vault: ./bin/dogfood check exits 0 with no diagnostics (after ./bin/dogfood stop && start, since check answers from the server's source). Proof the check is running rather than silently skipping: checkSemanticVault over a scratch copy of the same vault with Renderer layout/Initial thawed to draft reports exactly the five known BINDING_PATH_MISSING nodes (plus the drill-down mismatch); over the tracked vault it reports none. 221 bindings, one repository, five missing paths, all on that frozen variant.
<!-- SECTION:NOTES:END -->
