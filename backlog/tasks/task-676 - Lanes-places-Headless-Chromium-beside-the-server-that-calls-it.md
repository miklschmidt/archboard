---
id: TASK-676
title: Lanes places Headless Chromium beside the server that calls it
status: To Do
assignee: []
created_date: '2026-11-24T03:54:00Z'
labels:
  - renderer
  - layout
dependencies: []
ordinal: 1166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In Lanes' root reading, the teal line from Archboard server to Headless Chromium runs alone under Archboard server and crosses the Agent CLI to Packages bus about four times. It is the only line between those two cards. Headless Chromium stands left of that bus and Archboard server right of it, so every route crosses the bus. The advisors kept the route with the fewest crossings and left the fix to placement (artifacts/lanes-kinds/advisor-brief-9b.md, ADR 0096 amendment).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 In Lanes' root reading, the line from Archboard server to Headless Chromium crosses no bus it does not join
- [ ] #2 No other line in that reading gains a crossing or a lap round the page
- [ ] #3 The Lanes corpus shows which drawings change, and none fails
<!-- AC:END -->
