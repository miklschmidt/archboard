---
id: TASK-143.04.07
title: Verify controlled live voice in the workbench browser
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-09-04 17:43'
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
  - tests/system/browser/codex-text-workbench.test.ts
  - tests/system/browser/support/codex-live-voice.ts
  - tests/system/browser/support/codex-workbench-production.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/browser/support/shell-render-matrix.ts
  - tests/system/canvas-state/fixtures/fake-codex-production.ts
  - tests/system/repository-policy/test-inventory.test.ts
  - src/ui/shell/shell.css
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
- [x] #1 The production Shell, CanvasPane, and WorkbenchFrame register live voice through the public codex-realtime seam against the exact Codex 0.151.0 fake. The owner proves the version probes and single strict app-server spawn and never resolves or spawns PATH Codex.
- [x] #2 One short controlled live lifecycle shows the exact pane, workhorse, coordinator, and realtime-session source; visible context and transcript; listening and mute phase changes; the immutable active-voice Stop in fullscreen; authoritative text-only cleanup; the same mounted Excalidraw element; no console or page errors; and complete test resource cleanup.
- [x] #3 Rendered checks at 1440x900 and Samsung Flip desktop dimensions prove the live voice and fullscreen dock avoid shell and Excalidraw overlay collisions, Stop and voice controls retain at least 44px targets, keyboard focus order remains usable, status and live-region semantics remain named, and forced-colors and reduced-motion rules remain active where the browser supplies unique evidence.
- [x] #4 Against fixed base aed5351720830cf644447e219bed5b3bcee3cc9e, the normal executable browser inventory moves from its measured 17 owners to 18 by appending this owner exactly once in BROWSER_TEST_PATHS and test:serial-browser. Repository inventory rejects missing, duplicate, reordered, or normal/opt-in-overlap owners, and general documentation describes ownership without copying the count.
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

Accepted review remediation: the strict production fake now retains the raw coordinator thread created first, rejects realtime start or stop for any other thread with JSON-RPC invalid params, and records the authoritative stop target. The browser owner asserts the exact rendered pane, workhorse, and coordinator identities; exact raw coordinator thread on start and stop; and the distinct stable browser-media and Codex wire realtime-session domains. It now measures live non-fullscreen voice at 1920x1080@2 before presentation, including collision, overflow, and every 44-by-44 target, then asserts both Stop dimensions in fullscreen at 1440x900 and Flip sizes.

The accepted cleanup leaves fewer test concepts and lines. One 29-line browser-test helper replaces about 50 duplicated lines of fixture-log parsing and private lease traversal across the text and voice owners. No production or general test contract changed. The remediated browser owner passes 62 assertions in 3.11 seconds. Root and frontend TypeScript pass; scoped Oxlint, Oxfmt, diff checks, and the direct 17-to-18 inventory audit pass. The serial lane and follow-up process audit found no residue.

Integration-gate remediation: the exact text owner failed twice because its sole enabled Send button (44px high at y=708.5–752.5) was clipped by the 57px workhorse region, leaving its center at the boundary of the adjacent 69px sticky application-request header (y=731–800). Temporarily restoring the text owner’s original local fixture-log and lease helpers reproduced the identical @e3 coverage failure, proving the shared-helper extraction was not causal; the diagnostic-only changes were then removed. The smallest repair explicitly reveals the rendered data-composer-send="start" control with scrollIntoView and still activates it through the exact accessible button click—no forced click, direct handler call, sleep, timeout increase, or assertion weakening. The repaired text owner passes 25 assertions in 2.72 seconds, and the voice owner independently passes 62 assertions in 3.04 seconds. Root and frontend TypeScript, file-scoped Oxlint/Oxfmt, and diff checks pass. Serial owner cleanup reported no cleanup failure.

