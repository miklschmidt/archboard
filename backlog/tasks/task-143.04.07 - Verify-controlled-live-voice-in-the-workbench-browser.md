---
id: TASK-143.04.07
title: Verify controlled live voice in the workbench browser
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-09-04 16:51'
labels: []
dependencies:
  - TASK-143.02.04
  - TASK-143.03.13
  - TASK-143.04.06
  - TASK-143.04.10
  - TASK-143.04.11
  - TASK-143.04.12
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - tests/system/browser/codex-live-voice.test.ts
  - tests/system/browser/support/codex-live-voice.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/browser/support/shell-render-matrix.ts
  - tests/system/canvas-state/fixtures/fake-codex-production.ts
  - tests/system/repository-policy/test-inventory.test.ts
  - package.json
  - docs/agents/test-suite.md
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 228000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one controlled real-browser product check for live voice in the production Shell, CanvasPane, and WorkbenchFrame composition. Reuse the exact Codex 0.151.0 app-server fake and controlled browser media. Prove only the rendered contracts that focused voice modules cannot: one short live lifecycle, fullscreen Stop, desktop and Samsung Flip geometry, accessibility presentation, unchanged Excalidraw, and cleanup. Focused module owners retain lifecycle, failure and recovery, transcript relationship, spoken-approval, and edge-case matrices.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The production Shell, CanvasPane, and WorkbenchFrame register live voice through the public codex-realtime seam against the exact Codex 0.151.0 fake. The owner proves the version probes and single strict app-server spawn and never resolves or spawns PATH Codex.
- [ ] #2 One short controlled live lifecycle shows the exact pane, workhorse, coordinator, and realtime-session source; visible context and transcript; listening and mute phase changes; the immutable active-voice Stop in fullscreen; authoritative text-only cleanup; the same mounted Excalidraw element; no console or page errors; and complete test resource cleanup.
- [ ] #3 Rendered checks at 1440x900 and Samsung Flip desktop dimensions prove the live voice and fullscreen dock avoid shell and Excalidraw overlay collisions, Stop and voice controls retain at least 44px targets, keyboard focus order remains usable, status and live-region semantics remain named, and forced-colors and reduced-motion rules remain active where the browser supplies unique evidence.
- [ ] #4 Against fixed base aed5351720830cf644447e219bed5b3bcee3cc9e, the normal executable browser inventory moves from its measured 17 owners to 18 by appending this owner exactly once in BROWSER_TEST_PATHS and test:serial-browser. Repository inventory rejects missing, duplicate, reordered, or normal/opt-in-overlap owners, and general documentation describes ownership without copying the count.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the existing exact-version production fake only enough to emit one successful realtime SDP, started, transcript, and authoritative stop sequence. Keep exhaustive protocol and failure behavior in the focused realtime owners.
2. Add one controlled real-browser owner that installs deterministic browser media, creates the rendered workhorse, starts live voice through the public production composition, observes source, context, transcript, phase and mute state, transfers to fullscreen, stops through the existing dock, and proves authoritative text-only cleanup with the same Excalidraw mount.
3. At 1440x900 and Samsung Flip desktop dimensions, inspect rendered bounds, target sizes, overlay intersections, focus order, accessible status, forced colors, and reduced motion without adding product UI or duplicating module matrices.
4. Append the owner once after the current 17-owner baseline in BROWSER_TEST_PATHS and test:serial-browser, add the focused repository inventory assertion, and document the narrow rendered owner without a copied count.
5. Run only the new focused browser owner through the serial adapter, focused repository inventory/static checks, applicable TypeScript, scoped lint and format checks, diff checks, and a process cleanup audit. Keep the task In Progress with all criteria unchecked for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pruned the stale task contract before implementation. The measured normal browser baseline at fixed base aed5351720830cf644447e219bed5b3bcee3cc9e is 17 owners, so this leaf owns the single 17-to-18 append. Focused realtime, media, voice-session, voice-context, transcript, spoken-approval, WorkbenchFrame, and Shell owners already cover exhaustive lifecycle, failure, recovery, identity, relationship, and spoken-approval matrices. This browser leaf retains only production composition, rendered geometry and accessibility, one representative live lifecycle, unchanged Excalidraw, and cleanup evidence.

The first controlled browser run exposed raw notification thread IDs at the production boundary; TASK-143.04.11 resolved that defect. The next run advanced through SDP and started, then exposed raw transcript item IDs rejected by the canonical browser projection; TASK-143.04.12 resolved that second defect. Canonical aed53517 includes both completed dependencies. This leaf resumes against that exact base without weakening its production transcript and rendered lifecycle assertions.

Current-base result: the exact controlled browser owner passes 51 assertions in 3.12 seconds. It exercises the production Shell, CanvasPane, WorkbenchFrame, exact Codex 0.151.0 fake, controlled browser media, rendered source/context/transcript, listening and mute, 1440x900 and 1920x1080@2 geometry, focus order, reduced motion, forced colors, fullscreen Stop, text-only cleanup, unchanged Excalidraw, strict version/spawn evidence, empty browser logs, and full media disposal. The fake now emits the protocol-accurate item/started introduction before each item/completed reference required by TASK-143.04.12. Browser and wire realtime session identities are asserted in their separate domains.

Scoped validation on aed53517: root TypeScript passed; frontend TypeScript passed; scoped Oxlint and Oxfmt passed; git diff check passed. A direct inventory audit measured 17 owners at the fixed base and 18 in this range, with the new owner appended once and present once in test:serial-browser. The serial browser adapter completed cleanup, and a follow-up process and recent lane-directory audit found no residue. The repository-policy suite was not run because the delegated boundary forbids it.
<!-- SECTION:NOTES:END -->
