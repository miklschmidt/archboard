---
id: TASK-217
title: Share shadcn theme colors with standalone SVG rendering
status: Done
assignee:
  - '@codex'
created_date: '2026-09-15 00:43'
updated_date: '2026-09-15 01:21'
labels: []
dependencies: []
ordinal: 377000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shell uses shadcn CSS theme tokens while SVG diagrams use a separate hardcoded palette. User requests one shared CSS source without requiring a browser or frontend build for archboard semantic render. Preserve user standing colors and decoration settings committed in 5c2f70a7.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Shell and renderer read the same light and dark CSS color definitions, including user comparison colors.
- [x] #2 Standalone semantic render embeds resolved sRGB colors and alpha without external CSS or browser dependencies.
- [x] #3 Focused token/export tests, browser parity checks and complete gate pass.
- [x] #4 Colored container and card fills use alpha compositing so nested tints accumulate instead of replacing their parent surface.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extract shared CSS tokens and add the approved Lightning CSS runtime dependency. 2. Implement strict theme reader and SVG role mappings; retain user decoration values. 3. Verify standalone exports and shell parity in both themes, simplify, run complete gate and commit.

Include the user-requested named node/type palette: move its paired values to --semantic-* CSS tokens; keep vocabulary names in the semantic policy schema and resolve both browser legends and SVG paint from the shared theme.

Replace opaque preblended semantic body fills with the semantic ink and SVG fill-opacity, as requested after inspecting nested container tints. Verify nested frames and cards preserve compositing in both themes.

Add user-requested --diagram-edge token for neutral arrows and relationship legend samples, independently of secondary text; seed light/dark with prior neutral arrow colors in OKLCH.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User standing settings were first committed exactly as edited in 5c2f70a7. Those comparison color values are now retained verbatim in the shared CSS source. Node/type, grouping, and relationship named colors are also moving there per the subsequent user request.

Removed opaque semantic tint preblending: colored frames and cards now use the semantic ink with fill-opacity 0.07. Existing light/dark grouping owner verifies the nested paint order and translucent body fills. Focused theme/renderer suite passes (143 tests). The theme source remains untouched while the user edits its light colors.

User finished editing theme.css; final light palette and all comparison colors are preserved. All tokens are OKLCH. Both standalone CLI exports of Semantic renderer@IV2KX3GX succeed. Browser/source parity compares actual built-shell declarations through the export converter: Lightning CSS uses perceptual sRGB gamut mapping, so saturated OKLCH need not match Chromium channel-for-channel. Replaced old literal-hex shell and raster test expectations with shared-theme-derived values; focused raster suite passes 11 tests.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shared OKLCH theme.css now owns shell, SVG, standing, and semantic palette colors, preserving the user-edited palette. Lightning CSS resolves standalone sRGB exports. Neutral arrows use --diagram-edge; colored bodies composite with fill-opacity. Focused renderer/raster tests, standalone CLI exports, browser theme parity and full bun run check pass.
<!-- SECTION:FINAL_SUMMARY:END -->
