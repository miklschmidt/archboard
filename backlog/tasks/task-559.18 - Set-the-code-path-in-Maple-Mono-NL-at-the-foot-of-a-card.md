---
id: TASK-559.18
title: Set the code path in Maple Mono NL at the foot of a card
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T00:24:00Z'
updated_date: '2026-10-31T06:19:00Z'
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
- [x] #1 A card sets its name, then its description, then its code path pinned to the foot, and the margin below the path baseline equals the margin above the title cap line
- [x] #2 The folders of a path are dim and its file name is bright, and a count such as 3 paths stays dim
- [x] #3 Maple Mono NL replaces DM Mono in the core and in the chrome, so that one mono font remains, and the DM Mono files leave the repository
- [x] #4 The bundled font adds no more to the core than a measured subset needs, and every drawing stays under 500 ms
- [x] #5 drawn-glyphs and a search of an exported SVG still pass with the new face
- [ ] #6 DESIGN.md, the licence files and the owner accept the result
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Subset Maple Mono NL to what the product needs and bundle it in place of DM Mono.
2. Replace the family everywhere in the core, the chrome and the docs.
3. Pin the path to the card's foot, with its folders dim and its file bright.
4. Check the glyph test, the search of an export and the 500 ms limit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner agreed: subset Maple Mono NL to the characters the product needs. It is 242 KB against 50 KB for DM Mono.

One mono family remains. The DM Mono files left the repository, and packages/renderer/assets/fonts/subset-mono.sh reproduces the subsets. Every drawing stays under 500 ms: the slowest takes 467 ms.

Gate on the final code: bun check:all exit 0 after 144 s, 21 of 21 tasks, 44 of 44 browser files, drawn-glyphs included. An earlier run failed once in tests/system/process-contracts/codex-realtime.test.ts at load 43. That test passed 5 of 5 alone, and no file on its path changed.
<!-- SECTION:NOTES:END -->
