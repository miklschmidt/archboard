---
id: TASK-487
title: >-
  A proposal cannot drop what it inherited, or re-create it under new ids,
  without confirming it
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-16 13:19'
updated_date: '2026-10-16 18:19'
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

Why the skill recipe. The sessions (Codex, 2026-10-14, investigated 2026-10-16) show what happened. The parent ran `semantic branch --from joT0a1AY`, which carried all 21 parts. A planning subagent then wrote a batch that removed every node except the two CA authorities, and the parent applied it with `semantic edit`. The rule came from an agent-written plan: "first layer partial branches from existing family then removes future claims on new draft only", because "Full TASK-0417 drafts contain later layer claims and cannot be reused as each PR after state". The planner's README then said "Reintroduced future subjects keep canonical names but omit IDs, so the CLI mints them". At the time, archboard refused an id that the direct predecessor did not hold, so a part removed from an early branch could not come back under its id later. The agents treated each PR as the implemented state and the design's later parts as claims to delete. Neither the user's request nor the archboard-pr skill asked for that, but archboard-pr did not say that a proposal keeps the whole design. An earlier guess that the recording recipe caused it is wrong: the agents read that recipe only after the pruning. The user chose the whole-design model on 2026-10-16: every proposal in a stack holds the whole planned architecture, and a view or the comparison shows one PR's change.

Why refusals and not warnings. The user chose refusals that need a confirmation (2026-10-16). A warning arrives after the write has landed: an agent that misses it has already damaged the board, and the damage spreads to every draft below. A refusal stops the write while the agent still has the context to choose, and the confirmation keeps a real redesign or a genuinely new part possible on purpose. It is the same pattern the user asked for when an id held only by another variant is restored.

Why these two checks. Each mistake was one write, and each check catches one of them at that write. Re-creating a part by name or binding while an ancestor holds it under another id is the precise signal: it is what emptied the views and broke the comparisons, and it would have stopped both boards. The refusal points to restoring the ancestor id, which the flow and known-id restore change makes one step. Removing more than half of what a variant inherited catches the first mistake, where a PR proposal kept only its own change.

Possible simplification, to decide once the restore change lands: one `--confirm <code>` option naming the refusal codes the caller accepts, instead of one flag per refusal, so archboard has a single confirmation concept.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `semantic edit` that adds a node without an id while an ancestor of the variant holds a node of the same name or the same binding under another id is refused with its own error code; the refusal names the ancestor id and variant, and says to state that id to restore the part or to confirm a different part
- [ ] #2 A `semantic edit` that removes more than half of the nodes the variant inherited from its predecessor is refused with its own error code that names the count, unless the edit confirms the removal
- [ ] #3 Each refusal is passed by its confirmation, which is discoverable in `semantic edit --help`, and the landed write says what was confirmed
- [ ] #4 A replacement made on purpose (old id removed, new part with another name and binding) and an ordinary edit pass without any confirmation, shown by a test
- [ ] #5 The archboard skill has a recipe for a stack of pull requests on a vault board: each PR is a proposal branched from the one before, holds the whole architecture at that branch, and states only its own change; the pull request recording recipe says its cut-down board is for a throwaway board only and points to the stack recipe
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One confirmation concept: replace the --restore-known-ids flag and the restoreKnownIds request field (commit 39d02606f) with a repeatable 'semantic edit --confirm <code>' carried as 'confirm: string[]' on the edit input. A refusal that can be confirmed names its code and the --confirm that passes it; the landed write warns for each confirmed act. Codes: RESTORE_UNCONFIRMED (existing), a re-created-part code and a mass-removal code.
2. Re-creation refusal in the edit transition: a node the edit adds under a newly minted id, while an ancestor of the variant (parent chain) holds a node with the same name or the same binding (repo + path + symbol) under an id the edited variant lacks, is refused. The message names the ancestor id, the variant, and both ways on: state that id (restore, with --confirm RESTORE_UNCONFIRMED when the predecessor lacks it) or --confirm the code for a different part.
3. Mass-removal refusal: an edit after which the variant holds fewer than half of the nodes it held before that its predecessor also holds is refused unless confirmed. Only variants with a predecessor.
4. Tests in semantic-board-store: each refusal by code, each confirmation, a deliberate replacement and an ordinary edit pass unconfirmed.
5. Skill: a PR stack recipe beside the recording recipe in sequences-views-walkthroughs.md (or variants.md), and the recording recipe says its cut-down board is throwaway and points to it; update variants.md and edit.md restore text for --confirm.
6. Gate: store, shared and cli tests, lint, tsc, skill-links test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-16: the user chose refusals that need a confirmation over warnings. Implementation waits for the flow and known-id restore change (same edit path, implementer worktree), whose confirmation flag the re-creation refusal points to.

2026-10-16 implementation: one confirmation concept. 'semantic edit --confirm <code>' (repeatable; also 'confirm: [...]' in the batch, merged with the option) replaces --restore-known-ids / restoreKnownIds. The shared schema accepts only the three confirmable codes (ConfirmableRefusalSchema), so a misspelled code is refused, not ignored. New guard src/runtime/semantic-board-store/lib/inheritance.ts runs in the edit transition after the content is computed: PART_RECREATED (a node under a freshly minted id whose name, or exact binding repo+path+symbol, matches a node an ancestor holds under an id the variant lacks after the edit; nearest ancestor named, with the restore hint and --confirm RESTORE_UNCONFIRMED when the predecessor and base lack the id), checked before INHERITANCE_DROPPED (variant with a parent; removed*2 > nodes held before that the parent also holds). A confirmed write warns with the same code (RESTORED_FROM_OTHER_VARIANT kept for restores). Tests: semantic-board-store/tests/inheritance.test.ts; restoration.test.ts 'a node stated without an id is still new' and tests/system/semantic-boards/edge-identity.test.ts now confirm PART_RECREATED, because each deliberately writes the re-created part the rule refuses (the rule is right, the fixtures make the mistake on purpose). Skill: variants.md Branching names both refusals and adds 'A stack of pull requests'; the recording recipe says its cut-down board is throwaway only and links there; edit.md and authoring.md use --confirm.
<!-- SECTION:NOTES:END -->
