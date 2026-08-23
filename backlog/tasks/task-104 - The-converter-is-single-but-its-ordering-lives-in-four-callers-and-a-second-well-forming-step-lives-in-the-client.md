---
id: TASK-104
title: >-
  The converter is single, but its ordering lives in four callers and a second
  well-forming step lives in the client
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-23 15:01'
updated_date: '2026-08-23 16:10'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/expand-elements.ts
  - src/core/normalize.ts
  - src/core/labels.ts
  - src/core/scene-io.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: enhancement
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0015 says one converter, on the way in. That is true of the function — `expandElements` (`src/core/expand-elements.ts:336`) is single — and false of the boundary around it, which is a pipeline each write-path caller orders itself. At commit 2a4d9cc: `applyAgentChanges` (`src/server.ts:2530–2588`) runs merge -> `resolveArrowBindings` -> `sizeFromPath` -> `restateLabels` -> `expandForBoard` -> deletes -> `settleAfterWrite` -> `settleDocument` (eight stages); `POST /api/elements` (:1476) runs `expandForBoard` only; `PUT /api/elements/:id` (:1556) runs `restateLabels` then `expandForBoard`; `POST /api/elements/batch` (:2141) runs `expandForBoard` only. ~290 lines of element surgery and bookkeeping (`sizeFromPath`, `pathOf`, `resolveArrowBindings`, `rerouteBoundArrows`, `settleBoundTexts`, `mergeElementUpdate`, `restateLabels`, `spendArrowRefs`, `buildCreatedElement`, `settleAfterWrite`; :1799–2105) live in the route file, and every bug marker in that territory (TASK-034, -038, -073, -074, -088) sits at a call site — the arithmetic was extracted, the write-back and version/updatedAt bump were not. A second "make this a well-formed element" exists client-side: `normalize.prepareElement` (`src/core/normalize.ts:70`) is called from `mcp-dispatch.ts`, `cli/commands/elements.ts` and `library-catalogue.ts` (seven sites) and never by the server, which uses `buildCreatedElement` (:2060); an element created through the CLI is normalised twice by two functions, one posted raw once. `src/core/scene-io.ts:4–13` is a `core/` module that imports `canvas-client` and reaches back over HTTP — a CLI command in core clothing.

Architecture review 2026-08-23, candidate 4. Deepened shape: one entry takes named elements in the input spelling and returns the board shape, owning the stage order and the write-back bookkeeping; `normalize.prepareElement` and `buildCreatedElement` collapse into it; `scene-io` moves to the CLI. Completes ADR 0015 one layer up rather than contradicting it. TASK-102's write door calls this as one stage — do the two in sequence, not instead of each other.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One entry point converts named elements in the input spelling to the board shape, and every write-path caller in `src/server.ts` hands it the same thing with no knowledge of stage order
- [ ] #2 Arrow binding, label restating, measuring, id minting and the version/updatedAt bump happen inside that entry, not at route call sites
- [ ] #3 One implementation of "make this a well-formed element": `normalize.prepareElement` and `buildCreatedElement` no longer both exist
- [ ] #4 No module under `src/core/` imports `canvas-client`; `scene-io` lives with the CLI
- [ ] #5 `test:browser` still asserts a zero diff after a render; `test:labels`, `test:geometry`, `test:one-write` pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one core applyElementInput entry whose request carries input-spelling upserts, deletes, and origin, and whose result names the resulting elements plus the created/updated/deleted board-shape delta. Move creation and update well-forming, id minting, arrow-ref spending and routing, text and label conversion, version stamping, map write-back, consequences, and document settling behind it.
2. Replace the create, update, batch, delete, and change-report element surgery in src/server.ts with calls to that entry while leaving board reads, persistBoard, broadcasts, and agentWriteAnswer in their routes. Extend the label/geometry checks at the new interface and run the focused verification loop.
3. Remove client-side prepareElement and prepareElementUpdate calls so CLI, MCP, library, and import surfaces send the same input spelling to the server entry. Preserve only non-element helpers in normalize.ts, update checks, and run the focused verification loop.
4. Split pure scene assembly into core, move the HTTP-backed scene I/O module to src/cli/, update callers and checks, then audit every remaining src/core canvas-client import and document the client-by-nature exceptions. Run the focused verification loop.
5. Update stale design references, run bun run test in full with the browser suites headless and sequential through the existing chain, record evidence, finalize every acceptance criterion, and commit each buildable slice with a TASK-104-prefixed sentence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 1: Added src/core/apply-element-input.ts with applyElementInput(board, { upserts, deletes, origin, timestamp }). It owns well-forming, ids, input spelling consumption, arrow routing, measured conversion, label restating, version and updatedAt stamping, board-map write-back, consequences and document settling. POST/PUT/batch/delete/change-report routes now call that entry and retain only read/persist/broadcast/answer orchestration. scripts/check-labels.mjs now drives the real entry and proves minted block ids, spent label spelling, measured standalone and bound text, routed arrow refs, and version/updatedAt bumps. Verification: type-check green; labels 182 checks; geometry 82 checks; one-write 58 checks; changes all checks; module-scope 51 modules, 1 waived, no unwaived state.

Slice 2: Deleted normalize.prepareElement and prepareElementUpdate. CLI add/apply/update, MCP create/update/batch, library insertion, and scene import now send input-spelling objects unchanged; canvas-client accepts serializable element input instead of requiring a pre-built ServerElement. The server entry is now the only well-forming implementation and scripts/check-obsidian-md exercises it directly. Verification: type-check green; MCP 6 checks; obsidian-md 197 checks; surface parity green; library 49 checks; labels 182; geometry 82; one-write 58; changes green; module-scope green.
<!-- SECTION:NOTES:END -->
