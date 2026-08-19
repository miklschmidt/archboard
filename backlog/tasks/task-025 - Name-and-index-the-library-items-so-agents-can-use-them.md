---
id: TASK-025
title: Name and index the library items so agents can use them
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-19 21:39'
updated_date: '2026-08-19 21:39'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 25000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every library item has a name; 70 derivable without a model, 41 need rendering
- [ ] #2 Names follow one convention and are what someone would say out loud
- [ ] #3 A catalogue maps name to elements so an agent can insert an item by name
- [ ] #4 Inserting a catalogue item places it at a given position without disturbing the rest of the board
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 21:39
---
Measured before proposing: of 111 items, 11 carry a name field, 59 embed a caption as a text element inside the group, and only 41 are genuinely unidentifiable without looking. The blind ones are cloud(16), drwnio logos(16), software-architecture(7), system-design(2).

The user's framing — 'unnamed makes it useless for agents' — is right but incomplete. Naming is necessary and not sufficient: nothing today lets an agent insert a library item, because library items live in the frontend. A library item is just a list of Excalidraw elements, so a catalogue of name -> elements makes them insertable through the existing add path with no frontend work at all. That is the actual deliverable; naming is its input.
---
<!-- COMMENTS:END -->
