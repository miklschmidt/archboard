---
id: TASK-443
title: Pipe rendered boards into clipboard tools
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 14:19'
updated_date: '2026-10-07 14:27'
labels: []
dependencies: []
ordinal: 726000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copying a rendered board currently requires a file and a JSON receipt. The user wants to pipe an image directly into wl-copy, like Chrome Copy image, and retain description text where the format supports it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 semantic render without --out writes the standalone SVG to stdout, with its accessible description and no JSON receipt.
- [ ] #2 semantic rasterize without --out writes valid PNG bytes to stdout for image clipboard tools.
- [ ] #3 Explicit --out paths retain file writes and JSON receipts. Failures write no image bytes to stdout.
- [ ] #4 Help and author guidance show SVG and PNG clipboard pipelines, including the format limitations for descriptions.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make --out optional on semantic render and semantic rasterize. Select the existing raw output mode when no path is supplied. Keep file receipts for explicit paths.
2. Publish complete SVG or PNG output only after rendering and cleanup succeed. Preserve SVG description metadata and document the PNG/text limitation.
3. Extend the existing command owners to prove clean stdout, byte-safe PNG pipelines, file compatibility, and failure behavior. Update command audit and author guidance, then run focused and complete gates.
No architecture board is affected: commands keep the same render service, rasterizer, and output owner. The existing raw output mode supplies the new destination without new modules or dependencies.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented stdout image output with the existing raw output mode. Explicit --out paths still stage an artifact and return the existing receipt. Both SVG and PNG use Uint8Array results, so the existing publisher writes exact bytes without a text newline. PNG output still waits for successful browser cleanup.
SVG retains the accessible name and any longer description that the renderer supplies. Flat architecture drawings have an accessible name but no desc element. Sequence drawings have a desc element. PNG keeps visible labels, but not SVG metadata. The wl-clipboard manual confirms that one copy offers one format, so a pipe cannot also provide separate plain text.
Simplification pass: reuse the existing render, rasterize, and raw-output paths. No clipboard dependency, new output mode, new flags, or renderer changes. All export pipe assertions live in the existing rasterize owner.
<!-- SECTION:NOTES:END -->