UI remediation supersedes the rejected scripted-reveal workaround. A required internal UI worker read the TASK-140 visual authority, module boundaries, and test rules, then measured the smallest layout candidate. Adding one 44px touch-target token alone left Send only 25.5px visible, so the accepted product correction also lays out the empty application-request header and message in two columns. At 1440x900 the canvas/workbench/workhorse/request heights moved from 445/320/56.5/135px to 401/364/111/70px; at 1920x1080@2 they moved from 625/320/56.5/135px to 581/364/111/70px. The canvas remains the largest region at both viewports. Send is now fully visible at 57.671875x44px with no clipping, request overlap, or center obstruction. Desktop Start/Mute/Stop measure 93.3125x44, 133.34375x44, and 91.53125x44; Flip Start/Unmute/Stop measure 93.3125x44, 150.0625x44, and 91.53125x44; fullscreen Stop is 59.703125x44 at both sizes. All scripted reveal/scroll helpers are removed. Public role/name clicks remain. Real Tab traversal proves Pane A -> Collapse -> enabled Start before activation and Pane A -> Collapse -> Mute -> Stop afterward, with disabled Start skipped. Independent focused validation: text owner passed 28 assertions in 2.65s; voice owner passed 68 assertions in 3.36s. Root TypeScript passed in 2.02s, frontend TypeScript in 0.50s, scoped Oxlint/Oxfmt and diff checks passed, direct inventory remains 17 owners at fixed base and 18 now with one serial registration, and the process audit found no residue. The UI worker touched only shell.css and the two assigned owners; the shared 29-line production helper remains unchanged.

Final review remediation: both scripted Pane A focus commands were replaced by the existing accessible role/name click. Each keyboard check now proves that the real click focused Pane A before Tab traversal. The pre-start path remains Pane A -> Collapse -> enabled Start; the live path remains Pane A -> Collapse -> Mute -> Stop with disabled Start skipped. The duplicated operability calculations were removed from both owners. One browser-test-only WorkbenchControlOperability result and workbenchControlOperability probe now live in the existing codex-workbench-production support, with the sole definition of the 44x44, clipping, request-overlap, and center-hit contract. The owner files lost 50 lines while shared support gained 60 readable lines, a net 10-line change that replaces two implementations with one. No production layout changed. Independent exact validation: text owner passed 26 assertions in 2.93s; voice owner passed 63 assertions in 3.51s. Root TypeScript passed in 1.98s, frontend TypeScript in 0.53s, scoped Oxlint/Oxfmt and diff checks passed, direct inventory remains 17 owners at fixed base and 18 now with one registration in each executable list, and the process audit found no residue.

Final integration on codex/task-143-144-workbench applied the complete independently review-clean range without conflicts. Source-to-canonical mapping: f75bc85add4c88a0e53ab8d604da770b7f0d48db -> 86be8f02293f0075c2a86a08cdd468cc5c505849; 68a2a5a09a8c031010a6fd34a03fcbca03032105 -> ad363d400ca2b98acebb71ed02050bb2d12af6ae; d7ce0aa33c99997754613455c2e5eb702f5ddf44 -> e514d3c9; 8b03ae344ed2de4bca500453d66a40c4d85758c8 -> 7c152cd1; 53a7619de6f815fccb0afd661243eb79b7f70d0d -> 7369f2e8. Exact capped browser validation passed: live voice 3.869s wall, 63 assertions; text workbench 2.634s wall, 26 assertions. Root and frontend TypeScript passed in 2.751s; scoped Oxlint passed in 0.137s; scoped Oxfmt passed in 0.271s; diff check passed in 0.011s; direct inventory audit passed in 0.016s and proved 17 -> 18 normal owners, preserved order, one appended voice owner, matching package registration, no duplicates, and no normal/opt-in overlap. Process audit found no residue.

Full canonical hashes for the final three review-clean commits: d7ce0aa33c99997754613455c2e5eb702f5ddf44 -> e514d3c9b1b98f4f58ede0a1b6508e3595e36180; 8b03ae344ed2de4bca500453d66a40c4d85758c8 -> 7c152cd1aea8db9a10cc2389f67c82aece89b9e9; 53a7619de6f815fccb0afd661243eb79b7f70d0d -> 7369f2e827aa2d044f5c235befbb475658acb224.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Integrated the review-clean controlled live-voice browser owner and accepted workbench layout. The focused live-voice and text-workbench owners pass through the production browser lane, all scoped static checks pass, and the executable browser inventory moves from 17 to 18 owners exactly once.
<!-- SECTION:FINAL_SUMMARY:END -->
