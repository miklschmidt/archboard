---
id: TASK-121
title: Render deterministic close-ups for board findings
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 17:19'
updated_date: '2026-08-27 11:14'
labels:
  - ready-for-agent
dependencies:
  - TASK-119
references:
  - frontend/src/canvas/useCanvasSession.ts
  - src/cli/commands/scene.ts
  - src/types.ts
  - scripts/check-fixed-point.mjs
  - docs/agents/test-suite.md
  - package.json
  - docs/adr/0014-no-build-step-bun-runs-the-source.md
  - tasks/task-071
  - tasks/task-097
  - 'https://bun.sh/reference/bun/Image'
  - tasks/task-123.01
  - tasks/task-123.03
priority: medium
type: enhancement
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard screenshot export currently passes the entire scene to Excalidraw export. It is therefore a fit-to-scene artifact, not a crop of the camera or current pane. In the device-trust work, viewport --ids moved and zoomed the visible pane, but screenshot still exported the complete scene; the relevant bridges were only about 10 to 14 pixels across and ImageMagick was used for manual crops. Browser zooming cannot fix this because the export ignores visible camera state.

Add one deterministic RenderRegion contract for focused rendering by involved element IDs, scene-space bounding box, or both. IDs expand to complete visual closure and effective bounds. Bounds include intersecting elements. Supplying both unions the requested bounds with the complete closure of the involved IDs so labels, arrowheads, promoted-node parts, grouped stencil parts, intersecting participants, embedded files, and other required context are not silently omitted. Visual group expansion does not create semantic node identity.

Plain archboard check --board <key> remains vault-direct, browser-free, and server-free. archboard check --board <key> --render-findings <directory> may require a connected browser and uses it as a stateless renderer for an immutable, explicitly named board payload. It must not repoint, reload, select, zoom, or otherwise mutate a visible pane. Starting the canvas server alone does not satisfy the browser requirement.

Excalidraw in the browser owns vector scene rendering, embedded files, and clipping to the focused scene region. Bun 1.4 Bun.Image receives the already-focused raster and owns metadata validation, bounded resizing, portable PNG encoding, and optimization. It is not a crop API. Raise and enforce the runtime minimum to Bun >=1.4.0. Focused finding output is PNG-only; existing full-board PNG and SVG exports remain a separate overview surface.

