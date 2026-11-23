---
id: TASK-674
title: A flowchart legend names its "Next" line once
status: To Do
assignee: []
created_date: '2026-11-23T12:25:00Z'
labels:
  - renderer
  - bug
dependencies: []
ordinal: 1164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The legend under a flowchart lists two relationship entries, both worded "Next": one line with an arrowhead and one plain line with none. A reader cannot tell what the second entry stands for, and the legend reads as broken. It shows on the site's place-order flowchart (site/src/diagrams/place-order-flowchart.svg) and was already there on main before the kinds layer, so the cause is in how the flowchart grammar builds its legend entries, not in the architecture changes. Found by the site audit of the kinds layer (feat/kinds-effects-lenses).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A flowchart legend shows one entry for each distinct line look it draws, each with its own word
- [ ] #2 The site's place-order flowchart legend lists "Next" once
- [ ] #3 A renderer test fails on a flowchart legend that repeats an entry
<!-- AC:END -->
