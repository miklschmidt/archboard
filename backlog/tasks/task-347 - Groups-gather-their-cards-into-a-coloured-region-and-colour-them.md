---
id: TASK-347
title: 'Groups gather their cards into a coloured region, and colour them'
status: To Do
assignee: []
created_date: '2026-09-25 00:11'
labels:
  - renderer
  - frontend
dependencies: []
priority: high
type: feature
ordinal: 588000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User decision 2026-09-25: groups steer layout and carry colour. Today a group is meaning only (a test asserts grouping changes nothing drawn), cards take their body colour from an enclosing container's colour scope (ADR 0025), and groups have no colour (ADR 0024/0025). Decided: (1) every configured group has a mandatory colour; (2) a card is placed with its first group in config.yaml order that has at least two members in the drawn view within its container, else the next, else none; (3) each (container, placing group) pair is a Graphviz cluster, drawn as a faint band tinted with the group colour and captioned with the group name, crossable by lines and never split by a column fold; (4) a card's body border and tint come from its placing group, its icon chip keeps its type colour, and the container colour scope is removed. Optimise for readability at 1080p to 2160p. The dogfood vault defines no groups yet: define groups and memberships where they clarify a board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A group without a colour is refused by the vault check with a diagnostic that names the repair, and every shipped example, fixture and skill reference gives groups a colour
- [ ] #2 Cards sharing a placing group within one container are placed together in one region, and a group with a single member in the drawn view places that card with its next group or none
- [ ] #3 A region is drawn as a faint band in its group's colour with the group's name, lines cross it, and a column fold never splits it
- [ ] #4 A card's body colour comes from its placing group and no longer from its container; its icon keeps its type colour
- [ ] #5 An ADR records groups as the source of region and card colour, superseding the colour-scope rule of ADR 0025 and the group clause of ADR 0024
- [ ] #6 The dogfood vault configures groups and assigns them on the boards they clarify, and the affected boards are rendered and looked at
<!-- AC:END -->
