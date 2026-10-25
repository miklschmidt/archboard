---
id: TASK-520.10
title: The scene is typed, so a frontend paints it without reading SVG or CSS
status: To Do
assignee: []
created_date: '2026-10-25T04:29:00Z'
labels: []
dependencies:
  - TASK-520.09
parent_task_id: TASK-520
ordinal: 931000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0057 says each frontend paints the core's scene itself. Today the scene leaks SVG (review of 2026-10-25): an Element carries an SVG element name and an ordered list of SVG attributes, Item::Break only reproduces old newlines, paints are CSS expressions (var(--…), light-dark, color-mix), transforms and path data are SVG strings, groups carry both a role and its CSS class, and the painter mints ids by hashing serialized markup (paint/ports.rs, paint/crossings.rs), which keeps the SVG writer inside archboard-scene. A GPUI frontend would have to parse SVG and CSS. Make the scene a typed description of shapes, paths, paints, transforms, text runs and groups, and move every SVG and CSS spelling into archboard-svg.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The scene's types hold no SVG element name, attribute string, path-data string or CSS expression; paints name palette tokens and colour operations as values
- [ ] #2 Ids are minted from scene values, not from serialized markup, and the SVG writer lives only in archboard-svg
- [ ] #3 archboard-svg writes every corpus picture as the same bytes as before the change
- [ ] #4 A native Rust test reads the shapes, paints and text of a corpus board's scene without parsing any string
<!-- AC:END -->
