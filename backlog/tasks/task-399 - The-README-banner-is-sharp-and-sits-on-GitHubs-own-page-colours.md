---
id: TASK-399
title: The README banner is sharp and sits on GitHub's own page colours
status: Done
assignee:
  - '@claude'
created_date: '2026-10-05 22:41'
updated_date: '2026-10-05 22:48'
labels:
  - docs
  - tooling
dependencies: []
references:
  - scripts/readme-assets/banner.ts
  - docs/agents/readme-assets.md
priority: medium
ordinal: 739000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner looked at the banner and the social card and found the diagram pixelated: the banner page lays a pre-made 2x bitmap of the diagram under a 3D tilt at one pixel per CSS pixel, so Chromium resamples a bitmap that is minified two to four times without filtering. The owner also asked that both pictures use the same background colour as GitHub in the light and the dark colour mode, so the banner has no visible edge on the README page. Archboard's own ground is not GitHub's.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The diagram in the banner and the social card is drawn from the renderer's vector picture, not from a bitmap, and at two pixels per CSS pixel, so its text and lines are sharp when the banner is shown at README width and when the social card is shown
- [x] #2 The ground of the light banner is GitHub's light page colour and the ground of the dark banner and of the social card is GitHub's dark page colour, measured on the written files (WebP and JPEG) within one level of the colour
- [x] #3 The kit document and the manifest say what the banner is made of, and readme:check reports the banner current
- [x] #4 The traffic marks sit at their first frame, the face check refuses a page that loaded no display face, and repeated makes agree to within a few anti-aliased pixels (the kit says so, it does not claim the same bytes)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draw the renderer's SVG inline in the banner page (semantic render, not rasterize), force its --background to the GitHub ground of the theme, pause its animation at time zero, and wait for every face. 2. Give the browser window a pixel ratio, photograph the banner at 2x, and scale to 2172 wide and cut the social card from the 2x picture, both with lanczos. 3. Take the rasterizer out of the banner's sources and docs. 4. Measure the ground of the written files, look at both banners and the card, make the banner again, run the gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-10-06: type-check, lint, fmt:check and test:repository exit 0, readme:check lists the banner as current, and the written files were sampled: dark WebP ground srgb(13,17,22) against GitHub's #0d1117, light WebP srgb(255,255,255), social JPEG within one level. I looked at both banners and the card at full size. The first light make differed from the later ones by a few anti-aliased pixels (up to 19 percent at some of them). Removing the animation and photographing until two shots matched did not make the files byte-identical, so the settle loop was removed again and banner.ts says so. The cause was not traced.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The banner page now sets the renderer's SVG in as vector (semantic render, not a bitmap from semantic rasterize), forces the drawing's --background to GitHub's page colour for the colour mode (#0d1117 dark, #ffffff light), removes the traffic animation so the marks sit at their first frame, and is photographed at two pixels per CSS pixel through a new pixelRatio option of the kit's browser window, then scaled with lanczos. The social card is cut from the 2x dark picture. The kit document, PRODUCT.md and the manifest sources no longer name the rasterizer for the banner. Verified with the gates, readme:check, pixel samples of the written files and a look at the pictures. Repeated makes agree to within a few anti-aliased pixels, not byte for byte.
<!-- SECTION:FINAL_SUMMARY:END -->
