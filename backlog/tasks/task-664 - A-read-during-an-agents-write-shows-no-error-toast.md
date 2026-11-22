---
id: TASK-664
title: A read during an agent's write shows no error toast
status: To Do
assignee: []
created_date: '2026-11-22T13:35:00Z'
labels:
  - bug
dependencies: []
ordinal: 1152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While an agent writes the model, the write holds the model lock, and a browser read in that window answers MODEL_BUSY (packages/model/src/runtime/canonical/installation/store/model-state.ts:340). The browser then shows a red "Architecture unavailable" toast for an ordinary, healthy write. Seen while diagnosing the corrections browser flake on 2026-11-22. A reader should see the model refresh when the write lands, not an error.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A browser read that meets a write in progress shows no error toast
- [ ] #2 The reader shows the written model once the write lands
- [ ] #3 A model that stays unreadable still shows its error
<!-- AC:END -->
