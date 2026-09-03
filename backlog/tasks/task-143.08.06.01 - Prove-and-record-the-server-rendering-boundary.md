---
id: TASK-143.08.06.01
title: Prove and record the server rendering boundary
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:57'
updated_date: '2026-09-03 02:42'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Map the current PNG, SVG, and Mermaid implementations plus their concrete browser, DOM, canvas, font, and file dependencies.
2. Add only stable, canonical proof inputs needed to drive representative persisted board snapshots and Mermaid source.
3. Exercise the actual server-side export and Mermaid stack under Bun or Node DOM and canvas emulation with no browser client, recording correctness, repeatability, memory, cleanup, isolation, and failure observations in a temporary evidence directory.
4. Compare any reachable fidelity or reliability gaps against the cost of an isolated Chromium fallback, then write the measured decision and the four rendering terms into canonical documentation.
5. Run focused public-interface verification, keep generated evidence ignored, record progress, and commit the spike while leaving acceptance criteria open for review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-09-03 evidence: The tracked fixture and Chromium probe exercise the pinned Excalidraw export and Mermaid converter without an Archboard client. Bun with happy-dom 20.13.2 and @napi-rs/canvas 1.0.8 rendered PNG/SVG but returned an empty element list for valid Mermaid, so it was rejected. Isolated Chromium 150 returned five Mermaid elements, rejected malformed Mermaid, produced deterministic PNG/SVG SHA-256 outputs across two runs, and cleaned every owned process.

Validation: bun scripts/probe-server-rendering-chromium.ts --out <empty-temp-dir>; focused no-emit TypeScript check of scripts/probe-server-rendering-chromium.ts under a 2 GiB cgroup limit; oxfmt; git diff --check. Generated reports stayed in /tmp and no temporary emulation dependencies were retained.

Decision: ADR 0020 and docs/design/server-rendering-boundary.md select one private-profile, loopback-controlled Chromium renderer with serialized immutable snapshots, bounded requests, and cleanup. The follow-on implementation must reject non-empty Mermaid input that yields no elements before any note write. ACs remain unchecked for parent review.
<!-- SECTION:NOTES:END -->
