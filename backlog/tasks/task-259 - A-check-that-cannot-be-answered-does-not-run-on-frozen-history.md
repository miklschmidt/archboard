---
id: TASK-259
title: A check that cannot be answered does not run on frozen history
status: To Do
assignee: []
created_date: '2026-09-17 22:29'
labels: []
dependencies: []
references:
  - src/runtime/semantic-board-store/lib/drill-down.ts
  - docs/adr/0029-a-node-standing-for-another-board-carries-that-boards-level.md
  - TASK-257
ordinal: 466000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A historical variant refuses content edits on purpose — what was true then does not change — so a diagnostic about its content names something no accepted write can repair. `./bin/dogfood check` sits at exactly one warning today and it is that shape: `Renderer layout`/`Initial` carries `Render driver`, kind `function`, opening the `Semantic renderer` board at level `module`, which ADR 0029 asks to agree. The drill-down checks added with that ADR (src/runtime/semantic-board-store/lib/drill-down.ts) read every variant, current, draft and historical alike.

This is the last thing standing between the vault and a clean check, and it is why TASK-255 and TASK-257 each sit one acceptance criterion short. It also decides the shape of TASK-260: a check whose answer depends on the world outside the board belongs over the variants somebody can still edit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A diagnostic about a variant's content is reported for current and draft variants and not for historical ones
- [ ] #2 `./bin/dogfood check` reports no diagnostics against the tracked vault
- [ ] #3 A test owns the exemption, including a historical variant that would fail the check if it were current
<!-- AC:END -->
