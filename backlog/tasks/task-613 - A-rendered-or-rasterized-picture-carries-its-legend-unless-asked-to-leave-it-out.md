---
id: TASK-613
title: >-
  A rendered or rasterized picture carries its legend unless asked to leave it
  out
status: In Progress
assignee: []
created_date: '2026-11-08T22:51:00Z'
updated_date: '2026-11-08T22:52:00Z'
labels:
  - bug
  - renderer
  - cli
dependencies: []
priority: high
ordinal: 1062000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since the canonical module model replaced boards (5c3f5f276, #19), `archboard model render` and `model rasterize` draw no legend. The server route `/api/architecture/render` calls the renderer without an export frame, and the Rust core draws a legend only when the frame names a layout. Board renders had a legend by default (TASK-526.02), so every embed drawn since then, in READMEs, docs and pull-request comments, lost its key. A legend is the default: a reader cannot tell a queue from a service or a dashed line from a solid one without it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard model render` and `archboard model rasterize` draw the legend under the picture by default
- [ ] #2 `--legend vertical` draws it beside the picture, and `--legend none` leaves it out
- [ ] #3 The render recipe records the legend choice, so `archboard check embeds --fix` redraws an embed with the same choice, and an embed drawn without a legend before this change reads as outdated
- [ ] #4 The CLI reference and the consumer skill name the option
- [ ] #5 The tracked embeds of this repository are redrawn with their legend
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `legend` (horizontal, vertical, none; default horizontal) to ArchitectureRenderRequestSchema, so the CLI, the server route and the render recipe all carry it.
2. The /api/architecture/render route passes it to the renderer as the export frame.
3. `model render` gets `--legend`; `model rasterize` reuses the render parameters.
4. Extend tests/system/models/model-render-context.test.ts: default legend, `--legend none`, and an old embed redrawn by `check embeds --fix`.
5. Name the option in skills/archboard/references/canonical-models.md.
6. Redraw the tracked embeds with `check embeds --fix`.
<!-- SECTION:PLAN:END -->
