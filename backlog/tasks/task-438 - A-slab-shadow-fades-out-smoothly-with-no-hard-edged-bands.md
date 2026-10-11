---
id: TASK-438
title: A slab shadow fades out smoothly with no hard-edged bands
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:49'
updated_date: '2026-10-07 10:51'
labels: []
dependencies: []
ordinal: 791000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A slab casts its shadow as a stack of translucent shapes with hard edges. At high zoom, and in the light theme most of all, the shadow shows as steps (TASK-435 left them open). The owner asked for the bands to go. ADR 0044 forbids an SVG filter, a blur and a mask for depth, because they are costly to draw while a picture is panned and zoomed, so the fix must stay inside that rule and must not make a large board slower to draw.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 At 10x zoom, in both themes, a card shadow reads as one smooth fall-off with no visible steps
- [x] #2 The drawing uses no SVG filter, blur or mask
- [x] #3 The size of the SVG of the Web shop board and of the Archboard server board grows by no more than about 5 percent, or the report says why a larger growth is worth it
- [x] #4 Every shadow stays below every card and every line, and stays out of the front edge of its card
- [x] #5 A container header, a label and a sequence card cast the same smooth shadow
- [x] #6 A renderer test holds the smoothness, for example that the opacity between neighbouring steps never jumps by more than a set amount
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace the hard shadow silhouettes with shared linear and radial gradients over nine adjoining patches. Keep the shadow extent within twelve units and preserve the layer order. Measure SVG size and inspect shadows at ten times scale in both themes. No architecture board is affected: the existing SVG painter owns the same drawing contract and data flow.

Simplification: omit the covered central patch and set pointer-events once on the enclosing group. Eight shared gradient patches draw the visible perimeter.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The shadow now uses nine adjoining patches with shared linear and radial gradients. A Chromium screenshot at ten times magnification shows a continuous falloff in both themes. The rendered owner samples each screen pixel under the foot, requires monotonic opacity and an alpha step below 0.008, and retains the front-edge separation test. No filter, blur or mask is used.

Final SVG size with identical board content and geometry: Web shop light 164782 to 174545 bytes (+5.92 percent), dark 164779 to 174542. Archboard server light 396776 to 426369 (+7.46 percent), dark 396773 to 426366. The growth replaces abrupt bands with continuous corner and side fades without filters or extra raster layers. The first nine-patch version grew 12 to 16 percent; removing the hidden center and repeated pointer attributes cut that growth in half. Eight shared gradients serve every card, header, label and chip.

Draw diagnostic: six interleaved runs of twelve 680 ms sharp zoom flights over Archboard server in 1920 by 1080 software Chromium, scale 0.32 to 3.5, with identical flight code and geometry. Old shadows: median frame mean 20.07 ms, run range 19.77 to 20.71. Smooth shadows: median 20.51 ms, range 19.95 to 20.79. The 0.44 ms difference is within the overlapping run spread. This diagnostic does not establish a material frame cost increase. Evidence: the method reproduces the frame path without compositor raster freezing.

README completion: architecture, sequence, Web shop and banner assets were regenerated and inspected. Stale assets listed for a person: hero, plan, history, drill-down, take-back, ask, explainer, pr-walkthrough and newcomer. The last four need Codex access. No assets were uploaded.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.

TASK-441 resolves the nine README recording follow-ups. All nine clips and videos regenerated from current source, including fresh Codex narration and a fresh agent answer. Parent inspected the outputs, uploaded the media, and replaced the README links. The asset manifest reports 16 of 16 current, zero stale.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shared gradients produce a smooth shadow at ten-times zoom without filters, blur, or masks. Rendered tests and browser inspection pass. The notes explain SVG growth. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->
