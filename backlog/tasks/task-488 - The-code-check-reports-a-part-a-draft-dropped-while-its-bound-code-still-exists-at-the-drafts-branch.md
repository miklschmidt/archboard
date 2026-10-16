---
id: TASK-488
title: >-
  The code check reports a part a draft dropped while its bound code still
  exists at the draft's branch
status: To Do
assignee: []
created_date: '2026-10-16 13:37'
labels:
  - code-check
  - board-store
dependencies:
  - TASK-487
priority: low
ordinal: 853000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-487 refuses, at write time, a draft that removes more than half of what it inherited. That refusal is a count: it cannot tell a part the PR deleted from a part the author forgot, and it misses a drop of one or two parts. The code check can tell them apart with evidence. If the predecessor holds a part, the draft lacks it, and the part's bound path or symbol still exists in the draft's code, the part was most likely dropped by mistake. Many drafts that describe a PR carry `binding.branch` on their parts, so the check knows which ref to read.

Why this is a follow-up and not the guard. The damage on Device Trust Control Plane and Endpoint Gateway (14 October, repaired 2026-10-16, see TASK-487) spread to every draft below in the same write, so a check that runs after the write and only on request cannot prevent it. What broke there was identity between variants, which the code does not know. The write-time refusals of TASK-487 stay the guard, and this finding adds code evidence for the drop case.

Why it must read every draft. Plain `check --code` reads only the current variant of each board, and `--variant` reads one named draft per board. A PR stack is all drafts: Device Trust Control Plane holds eleven in a row and no current variant. Neither form would have seen this damage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With the code check, a draft that lacks a node its predecessor holds, while that node's bound path (and symbol, when it names one) exists in the code the draft is read against, gets a warning with its own code that names the node, both variants and the evidence
- [ ] #2 A node whose bound code is gone from that code is not reported, shown by a test
- [ ] #3 The code check can read every draft of a board, each against the ref its bindings name, in one run, and reports which drafts it could not read and why (for example, a checkout that lacks the ref)
- [ ] #4 Run against the 14 October state of Device Trust Control Plane (git history of Docs-Architecture-Design before 2026-10-16), the check reports the parts `feat/device-trust-authorities` dropped
<!-- AC:END -->
