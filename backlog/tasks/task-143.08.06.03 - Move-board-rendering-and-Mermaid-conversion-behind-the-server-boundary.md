---
id: TASK-143.08.06.03
title: Move board rendering and Mermaid conversion behind the server boundary
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 06:38'
labels: []
dependencies:
  - TASK-143.08.06.01
  - TASK-143.08.06.02
references:
  - src/cli/commands/scene.ts
  - src/ui/canvas/mermaidConverter.ts
  - src/runtime/board-inspection
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
  - >-
    backlog/tasks/task-121 -
    Render-deterministic-close-ups-for-board-findings.md
modified_files:
  - src/server/board-rendering
  - src/server/canvas/lib/application.ts
  - src/cli/commands/scene.ts
  - src/cli/commands/render-findings.ts
  - src/runtime/engine/board-io.ts
  - src/runtime/engine/board-write.ts
  - src/runtime/engine/types.ts
  - src/ui/canvas/useCanvasSession.ts
  - docs/design/server-rendering-boundary.md
  - docs/design/cli-command-audit.json
  - tests/system/boards/server-rendering.test.ts
  - tests/system/boards/server-rendering-failure.test.ts
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep `src/server/board-rendering` as the only production rendering module. Its root interface accepts copied persisted-board snapshots or Mermaid source; private code owns one lazy persistent Vite fixture, one isolated setsid Chromium/profile/loopback CDP session, a serialized job queue, phase diagnostics, deadlines, and idempotent process-group/profile/port/watcher cleanup. Register that owner as one Canvas application resource without changing Codex lifecycle phases.
2. Extend the inspection snapshot projection only with its resolved board and persisted render app state. Render a named board as PNG/SVG and render every finding close-up from the same single snapshot. Use explicit full-board padding, scale and background options, bundled-font and embedded-file checks, fixed focused-raster dimensions, and CLI-owned output paths. Replace the browser-specific finding failure vocabulary with documented manifest schema v2.
3. Replace pane-mediated Mermaid conversion with one async server conversion followed by the existing write-boundary middleware and one synchronous `writeBoard`/`elementMutation` commit. Deterministically remap renderer ids through `derivedId` against the current board, preserve endpoint references, pass every element through `applyElementInput`, return committed ids, and reject invalid or empty output before writing.
4. Delete findings and Mermaid WebSocket messages, result routes, browser handlers, timers, and pending maps. Rename the retained live-pane image request/result transport as browser capture so it remains distinct from named-board rendering; leave the public command-namespace hard cut to TASK-143.08.06.04.
5. Update CLI contracts and client wrappers: add the named-board `render` command, remove browser prerequisites and diagnostics from `render-findings` and Mermaid, keep `screenshot` as live browser capture, and update the authored CLI audit plus generated-artifact checks without committing reproducible generated outputs.
6. Replace pane-routing tests with compact zero-client production owners. Public tests cover PNG/SVG dimensions, pixels, labels, embedded images and arrows; focused finding output and note immutability; exact Mermaid connectivity, stable ids and one version increment; malformed Mermaid and missing file/font failures; concurrent requests; public startup failure; retry after renderer death; active/queued shutdown; and the complete cleanup audit. Remove superseded browser finding coverage rather than duplicate it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the production server-owned rendering boundary in `src/server/board-rendering`: one lazy Vite fixture and retained isolated Chromium/CDP session, serialized jobs, copied immutable inputs, phase/cause diagnostics, process-group termination, observed-process and pipe settlement, profile removal, port release, fixture closure, and retry with a replacement session after process death.

Added named-board PNG/SVG rendering plus the `archboard render --out` file contract. `render-findings` now inspects and renders all focused PNGs from one persisted snapshot with no browser client and publishes documented manifest schema v2. Mermaid now renders on the server, remaps deterministic block ids, passes through the sole inbound converter, adds generated files, and reaches the note as one locked version increment. Invalid or empty Mermaid output does not write.

Removed the Mermaid and finding WebSocket messages, frontend handlers, pending maps, callback routes, and browser finding owner. Renamed the retained live-pane image transport to `/api/browser/capture`; the top-level command namespace remains for TASK-143.08.06.04. Updated the authored CLI audit, generated-artifact hashes, rendering-boundary design record, browser-owner inventory, and the probe fixture import.

Focused verification passed: real-renderer public system owners (5 tests, 61 expectations); renderer death/retry plus active/queued shutdown cleanup owner (10 expectations); CLI render/findings package owner (7 tests, 91 expectations); command audit/artifact/workflow owners (16 tests, 943 expectations); rendering/finding module owners (9 tests, 37 expectations); change-feed/write/file owners (20 tests, 99 expectations); code-target presentation owner (1 test, 130 expectations); side-by-side live capture owner (1 test, 46 expectations); repository boundary, inventory, hosted-browser-policy, and legacy-removal owners; focused image persistence and HTTP refusal owners; Oxlint; Oxfmt check; `git diff --check`; and the Vite frontend build. The public real-renderer owner proves zero WebSocket clients, repeated 566x417 output, expected PNG colour regions, SVG label/image/arrow semantics, focused-finding dimensions and unchanged note bytes, missing font/file refusals, concurrent requests, exact Mermaid graph and one version increment, malformed Mermaid without a write, public renderer startup failure, and shutdown profile removal. The module owner additionally proves replacement after killed Chromium and the full group/process/pipes/profile/port/fixture cleanup report.

Per the delegation constraints, root TypeScript checking, the full suite/check command, the serial browser lane, and standalone probe scripts were not run. The task intentionally remains In Progress and every acceptance criterion remains unchecked for parent review.
<!-- SECTION:NOTES:END -->
