---
id: TASK-331
title: >-
  Adopting a proposal whose parent another adoption superseded warns and needs
  --force
status: To Do
assignee: []
created_date: '2026-09-24 13:37'
labels:
  - store
  - cli
dependencies: []
priority: high
type: feature
ordinal: 572000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two tasks that branch proposals from the same current variant can each adopt theirs, and the second adoption silently drops the first one's change: reproduced on a scratch vault (TASK-1 adds A and is adopted, TASK-2 adds B and is adopted, the current variant has B and not A). The store refuses nothing (src/runtime/semantic-board-store/lib/adopt.ts adoptable). User decision 2026-09-24: adoption of such a proposal warns and requires --force. The archboard-dev skill's closing step 3 works around the gap today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 semantic adopt of a proposal whose parent is no longer the current variant, because another variant was adopted after it was branched, is refused with a warning that names the superseded parent, the variant that replaced it, and the two ways on (branch again from the current variant, or --force)
- [ ] #2 --force adopts it anyway, and the adoption record says it was forced
- [ ] #3 A proposal branched from the current variant adopts exactly as before
- [ ] #4 The consumer skill's variants reference and the archboard-dev closing steps describe the refusal and --force
- [ ] #5 One test owner proves the refusal and the forced adoption
<!-- AC:END -->
