---
id: TASK-143.08.06.03
title: Move board rendering and Mermaid conversion behind the server boundary
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-02 01:58'
updated_date: '2026-09-03 07:19'
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
1. Keep src/server/board-rendering as the sole production visual boundary. Build a dedicated renderer entry with the frontend and serve only that entry plus dist/frontend/assets from a private loopback Bun fixture; retain one lazy serialized Chromium/CDP session.

2. Project validated persisted notes into the shared BoardRenderSnapshot contract. Render named boards and every focused finding from copied snapshots with explicit sizing, background, padding, font, image, and artifact behavior.

3. Render and validate Mermaid before acquiring the board lease. Freeze one canonical skeleton result on the request, propagate request cancellation through queue and active work, then map ids against the current under-lock note and perform one synchronous canonical write.

4. Own one temporary root per renderer session, including TMPDIR and profile. Capture bounded process tails, keep failures typed as BOARD_RENDERER_FAILED, and remove the full root only after group, process, leader, and pipe settlement.

5. Make fixture and session acquisition retryable without publishing partial state. Close the static fixture and both ports on shutdown; expose the cumulative Chromium start count and resource identity through health.

6. Remove superseded Mermaid/finding browser transport and redundant browser owners, retain live pane capture as a separate Browser operation, and align AGENTS.md, test-suite guidance, the design record, CLI contracts, and generated checks.

7. Enforce the browser renderer in the frontend TypeScript gate and retain focused owners for real rendering, lease ordering, cancellation, replacement, startup and cleanup failure, output atomicity, zero-client behavior, and shutdown. Use measured sub-10/12-second owner timeouts.

8. Leave the task In Progress with acceptance criteria unchecked for parent review; do not run the root TypeScript gate, broad suite, serial browser lane, or standalone probes in this remediation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation replaced the production Vite fixture with a dedicated built renderer entry and narrow Bun static host. Fixture state is published only after successful listen and a failed partial acquisition closes its port before a clean retry. The browser renderer resets DOM and job state around every run.

Mermaid now renders and validates before the lease, stores a recursively frozen canonical skeleton result on the request, propagates AbortSignal through queued and active renderer work, then maps ids and endpoints against the current under-lock board through typed ElementInputRequest inputs and one synchronous write. A public owner held rendering beyond the 3000 ms lease, landed a concurrent human collision, proved remapping against the live note, and proved post-render cancellation leaves the version unchanged.

Each session owns one short temporary root containing TMPDIR and profile data. Startup stdout/stderr tails are bounded, startup-plus-cleanup and job-plus-cleanup failures remain BoardRendererError values, and root removal waits for process-group absence plus leader and pipe settlement. Health reports cumulative Chromium starts. Production boundary casts were removed in favor of exact Mermaid/parser, renderer-result, page-state, and BoardRenderSnapshot validation.

Final focused evidence: frontend build 0.582 s; module renderer owner 2 tests/31 expectations in 1.916 s with exactly 2 Chromium starts and clean replacement/root/group/process/pipe/profile/port/fixture census; public real-renderer owner 4 tests/79 expectations in 6.740 s with exactly 1 retained start and 0 survivors after shutdown; public missing-executable failure 1 test/5 expectations in 0.874 s with 0 Chromium starts and fixture port rebound; presentation contract 1 test/125 expectations in 2.598 s with no renderer call; artifact atomicity 9 tests/38 expectations in 0.288 s; undescribed-write boundary 1 test/33 expectations in 3.089 s; repository boundary/inventory/TypeScript-scope policy 47 tests/139 expectations in 7.884 s. Scoped Oxlint, Oxfmt, frontend TypeScript, renderer-root TypeScript, git diff check, and final live-process/temp-root census pass.

The root TypeScript gate, broad suite, serial browser lane, standalone probes, and the 20-second proof scenario were intentionally not run. The requested writing-for-agents skill is unavailable in this checkout; repository documentation rules and the plain-language fallback were applied. Task remains In Progress, assigned to @codex, with all acceptance criteria unchecked.

Final post-format module rerun supersedes the earlier module wall time: 2 tests and 31 expectations passed in 1.781 s, still with exactly 2 Chromium starts. The final live renderer process and recent temp-root census was empty.
<!-- SECTION:NOTES:END -->
