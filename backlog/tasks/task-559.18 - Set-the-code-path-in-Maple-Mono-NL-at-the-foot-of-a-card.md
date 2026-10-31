---
id: TASK-559.18
title: Set the code path in Maple Mono NL at the foot of a card
status: To Do
assignee: []
created_date: '2026-10-31T00:24:00Z'
labels:
  - renderer
  - frontend
dependencies:
  - TASK-559.14
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 990000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner said that the monospaced path broke the typography of a card and that DM Mono looks bad. The path sat between the name and the description at the size and colour of the description, so it split them. The owner chose Maple Mono NL (v7.9, OFL 1.1), downloaded and verified in /tmp/integrate/maple-dl/. The owner chose the path at the foot of the card, with dimmed folders and a bright file. Mockup: /tmp/integrate/header-mockups/maple-final.png, 10.5 px.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A card sets its name, then its description, then its code path pinned to the foot, and the margin below the path baseline equals the margin above the title cap line
- [ ] #2 The folders of a path are dim and its file name is bright, and a count such as 3 paths stays dim
- [ ] #3 Maple Mono NL replaces DM Mono in the core and in the chrome, so that one mono font remains, and the DM Mono files leave the repository
- [ ] #4 The bundled font adds no more to the core than a measured subset needs, and every drawing stays under 500 ms
- [ ] #5 drawn-glyphs and a search of an exported SVG still pass with the new face
- [ ] #6 DESIGN.md, the licence files and the owner accept the result
<!-- AC:END -->
