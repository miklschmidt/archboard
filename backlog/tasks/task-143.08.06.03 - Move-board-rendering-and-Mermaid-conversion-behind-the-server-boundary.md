---
id: TASK-143.08.06.03
title: Move board rendering and Mermaid conversion behind the server boundary
status: To Do
assignee: []
created_date: '2026-09-02 01:58'
labels: []
dependencies:
  - TASK-143.08.06.01
  - TASK-143.08.06.02
references:
  - src/cli/commands/scene.ts
  - src/ui/canvas/mermaidConverter.ts
  - src/runtime/board-inspection
  - docs/adr/0015-the-note-is-the-board.md
  - >-
    backlog/tasks/task-121 -
    Render-deterministic-close-ups-for-board-findings.md
parent_task_id: TASK-143.08.06
priority: high
type: enhancement
ordinal: 267000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give Archboard one server-owned visual conversion boundary for persisted board snapshots and Mermaid source. It must produce the image and element results needed by current public workflows without selecting a pane, sending work through a connected browser, or accepting browser state as input. The boundary owns the chosen emulation runtime and any evidence-approved fallback, contains its globals and resources, and presents a small board-domain interface to the rest of the server.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Named-board PNG and SVG rendering succeeds with zero browser clients from one immutable persisted snapshot and defines explicit sizing, padding, background, font, image, and output-path behavior.
- [ ] #2 `render-findings` performs inspection and every requested close-up against one named persisted snapshot with zero browser clients, preserves the manifest contract or replaces it with one documented simpler contract, and never mutates board or browser state.
- [ ] #3 Mermaid conversion succeeds with zero browser clients, feeds the canonical inbound converter, commits the resulting board as one locked write, and returns stable identities suitable for later board commands.
- [ ] #4 No product rendering or Mermaid path sends WebSocket work to a pane or waits for browser acknowledgements; superseded export, findings-render, and Mermaid browser message handlers and pending-request state are deleted.
- [ ] #5 The rendering boundary contains DOM, canvas, font, and exporter initialization, has deterministic cleanup and actionable failures, and cannot leak mutable emulation globals or fallback processes across reload, retry, or shutdown.
- [ ] #6 Focused public-interface tests cover supported output, malformed Mermaid, missing fonts or files, renderer failure, concurrent requests, shutdown, and zero-client operation without substituting mocks for the rendering boundary.
<!-- AC:END -->
