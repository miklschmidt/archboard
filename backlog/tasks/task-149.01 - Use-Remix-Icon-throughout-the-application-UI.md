---
id: TASK-149.01
title: Use Remix Icon throughout the application UI
status: Done
assignee:
  - '@codex'
created_date: '2026-09-04 23:28'
updated_date: '2026-09-05 00:10'
labels: []
dependencies: []
references:
  - 'https://github.com/Remix-Design/RemixIcon'
parent_task_id: TASK-149
priority: high
ordinal: 289000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user rejects the inconsistent custom SVG and miscellaneous icon implementations and requests one Remix Icon family, including shadcn generation defaults.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All application-owned UI action and status icons use Remix Icon; obsolete custom icon paths and substitute glyph icons are removed.
- [x] #2 The shadcn configuration selects the supported Remix Icon library and generated components resolve its package.
- [x] #3 Accessible labels, icon sizing and alignment remain correct in rendered desktop light and dark workflows; relevant checks pass without weakening rules.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inventory application-owned SVG and glyph icons, preserving the canonical wordmark, board artwork, and Excalidraw-owned controls.
2. Verify official Remix React exports and the installed shadcn library mapping; add an exact @remixicon/react dependency and iconLibrary: remixicon.
3. Replace shell icon paths through its existing typed Icon interface, and migrate voice, settings, and queue symbols to official React components without changing labels, action behavior, or geometry. Coordinate overlapping edits with the shell worker.
4. Run focused formatting, lint, frontend types, and existing affected module tests. Record the remaining vendor-owned icon boundary and hand rendered desktop light/dark validation to the parent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remix migration implemented through official @remixicon/react 4.9.0, pinned in package.json and bun.lock. Shell Icon keeps its typed public names, size and class API; VoiceGlyph keeps its exhaustive state mapping and data-voice-glyph hooks. Opener close/remove, queue reorder arrows, and WorkbenchSettingsDialog close/disclosure use official components with aria-hidden, focusable=false, inherited currentColor, and explicit sizes.

Verified components.json with installed shadcn 4.19.0 public rawConfigSchema and iconLibraries APIs. The remixicon key resolves @remixicon/react. Real nonmutating `bun run shadcn add dialog --dry-run --view` generated RiCloseLine import and usage. Official React documentation: https://github.com/Remix-Design/RemixIcon#react.

Focused formatting, lint, frontend tsc, and git diff --check pass. All affected voice-controls, opener-settings, and workbench-queue module tests pass. Expanded shell run finished 107 pass and 1 fail: codex-voice-presentation.test.tsx expected a fullscreen voice source that the concurrent shell redesign had moved; the owning UI worker is updating that expectation. Parent owns final rendered desktop light/dark checks and repository-policy enforcement.

Remaining non-Remix visuals are canonical wordmark, board preview/artwork, canvas path-focus mask, structural status/focus dots and meter bars, and native/vendor controls. Excalidraw 0.18.1 ExcalidrawProps/UIOptions and official UIOptions docs expose no toolbar icon override map, so its drawing toolbar remains vendor-owned without a fork. https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/ui-options

Final rendered light/dark desktop controls, settings, queue and controlled voice pass. The complete normal check components pass, including the repository guard against new application-owned custom SVG/glyph icons. Canonical wordmark/canvas geometry and Excalidraw vendor controls remain distinct from application action icons.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced application-owned custom SVG and glyph icons with @remixicon/react, pinned Remix and configured shadcn iconLibrary=remixicon. Verified actual shadcn generation and rendered desktop workflows with all normal check components passing. Excalidraw vendor toolbar icons retain their upstream implementation.
<!-- SECTION:FINAL_SUMMARY:END -->
