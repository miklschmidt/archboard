---
id: TASK-587
title: >-
  archboard check warns when two modules bind the same code or two relationships
  repeat each other
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T02:27:00Z'
updated_date: '2026-11-07T02:27:00Z'
labels:
  - model
  - check
dependencies:
  - TASK-585
ordinal: 1034000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During the behavior-first layout (TASK-582.03), scratch scans found 18 pairs of modules that bound the same code and 24 groups of relationships with the same source, target and anchor. Each copy was a defect of the current state: it split one piece of code between two identities, or drew one dependency twice. They were fixed by hand, and nothing in `archboard check` catches a new one, so the model gate of `bun run check` (TASK-585) lets them back in. The code settles whether two modules are one, so a warning names the pair and leaves the merge to the author.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The semantics check warns on two modules of one state whose bindings name the same repository, path and symbol, and names both modules and the shared binding
- [ ] #2 The semantics check warns on two relationships of one state with the same source, target and anchor, and names both relationships
- [ ] #3 A binding that contains another (a folder and a file inside it), or two relationships with different anchors, raise no warning
- [ ] #4 check semantics --help and the consumer skill name both codes and what to do about them
- [ ] #5 archboard check on this repository vault reports neither warning, and bun run check passes
<!-- AC:END -->
