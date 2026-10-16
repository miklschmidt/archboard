---
id: TASK-487
title: >-
  A proposal cannot drop what it inherited, or re-create it under new ids,
  without confirming it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-16 13:19'
updated_date: '2026-10-16 13:31'
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
- [ ] #1 A `semantic edit` that adds a node without an id while an ancestor of the variant holds a node of the same name or the same binding under another id is refused with its own error code; the refusal names the ancestor id and variant, and says to state that id to restore the part or to confirm a different part
- [ ] #2 A `semantic edit` that removes more than half of the nodes the variant inherited from its predecessor is refused with its own error code that names the count, unless the edit confirms the removal
- [ ] #3 Each refusal is passed by its confirmation, which is discoverable in `semantic edit --help`, and the landed write says what was confirmed
- [ ] #4 A replacement made on purpose (old id removed, new part with another name and binding) and an ordinary edit pass without any confirmation, shown by a test
- [ ] #5 The archboard skill has a recipe for a stack of pull requests on a vault board: each PR is a proposal branched from the one before, holds the whole architecture at that branch, and states only its own change; the pull request recording recipe says its cut-down board is for a throwaway board only and points to the stack recipe
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16: the user chose refusals that need a confirmation over warnings. Implementation waits for the flow and known-id restore change (same edit path, implementer worktree), whose confirmation flag the re-creation refusal points to.
<!-- SECTION:NOTES:END -->
