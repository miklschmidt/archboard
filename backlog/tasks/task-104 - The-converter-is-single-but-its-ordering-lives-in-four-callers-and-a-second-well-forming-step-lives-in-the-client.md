---
id: TASK-104
title: >-
  The converter is single, but its ordering lives in four callers and a second
  well-forming step lives in the client
status: To Do
assignee: []
created_date: '2026-08-23 15:01'
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
