---
id: TASK-351
title: >-
  A block layout engine: containers and group regions laid out as compact
  blocks, packed and joined by trunks
status: Done
assignee:
  - '@claude'
created_date: '2026-09-25 02:09'
updated_date: '2026-10-09 01:40'
labels:
  - renderer
dependencies: []
priority: high
ordinal: 692000
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Block tree: blocks for the board, containers, group regions, and clusters of loose cards in blocks of blocks; relationships projected onto the lowest block holding both ends, crossing each block edge through a port shared per kind and far end; labels in the innermost block around the target (else source).
2. Block of cards: Graphviz ranks cards, labels, header and ports; the track router routes; tall boards and containers fold into newspaper columns joined by one bus; wide ranks wrap into staggered rows.
3. Block of blocks: packed in rows or columns in rank order, best fit to the reference pane; libavoid routes the trunks with a crossing penalty.
4. Second pass: trunks between blocks side by side leave and enter by the facing walls, same packing kept.
5. Engine selectable as Blocks (experimental); gallery and probes compare it with Graphviz and Tracks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured on the dogfood vault (49 drawings): median fit to the reference pane 0.72 (Graphviz 0.71), every drawing under 210 ms (Graphviz up to 8 s on Archboard server). Kept only what measured better: crossing penalty 3000 on trunks (-25% crossings at packed levels); wrapping wide ranks (One author run 0.33 -> 0.62; inner blocks need a 1.4x gain, the board 1.1x); side walls (One write lands 0.72 -> 0.85, Archboard 0.62 -> 0.75). Discarded after measuring: tighter channels beside label bands (no change), ordering ports by trunk bearing (crossings 825 -> 834), routing several near-best packings (-3% crossings for -0.02 fit), a flow cost on packings (fit loss, no crossing gain). Labels are the main space cost: removing them lifts big boards' fit by 30-45%.
<!-- SECTION:NOTES:END -->
