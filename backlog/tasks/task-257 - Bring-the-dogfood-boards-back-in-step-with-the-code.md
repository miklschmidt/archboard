---
id: TASK-257
title: Bring the dogfood boards back in step with the code
status: To Do
assignee: []
created_date: '2026-09-17 18:09'
updated_date: '2026-09-17 18:09'
labels: []
dependencies:
  - TASK-255
references:
  - .archboard/README.md
  - TASK-255
  - TASK-254
ordinal: 463000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracked .archboard/vault has not been touched since commit b2e15022 on 2026-09-13, and 141 commits have landed since. It holds 11 boards for a source tree of 92 modules, and the drift is already measurable: 9 of its 89 code bindings point at files that no longer exist, all of them from the renderer's move out of src/runtime/semantic-renderer/lib into src/transformers (architecture.ts, dataflow.ts, edges.ts, regions.ts, svg/architecture.ts, svg/cards.ts, svg/document.ts, text.ts, theme.ts). Whole subsystems built since — the skill evaluation harness, the Codex workhorse and coordinator family, the rasterizer — have no board at all, while `Archboard` still draws the system as it stood in September.

This is the repo's own dogfood: .archboard/README.md tells an agent to start at `Archboard` with ./bin/dogfood, and every board it reads there is stale enough to mislead. It is also the place the skill's worked examples now come from (TASK-254), so a board that lies about the code makes the skill lie with it.

Two things to decide while doing it, not before: how much of a 92-module tree a system board should carry before it drills down, and whether a binding whose path has left the repo should be a checker diagnostic rather than something a person notices a year later.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every code binding in .archboard/vault names a path that exists in this repository
- [ ] #2 The boards describe the system as it now stands, including the subsystems built since 2026-09-13 that no board covers
- [ ] #3 A reader starting at `Archboard` with ./bin/dogfood can reach every board through the drill-down links, and no link opens a board the vault does not hold
- [ ] #4 The boards were authored through the archboard CLI, not by editing vault files
- [ ] #5 bun run check passes
<!-- AC:END -->
