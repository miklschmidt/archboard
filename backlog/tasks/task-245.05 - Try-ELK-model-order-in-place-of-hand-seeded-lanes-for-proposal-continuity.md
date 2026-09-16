---
id: TASK-245.05
title: Try ELK model order in place of hand-seeded lanes for proposal continuity
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
labels: []
dependencies:
  - TASK-245.04
references:
  - src/runtime/semantic-renderer/lib/layout/compound-predecessor.ts
  - src/runtime/semantic-renderer/lib/layout/compound-node-hints.ts
  - docs/design/measured-compound-renderer.md
parent_task_id: TASK-245
priority: medium
type: spike
ordinal: 428000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Continuity across variants (ADR 0023: a proposal keeps its predecessor's arrangement) is implemented by seeding ELK with INTERACTIVE strategies, pinned card positions, port offsets escalating to FIXED_POS, seeded routes, hand-placed lanes for new cards and badge room beside inherited corridors: compound-predecessor.ts, compound-node-hints.ts, compound-flanks.ts and compound-label-space.ts, 1,227 lines, most of them incident-driven (layout-rules.md section 4 item 7). ELK's layered algorithm offers model order (elk.layered.considerModelOrder.strategy NODES_AND_EDGES, crossingMinimization.forceNodeModelOrder, INTERACTIVE layering keyed on the predecessor's layers) as the supported way to keep an arrangement stable without coordinates. This is an experiment with a decision at the end: land it if it keeps the continuity tests and the fit, otherwise record the measurement and keep the seeding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A measured comparison on the vault's proposals (Canvas server, Renderer layout, Semantic renderer) and on each fixture with one synthetic edit, reporting card displacement against the predecessor, fit, bends and route ink for the current seeding and for model order, is recorded in docs/design/layout-rules.md
- [ ] #2 Either model order replaces the seeding, with compound-node-hints.ts, compound-flanks.ts and compound-label-space.ts deleted and the predecessor-layout, predecessor-routing, new-card-placement, comparison-labels, comparison-approach and standing tests passing (re-derived where they pinned seeding geometry), or the note records why it lost and the seeding stays
<!-- AC:END -->
