---
id: TASK-443
title: Pipe rendered boards into clipboard tools
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 14:19'
updated_date: '2026-10-07 14:20'
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
