---
id: TASK-493
title: The code check reads a draft's branch from Git for anchors and bindings
status: To Do
assignee: []
created_date: '2026-10-17 10:53'
labels:
  - code-check
dependencies: []
type: bug
ordinal: 858000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check --code skips every anchor and binding whose binding names a branch that is not checked out (ref-not-checked-out). A pull-request stack binds each layer's parts to its own branch, so on 2026-10-17 a --every-draft run skipped 1796 subjects on Device Trust Control Plane, 367 on Platform Test Cluster and 139 on Endpoint Gateway: the check said nothing about almost every part it was asked about. TASK-488 already reads a branch from Git without a checkout for the dropped-part check (sourceAt in src/runtime/history-lens/lib/source-history.ts). skills/archboard/references/variants.md says 'It reads that branch from Git and does not check it out', which reads as if it covers every check, and it does not. Reported by the agent fixing the device-trust pull-request bodies.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Anchors and bindings whose binding names a branch or commit the checkout can resolve are checked against that ref's code read from Git, without a checkout and without changing the working tree
- [ ] #2 ref-not-checked-out is reported only for a ref the checkout cannot resolve, and the skip names the ref
- [ ] #3 A test shows a broken anchor on a branch that is not checked out is reported, and a sound one is not
- [ ] #4 check --code --every-draft on Device Trust Control Plane in Docs-Architecture-Design (read-only) skips no subject whose branch exists in the Platform checkout; the before and after skip counts are recorded
- [ ] #5 The skill text says which checks read a branch from Git, and says it correctly
<!-- AC:END -->
