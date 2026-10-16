---
id: TASK-487
title: >-
  A proposal that drops what it inherited, or re-creates it under new ids, is
  told so
status: To Do
assignee: []
created_date: '2026-10-16 13:19'
labels:
  - board-store
  - skill
dependencies: []
priority: medium
ordinal: 852000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 14 October an agent wrote a stack of PR proposals on two Docs-Architecture-Design boards (Device Trust Control Plane, Endpoint Gateway). The first branch of each stack held only the parts its PR changed: it dropped 16 of 21 inherited parts on one board and 6 of 19 on the other. Later branches re-created 12 and 3 of those parts under new ids with the same names and bindings. Archboard accepted every write. The result: every board view that names the original ids drew nothing on the last branch, although that branch holds the work of every earlier one, and each comparison read the re-created parts as removed and added. Repairing it took a restore on the first branch and an id merge on every branch below it (2026-10-16). A proposal is a whole architecture, not a patch (skills/archboard/references/variants.md), and nothing told the author.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `semantic edit` that removes more than half of the nodes the variant inherited from its predecessor lands with a warning that names the count and says a proposal holds the whole architecture
- [ ] #2 `archboard check` reports each node that a draft holds under a new id while one of its ancestors holds a node of the same name or the same binding under another id, naming both ids and both variants
- [ ] #3 Neither warning fires on a draft that replaces a part on purpose (old id removed, new part with a different binding), shown by a test
- [ ] #4 The archboard skill says, where it explains branching, that each PR in a stack is a proposal holding the whole architecture at that branch
<!-- AC:END -->
