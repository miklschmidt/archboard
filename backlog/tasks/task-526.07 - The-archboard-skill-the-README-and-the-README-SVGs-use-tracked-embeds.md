---
id: TASK-526.07
title: The archboard skill, the README and the README SVGs use tracked embeds
status: To Do
assignee: []
created_date: '2026-10-24T15:36:00Z'
labels:
  - skill
  - docs
dependencies:
  - TASK-526.04
  - TASK-526.05
documentation:
  - >-
    docs/adr/0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md
parent_task_id: TASK-526
priority: medium
type: enhancement
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agents embed diagrams in documentation, and they need to know to use --track and to run archboard check after a change. The owner asked for a README section that markets tracked embeds. The render-based README SVGs are kept current by the README kit today, and as tracked embeds they show the feature on the README itself.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The archboard skill tells agents to embed a picture in documentation with render --out and --track, and to run archboard check after a change
- [ ] #2 The README has a section on tracked embeds with the render command, what archboard check says after a code change, and check --fix
- [ ] #3 The architecture, sequence and web-shop SVGs in docs/readme are tracked embeds, and archboard check reports them current
- [ ] #4 The documentation says to keep the metadata element when a pipeline runs SVGO
<!-- AC:END -->
