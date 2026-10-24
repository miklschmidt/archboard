---
id: TASK-520.07
title: 'The core shapes text, and every picture draws the glyphs of the core'
status: To Do
assignee: []
created_date: '2026-10-24 12:54'
labels:
  - renderer
dependencies:
  - TASK-520.05
  - TASK-520.06
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-paint-list.md
parent_task_id: TASK-520
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the canvas of the place that draws measures text (Pretext over the browser canvas, or @napi-rs/canvas under Bun), so two places can measure a word differently and a picture holds only where its fonts load. ADR 0057 moves shaping into the core and puts glyph runs on the paint list, so every painter draws the same glyphs and an SVG needs no font. Known costs, decided by the user on 2026-10-24: glyph paths are drawn without hinting, a picture with many distinct glyphs grows, and the words must stay findable and readable by assistive technology.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The core measures and breaks every run with harfrust and skrifa on the bundled font files, and Pretext and canvas measurement are gone from the renderer
- [ ] #2 The paint list carries glyph runs with the string of each run, and the SVG painter defines each glyph a picture uses once and writes each string as accessible text
- [ ] #3 An exported SVG draws its words in Chromium and Firefox with no diagram font installed or embedded, and a search of the page finds them
- [ ] #4 Card titles, notes and labels at 1920x1080 are compared with the pictures before the change, and the screenshots are recorded in the task notes
- [ ] #5 No corpus picture is worse on the measures of ADR 0039
- [ ] #6 AGENTS.md states the new text invariant, and a test holds every painter to the glyph positions of the core in place of tests/system/browser/measured-text.test.ts
<!-- AC:END -->