Render findings in stable order with collision-free names and atomic image writes. Always finish with an atomic manifest accounting for every requested finding. On partial failure, retain successful images, mark failed entries, set complete:false, and exit non-zero. Never claim a missing image succeeded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One Zod-backed RenderRegion contract is shared by the CLI command result, server protocol, frontend export path, and manifest. It carries optional scene bounds, involved element IDs, padding, scale, background, PNG format, and maximum pixel count, and normalizes to one deterministic effective element set and scene box.
- [ ] #2 IDs-only requests derive bounds from complete visual closure; bounds-only requests include intersecting elements; combined requests union the box with closure. Closure includes bound labels, source elements sharing a promoted node ID, visually grouped stencil parts, arrowheads, intersection participants, and required embedded files without treating groupIds as node identity.
- [ ] #3 Plain archboard check remains browser-free and server-free. Rendering mode declares its browser prerequisite, returns the established browser-required exit and clear diagnostic when absent, and does not treat a running server without a browser as sufficient.
- [ ] #4 Focused rendering uses an immutable out-of-band payload containing the explicit board key, expected version or fingerprint, normalized elements, corresponding files, and region; it is independent of workspace, active task, visible pane, camera, selection, and recent board activity.
- [ ] #5 The browser renders the supplied payload through Excalidraw without updateScene, pane reload, pane identity changes, camera changes, selection changes, or visible-content replacement, and the response echoes request, board, and version so stale or cross-board results are refused.
- [ ] #6 archboard check --board <key> --render-findings <directory> is declared through CommandContract and emits stable NNNN-<finding-code>-<digest>.png names plus a schema-validated manifest mapping every finding to code, IDs, requested and effective bounds, dimensions, filename, hash, status, error, and source board fingerprint.
- [ ] #7 Each image and the final manifest are written atomically. Partial failure retains successful images, records every failed entry, sets complete:false, and exits non-zero; no missing artifact is listed as successful.
- [ ] #8 Excalidraw owns scene rendering and clipping. Bun.Image owns metadata validation, bounded resize, portable PNG encoding, and optimization of the already-focused raster without ImageMagick, Sharp, canvas, OS codecs, or an invented Bun crop API.
- [ ] #9 Package engines, installer checks, CI, documentation, and runtime diagnostics enforce Bun >=1.4.0 before focused raster processing can begin. Focused finding output is PNG-only, while existing full-board PNG and SVG export remains separate.
- [ ] #10 Real-browser tests run headlessly and sequentially and prove explicit-board isolation with two panes, embedded-file preservation, stable pixels across viewport changes, clipping and z-order, deterministic padding, bounded pixel counts, condition-based readiness, stable Bun image error mapping, partial manifests, and contract validation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define one Zod-backed RenderRegion contract shared by CommandContract, server protocol, frontend export, and manifests. It carries optional scene-space bounds, involved element IDs, padding, scale, background, PNG format, and maximum pixel count. Define stable output naming, board fingerprint provenance, browser-required refusal, and partial-manifest semantics before changing rendering.
2. Build a pure region-normalization helper. An IDs-only request derives bounds from complete visual closure; a bounds-only request includes intersecting elements; a request containing both unions the requested bounds with closure of the involved IDs. Closure includes bound labels, source elements sharing customData.archboard.node, visually grouped stencil parts, arrowheads, intersecting participants, and required embedded files without treating grouping as semantic node identity.
3. Replace pane-reload export synchronization with an immutable out-of-band render payload containing the explicitly named board, expected version or fingerprint, normalized elements, corresponding files, and render region. The server loads and validates that exact board version, then may use any connected browser as a stateless renderer. The browser passes the supplied payload to Excalidraw export without updateScene or changes to pane identity, camera, selection, or visible content. Echo request, board, and version and refuse stale or cross-board responses.
4. Keep Excalidraw responsible for scene rendering, embedded files, vector bounds, and focused clipping. Add a small Bun-native raster module for metadata validation, bounded resize, portable PNG encoding, and optimization of the already-focused raster. Enforce maxPixels, branch on stable Bun image error codes, add no ImageMagick, Sharp, canvas, native, or OS codec dependency, and raise package engines plus installer, CI, and runtime checks to Bun >=1.4.0.
5. Compose finding rendering on TASK-119 through the schema-defined check command. Plain check remains server-free and browser-free. Rendering mode requires a browser, renders findings in stable report order, writes each PNG atomically, and finishes with an atomic manifest accounting for all entries. On partial failure retain successful images, mark failures, set complete:false, and exit non-zero. Keep existing full-board export separate.
6. Add focused tests for region normalization, visual closure, names and digests, padding, scale and pixel caps, file selection, board-version isolation, result schemas, Bun metadata and resize behavior, portable PNG output, stable errors, and partial manifests. Extend the existing sequential real-browser suite with two visible boards, viewport changes, embedded images, promoted stencils, labels, clipping, z-order, full-scene versus focused output, and condition-based readiness.
7. Supply complete CommandContract metadata for help and TASK-123.03 reference generation, update Bun and test-suite documentation, and run type-check, install-doc, scene and screenshot checks, TASK-119 inspection, CLI contract coverage, browser fixed-point, live-session, and the complete sequential suite. Inspect representative overview and close-up pixels.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-08-25 17:22
---
Planning pass completed from current source inspection and Bun 1.4 API verification. Implementation has not started; the task is deliberately returned to To Do and left unassigned.
---

author: @codex
created: 2026-08-26 00:03
---
Plan review incorporated the originating viewport-versus-full-scene failure, unified RenderRegion, out-of-band renderer, approved partial-failure retention, PNG-only focused output, and the CLI-only schema contract after TASK-124.
---

created: 2026-08-26 01:26
---
TASK-124 reconciliation: focused rendering remains a CLI-only CommandContract and documents only its REST application relationship where relevant.
---

author: @codex
created: 2026-08-27 11:14
---
Parent orchestration started after TASK-120 shipped. Before implementation, run a current-source xhigh deletion-test plan review. Prefer the smallest deterministic close-up contract that solves finding evidence export; reject speculative renderer platforms, duplicated bounds engines, unnecessary server/session state, broad visual-closure taxonomies, or browser test matrices beyond the real product seam.
---
<!-- COMMENTS:END -->
