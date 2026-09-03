---
id: TASK-143.08.06.01
title: Prove and record the server rendering boundary
status: In Progress
assignee:
  - "@codex"
created_date: "2026-09-02 01:57"
updated_date: "2026-09-03 03:53"
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

6. Reproduce the clean-root readiness failure under the existing 20-second renderer limit, then add phase-specific DevTools diagnostics and owned-resource cleanup without extending the allowance.
7. Strengthen the canonical fixture contract with bounded pixel, SVG structure, and Mermaid graph assertions; make semantic or hash divergence fail the probe.
8. Rework the proof around one owned Chromium/profile and serial jobs so it measures startup, warm, and steady process-tree RSS plus failure/replacement cleanup.
9. Own disposable proof output beneath a unique system-temporary root, reject repository and caller-owned paths, validate twice under containment, record remediation evidence, and commit while retaining In Progress/unchecked ACs.

10. Add a disposable, exact emulation manifest and bounded harness that installs only beneath a unique system-temporary root, reuses the canonical persisted fixture, records DOM/font/global setup and restoration, and proves the Mermaid geometry defect.
11. Replace vendor-only proof input with the canonical Archboard board-read/render ingress and in-memory Mermaid inbound conversion seam; validate the block-id contract and final converted element shape without writing a note.
12. Audit every helper process, dependency preflight, malformed-input and renderer-death probe under the same 20-second limit plus five-second TERM/KILL cleanup, reporting phase and owned resources on success or failure.

<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->

2026-09-03 remediation evidence: The canonical persisted fixture is now `board.excalidraw.md`; both probes read it through `readNote` and `projectPreviewSnapshot`. It covers all current native render shapes, bindings, background, Excalifont text, and an embedded file. The Chromium probe also passes browser Mermaid output through `applyElementInput` using valid Archboard ids without writing a note.

Emulation: a pinned temporary `happy-dom`/`@napi-rs/canvas` manifest and lock install only under a unique `/tmp` directory with `--frozen-lockfile --ignore-scripts`; it registers all seven bundled Excalifont files, restores all globals, removes dependencies, renders PNG/SVG, and has no runtime diagnostics. It still returns zero elements for the valid configured Mermaid graph while malformed Mermaid rejects with `Error`, proving the reachable geometry defect.

Chromium: one private-profile, loopback-only, `setsid`-owned process runs three serial normal jobs, checks PNG pixels and SVG structure, exact Mermaid graph edges, deterministic hashes, warm/steady RSS, malformed board/Mermaid, missing image, a 20-second named timeout, child exit, replacement, and TERM/KILL cleanup. Two final contained runs matched PNG `a6439911658614672830df4e4520c04380e08011dfdd634ea93c6310b6fc8bfc` and SVG `b654ec7a2295d9e5b6730280b21b8d78746200b937358942fed90a8388f45a3f`; every observed process and profile was removed.

Validation: cgroup-contained `bun scripts/probe-server-rendering-emulation.ts`; cgroup-contained Chromium probe twice; focused `oxlint` of both probes; `oxfmt`; `git diff --check`. The focused standalone script compile reported no proof-file errors; `bun run type-check` remains blocked by pre-existing errors in `src/runtime/engine/git-process-owner.ts`, `src/runtime/engine/git.ts`, `src/runtime/engine/tests/board-lock-lease.test.ts`, and board-inspection system-test support. ACs remain unchecked and task remains In Progress for parent rereview.

2026-09-03 rereview remediation: emulation now uses the same pre-mkdtemp argv refusal as Chromium. A normal contained run passed; an extra argument exited 1 with the owned-output refusal, and before/after audit of `/tmp/archboard-server-rendering-emulation-proof-*` found no new output or dependency-root residue. Focused format, lint, and diff checks pass. Task remains In Progress with ACs unchecked.

2026-09-03 architecture rereview remediation: Chromium now acquires profile, loopback port, Chromium group, and output pipes through one owner that self-cleans before exposing a session. The Vite fixture similarly owns and closes server/watcher resources before returning. Direct injected seams covered before-profile, after-profile, after-port, after-spawn, before-vite-create, after-vite-create, and after-vite-listen; every audit had no survivors, removed profile, rebindable port, and (where created) a closed non-listening Vite server with zero watched paths.

The timeout oracle now requires the causal `CdpTimeoutError` for `Runtime.evaluate` at exactly 20,000 ms, the fixture `intentional-timeout` phase, and 19,800–21,000 ms monotonic elapsed time. The normal proof observed 20,005.3 ms; an injected immediate evaluation failure was rejected by the oracle in 1.2 ms. A contained emulation run and one complete Chromium run passed. ACs remain unchecked and task remains In Progress.
<!-- SECTION:NOTES:END -->
