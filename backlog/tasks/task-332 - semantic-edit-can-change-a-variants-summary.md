---
id: TASK-332
title: semantic edit can change a variant's summary
status: To Do
assignee: []
created_date: '2026-09-24 13:37'
labels:
  - store
  - cli
dependencies: []
priority: medium
type: feature
ordinal: 573000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A variant's summary is set only when it is branched (semantic branch --summary), and no command changes it afterwards, so TASK-328 left several dogfood current variants saying 'as implemented on 2026-09-13' although their content now describes 2026-09-24. User decision 2026-09-24: make it editable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An edit can set the summary of the variant it lands on, as part of the same one write
- [ ] #2 Historical and shelved variants refuse a summary change as they refuse any content edit
- [ ] #3 The consumer skill's edit reference and the generated schema name it
- [ ] #4 One test owner proves the change
- [ ] #5 Every dogfood current or draft variant whose summary names a date its content no longer describes is corrected
<!-- AC:END -->
