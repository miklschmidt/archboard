---
id: TASK-351
title: >-
  A block layout engine: containers and group regions laid out as compact
  blocks, packed and joined by trunks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-25 02:09'
updated_date: '2026-09-25 02:16'
labels:
  - renderer
dependencies: []
priority: high
ordinal: 592000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Ground-up engine, user direction 2026-09-25 (fast, readable at 1080p to 2160p, groups ASAP, folding must stay; switchable in the board panel). Layered engines stretch a group or container across every rank a member sits on, so regions become tall sparse columns and big boards stack tall. The block engine lays every container, group region and cluster of loose cards out on its own, innermost first, so each is as compact as what it holds and its parent places it as one box. A block of cards: Graphviz ranks its cards, labels, header and ports; the track router (TASK-349) draws its lines; a tall board or container folds into newspaper columns joined by one bus under, beside and over them. A block of blocks: its blocks are packed in rows or columns in the order their lines run, whichever fits the reference pane best, and libavoid routes the trunks between them. Relationships crossing a block edge share one port per kind and far end, so what runs between two blocks is one trunk, and a relationship's label sits inside the block that holds the card it names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every dogfood board and view draws under the block engine without error, each well under 1 s
- [ ] #2 Group regions and containers are compact blocks: a region's members sit inside its band and no other card does
- [ ] #3 Lines between two blocks are drawn as shared trunks, and every label sits inside a block next to the card it names
- [ ] #4 A board or container that stacks taller than the page folds into columns when that fits the reference pane better
- [ ] #5 The engine is selectable in the board panel as Blocks (experimental)
<!-- AC:END -->
