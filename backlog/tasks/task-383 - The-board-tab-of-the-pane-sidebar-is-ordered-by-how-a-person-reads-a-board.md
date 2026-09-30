---
id: TASK-383
title: The board tab of the pane sidebar is ordered by how a person reads a board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-30 18:51'
updated_date: '2026-09-30 19:17'
labels:
  - ui
dependencies: []
priority: high
type: enhancement
ordinal: 662000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-09-30: the board details sidebar (the Board tab of the pane sidebar, TASK-249) needs a lot of attention to detail. Its sections (views, walkthroughs, groups, variants, legend, engine) are stacked without a hierarchy that follows what a person comes to the tab for, so the tab does not guide a first read or a return visit. The hierarchy must come from research into the use cases and into how a human reads a board, done before any redesign. docs/design/operator-canvas-shell.md, section "The pane sidebar", is the current visual authority and must be revised with the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before the redesign, a written study names the tasks a person brings to the board tab, the order in which a person reads a board, and which element of the tab serves each task; the task notes link it
- [ ] #2 The board tab orders and weights its sections by that study: position, heading, spacing and type role show each section's rank, and nothing on the tab lacks a task it serves
- [ ] #3 Every section of the tab shares one alignment grid, one spacing scale and the shell type roles, in the light and the dark theme at 1920×1080
- [ ] #4 Rendered captures of the tab before and after, in both themes, on the dogfood vault, replace the sidebar image in docs/design/assets and the pane sidebar section describes the new hierarchy
- [ ] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Research first: docs/design/pane-sidebar-hierarchy.md (use cases from the product and the boards, how people read a diagram with cited sources, an inventory of the tab with before captures, and the resulting hierarchy). Commit it before any layout change.
2. Shared sidebar parts: one heading role (body 12 px, 600, muted, sentence case), one row of choices (full name wraps, 16 px text column, fill 8 px beyond it), one region with a rule. Use them in both tabs, so the Selection tab loses its uppercase kicker labels too.
3. Board tab in four regions: (a) variants of a drilled board, the variant's summary, the changes against the variant it is read against with the picture's pins and counts and the marks control; (b) walkthroughs (present glyph, full name, steps, narrate), views (the showing view's summary under it), groups; (c) the legend of what the picture draws: kinds, relationships, emphasis and traffic samples; (d) the layout engine as one row at the foot. Drop the Selected sample, the Legend eyebrow and the empty groups sentence.
4. Tests: update the owners that pinned old copy or layout (legend text, empty groups) to structure; add owners for the summary, the changes key and its counts.
5. Browser check at 1920x1080 in both themes on the dogfood vault and the web shop example; replace docs/design/assets/semantic-pane-sidebar.png and revise the pane sidebar section of operator-canvas-shell.md.
6. bun run check, every lane.
No board proposal: the task changes the look of existing sidebar parts and adds no module, dependency or relationship a board draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Study: docs/design/pane-sidebar-hierarchy.md. Main findings: the variant summary is written on 17 of 18 boards and shown nowhere; 34 of 42 views carry a summary nobody sees; the comparison key is the last thing in the tab (below the fold on a draft) although a proposal's reader needs it first; the tab has eight text columns and six equal-weight sections with uppercase kicker headings (eyebrows). Order derived: what it is and changes, how to read it (walkthroughs, views, groups), legend, engine.
<!-- SECTION:NOTES:END -->
