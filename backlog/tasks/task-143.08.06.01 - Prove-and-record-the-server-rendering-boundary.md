---
id: TASK-143.08.06.01
title: Prove and record the server rendering boundary
status: To Do
assignee: []
created_date: '2026-09-02 01:57'
updated_date: '2026-09-02 02:02'
labels: []
dependencies:
  - TASK-143.08.01
references:
  - docs/adr/0009-every-call-names-its-board.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
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
Resolve the remaining implementation uncertainty under ADR 0020: whether the pinned Excalidraw export and Mermaid conversion stack is reliable under Bun or Node DOM and canvas emulation. The evidence must cover real Archboard board features and resource behavior with zero connected browser clients. Emulation remains the required first choice. An isolated server-owned headless Chromium fallback is permitted only for concrete fidelity or reliability failures that cannot be removed at lower total complexity. Record the measured backend choice and keep the accepted board-operation, browser-operation, and rendering boundary accurate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A bounded proof renders representative Archboard fixtures to PNG and SVG and converts representative Mermaid input with zero browser clients using Bun or Node emulation, covering bound labels and arrows, fonts, images or embedded files where supported, backgrounds, and the element shapes used by current workflows.
- [ ] #2 The evidence records correctness, determinism expectations, startup and steady-state memory, cleanup, global DOM or canvas isolation, failure behavior, and the exact gaps that affect reachable Archboard workflows; reproducible inputs are canonical and cheaply regenerated outputs are ignored.
- [ ] #3 Bun or Node emulation is selected when it meets the documented reachable-workflow bar. A headless Chromium fallback is selected only when the evidence names an unresolved material defect, demonstrates that fallback behavior, and proves it is an isolated server-owned resource rather than a user browser or pane.
- [ ] #4 The measured result confirms ADR 0020 and records the selected rendering backend in a canonical design note. If the fallback is required, ADR 0020 is updated with the concrete emulation defect and the added lifecycle consequence.
- [ ] #5 `CONTEXT.md` keeps the canonical Board operation, Browser operation, Board render, and Browser capture terms aligned with the proved boundary without introducing Pane or Canvas synonyms.
<!-- AC:END -->
