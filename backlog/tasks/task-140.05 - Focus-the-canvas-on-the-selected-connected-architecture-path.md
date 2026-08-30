---
id: TASK-140.05
title: Focus the canvas on the selected connected architecture path
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 02:31'
updated_date: '2026-08-30 09:57'
labels: []
dependencies:
  - TASK-140.04
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: medium
type: feature
ordinal: 161000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Let a person reduce a busy board to the architecture path connected to one selected element. The inspector starts a temporary focus state that follows real Excalidraw arrow bindings, keeps the connected component at full emphasis, and dims unrelated content. This is browser view state only; it must not rewrite the board, manufacture semantic dependencies, or enter the change feed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For one selected element, an explicit inspector action enters focus and keeps the selected element, every element transitively connected through canonical arrow endpoint bindings, the connecting arrows, and their bound labels at full emphasis
- [x] #2 Unrelated elements are visibly de-emphasized in both themes without becoming unselectable or changing their stored appearance
- [x] #3 Changing the selection recomputes focus from the current board, clearing selection or leaving the board exits focus, and a visible control plus Escape exits focus directly
- [x] #4 Cycles terminate, arrows with a missing or invalid endpoint do not create a connection, and empty or non-connectable selections return a clear no-path result
- [x] #5 Entering, updating, and leaving focus produce no board note write, no agent change-feed entry, and no persisted or exported element difference
- [x] #6 Deterministic graph tests and rendered browser coverage prove direct and transitive connections, cycles, broken bindings, bound labels, theme contrast, selection changes, and zero scene mutation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Implement a pure deterministic connected-path projection over canonical arrow startBinding/endBinding endpoints, including cycles, broken bindings, selected arrows, bound labels, stable ordering, and explicit no-path outcomes.
2. Keep focus as pane-local browser state in CanvasPane: recompute from the current imperative scene when selection changes, clear on deselection or board replacement, and render a pointer-transparent SVG mask from the current viewport transform so unrelated elements stay selectable and no Excalidraw scene data changes.
3. Add inspector Focus path, Path focused, No connected path, and Exit focus states plus guarded Escape handling that yields first to native fullscreen and active Excalidraw editing or modal interactions.
4. Add pure projection coverage and one canonical serial-browser owner for real selection, pointer transparency, cycles, broken bindings, labels, explicit/Escape exit, theme/fullscreen behavior, and zero note writes, change-feed entries, scene mutations, or exported differences.
5. Validate the focus owner with shell, fullscreen, selection-inspector, change-feed, export, and zero-diff neighbors; update canonical browser inventory and documentation, then run format, lint, both TypeScript projects, repository policy, production build, tightly cropped desktop renders in both themes, and the complete sequential check chain before review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Product scope update (2026-08-30): the user established that Archboard's shell is desktop-only. The pending 420px layout assertion and validation obligation were replaced with the same 44px focus-action contract at the supported desktop viewport. Desktop-sized touch interaction for the Samsung Flip remains supported; phone and narrow responsive layouts are not part of this task.

Implemented deterministic canonical-binding traversal and a pane-local pointer-transparent focus mask. The inspector exposes connected, no-path, inactive, and explicit exit states; guarded Escape yields to fullscreen and Excalidraw editing or modal ownership. Validation: projection 6 pass/20 assertions; canonical connected-path owner 1 pass/33 assertions; affected shell, fullscreen, inspector, and focus owners 4 pass/201 assertions; repository inventory and CI browser policy 81 pass/164 assertions; formatting, lint, both TypeScript projects, production build, and diff check passed. Inspected tightly cropped desktop canvas renders in light and dark at focus-desktop-light.png and focus-desktop-dark.png. Protected CI workflow remains unchanged from a8275ac.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added deterministic browser-only connected-path focus over canonical arrow endpoint bindings. The pane-local overlay preserves real selection and interaction, handles cycles, broken bindings, arrows, labels, fullscreen, explicit and Escape exit, and leaves notes, feeds, scene data, and exports unchanged. Verified with pure graph tests, the canonical rendered owner, adjacent shell/fullscreen/inspector owners, repository policy, formatting, lint, both TypeScript projects, production build, and cropped desktop inspection in both themes.
<!-- SECTION:FINAL_SUMMARY:END -->
