---
id: TASK-140.06
title: Redesign navigator items with real lazy board previews
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 09:57'
updated_date: '2026-08-30 09:58'
labels: []
dependencies:
  - TASK-140.05
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: high
type: feature
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Bring the real desktop board and variant navigator materially closer to the approved operator-shell reference. Each item must retain clear, usable board identity and live state without a preview, while a supplemental lazy disclosure renders the actual current board scene in the browser. The preview path is read-only, bounded, accessible by desktop pointer and keyboard, safe for the Samsung Flip's desktop-sized touch selection workflow, and never becomes another board client or persistence path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board and variant items present reference-level hierarchy, density, focused-pane state, on-canvas, open, draft, and variant relationships while remaining fully actionable without a preview
- [ ] #2 Desktop pointer hover and keyboard focus lazily disclose a noninteractive preview of the actual selected board or variant, with explicit loading, empty, and recoverable unavailable states and no focus trap
- [ ] #3 The browser exports preview SVG from canonical presentation elements using Excalidraw semantics and displays it without raw unsanitized HTML injection, fake thumbnails, initials presented as previews, server-side SVG rendering, or persisted preview artifacts
- [ ] #4 Open boards use an authoritative mounted scene when available, and off-screen boards use only the narrowest read-only snapshot seam without opening or focusing a board, creating a client or session, claiming it, or exposing a machine-local path
- [ ] #5 Preview work is bounded in memory by stable board identity, the real invalidation signal, and theme when output differs; stale in-flight results are discarded, failures remain local, and listing or switching never waits for preview generation
- [ ] #6 Preview disclosure and refresh cause zero note writes, zero change-feed entries, no board-open or pane-focus side effect, and no difference in the canonical board or its exported elements
- [ ] #7 Desktop one-pane, two-pane, fullscreen, light, dark, keyboard, pointer, and large-display touch selection workflows preserve existing navigation, loading, empty, retry, scratch, naming, and live-state contracts
- [ ] #8 DESIGN.md, the operator-shell reference, and affected active tests record that the shell is desktop-only while preserving Samsung Flip desktop touch and replacing only obsolete phone-specific gates with desktop coverage
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make the desktop-only shell contract durable with the approved narrow wording in AGENTS.md, DESIGN.md, and docs/design/operator-canvas-shell.md, and replace only active phone-specific product assertions with equivalent supported-desktop coverage.
2. Add the narrowest read-only board-preview GET seam over the existing board inspection snapshot: return canonical presentation elements, files, and a real fingerprint for open, draft, and off-screen boards without registering, opening, focusing, claiming, writing, adding a client, rendering SVG server-side, or exposing local paths.
3. Add a browser preview projection/export and bounded in-memory cache keyed by stable board identity, fingerprint, and theme where needed; prefer an authoritative mounted pane scene, discard stale in-flight completions, revoke replaced Blob URLs, and keep listing and switching independent of preview work.
4. Redesign the 184px desktop board and variant items around clear hierarchy and exact focused/on-canvas/open/draft state. Lazily disclose a supplemental noninteractive real-scene preview on desktop pointer hover and keyboard focus, with loading, empty, unavailable, and retry states, while preserving ordinary board selection and Samsung Flip desktop touch targets.
5. Serialize the four cropped regional UI parity passes around exact Shell.tsx and shell.css ownership: integrate navigator first, then top shell, workbench, and inspector/focus only after each worker supplies tightly cropped desktop light/dark evidence and focused validation. Do not introduce phone breakpoints, fake reference data, new shell modes, telemetry, prompt controls, hidden diffs, or a second agent client.
6. Extend existing module, server, board-navigator, shell, fullscreen, claim, workbench, selection-inspector, and focus coverage for laziness, accessibility, invalidation, stale/failure recovery, real content, one/two panes, fullscreen, state preservation, and zero note, feed, open/focus, claim, canonical-scene, or export side effects.
7. Inspect the real supported desktop shell in both themes across one pane, two panes, fullscreen, preview states, claims, notices, workbench, inspector, and focus using tightly cropped regional screenshots. Then run formatting, lint, both TypeScript projects, focused and repository tests, production build, the complete sequential check chain, protected-base audit, and an independent Standards plus Spec review over a8275ac..HEAD with remediation and rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Overlap search before creation found only completed TASK-140.02, whose original no-generated-thumbnail contract remains historically correct. TASK-140.06 owns the newly approved real-data preview and item redesign. The user established the shell as desktop-only; phone, 420px, and narrow-reflow work are excluded, while Samsung Flip desktop-sized touch selection remains supported. The requested writing-for-agents skill is not installed in this environment, so the approved narrow rule will be applied verbatim without broader AGENTS.md restructuring.
<!-- SECTION:NOTES:END -->
