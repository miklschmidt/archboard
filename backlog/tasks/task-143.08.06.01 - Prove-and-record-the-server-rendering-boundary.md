---
id: TASK-143.08.06.01
title: Prove and record the server rendering boundary
status: To Do
assignee: []
created_date: '2026-09-02 01:57'
labels: []
dependencies:
  - TASK-143.08.01
references:
  - docs/adr/0009-every-call-names-its-board.md
  - docs/adr/0015-the-note-is-the-board.md
  - docs/design
  - package.json
  - src/ui/canvas/mermaidConverter.ts
parent_task_id: TASK-143.08.06
priority: high
type: spike
ordinal: 265000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Resolve the only material implementation uncertainty before product cutover: whether the pinned Excalidraw export and Mermaid conversion stack is reliable under Bun or Node DOM and canvas emulation. The evidence must cover real Archboard board features and resource behavior with zero connected browser clients. Prefer emulation. Permit an isolated server-owned headless Chromium fallback only for concrete fidelity or reliability failures that cannot be removed at lower total complexity. Record the resulting board-operation, browser-operation, and rendering boundary as a durable decision that preserves explicit board naming and note authority while superseding the pane-dependent exceptions in ADR 0009.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A bounded proof renders representative Archboard fixtures to PNG and SVG and converts representative Mermaid input with zero browser clients using Bun or Node emulation, covering bound labels and arrows, fonts, images or embedded files where supported, backgrounds, and the element shapes used by current workflows.
- [ ] #2 The evidence records correctness, determinism expectations, startup and steady-state memory, cleanup, global DOM or canvas isolation, failure behavior, and the exact gaps that affect reachable Archboard workflows; reproducible inputs are canonical and cheaply regenerated outputs are ignored.
- [ ] #3 Bun or Node emulation is selected when it meets the documented reachable-workflow bar. A headless Chromium fallback is selected only when the evidence names an unresolved material defect, demonstrates that fallback behavior, and proves it is an isolated server-owned resource rather than a user browser or pane.
- [ ] #4 A new ADR records the board versus `browser` command boundary, lazy named-note resolution, render semantics, the chosen runtime and fallback rule, and which parts of ADR 0009 and the TASK-121 mechanism it supersedes without weakening ADR 0015 note authority.
- [ ] #5 `CONTEXT.md` defines the canonical terms for board operations, browser operations, and server rendering without introducing Pane or Canvas synonyms.
<!-- AC:END -->
