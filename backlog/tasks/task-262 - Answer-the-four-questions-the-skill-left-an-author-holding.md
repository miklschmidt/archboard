---
id: TASK-262
title: Answer the four questions the skill left an author holding
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-17 22:30'
updated_date: '2026-09-17 22:58'
labels: []
dependencies: []
references:
  - TASK-257
  - skills/archboard/references/variants.md
  - skills/archboard/references/edit.md
ordinal: 469000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dogfood rewrite (TASK-257) was the first substantial use of the revised skill by an agent that had not written it, and it recorded four things the skill or the product did not tell it, in the order they cost time.

1. A board must be drawn with its predecessor in mind. `semantic rasterize` on a variant that has a parent draws the COMPARISON, not the variant, and that is the picture a reader gets. The recipes say to draw and look, but every worked example is a root variant, so nothing warns an author that adding parts to a derived variant is a different drawing problem. It is also how the renderer crash TASK-257 fixed stayed hidden: wide-boards.test.ts renders every vault board without a predecessor.

2. `resolve --side theirs` is refused for a deleted-and-changed issue, because taking that side is an ordinary edit rather than a choice between two values. The refusal is clear, but references/variants.md presents mine/theirs as a general choice, and a batch mixing competing-field and deleted-and-changed issues is refused whole with every subject named, which reads as though none could be answered.

3. Edge identity is counted against the PREDECESSOR, not against what the author read. Restating a relationship with one changed label was refused because it differs from the historical variant by three properties. references/edit.md says two or more changed properties make a replacement without saying two or more relative to the variant this one came from — a real trap on a derived variant, where a relationship nobody has touched may already be one change from its limit.

4. Views, walkthrough beats and flows mint their own ids. references/authoring.md says to leave `id` out for new nodes and relationships and does not say the same for the rest, so a readable id is written and refused for the block-id alphabet.

Each is either a sentence the skill owes an author or a refusal the product should word better; decide which per item rather than assuming the skill is always the answer. Whether these land is measured by the next evaluation batch, which the user runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the four is answered where an author meets it, in the skill or in the refusal, and the choice is recorded per item
- [x] #2 No recipe step grows longer than it is today
- [x] #3 Any payload shown is validated through the store or the generated schema
- [x] #4 The skill text stays about archboard's own source and passes the eval:skill check leak guard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read TASK-257's four findings, the skill, and the refusal site behind each one; reproduce each in a scratch vault through semantic-board-store.
2. Decide per item whether the skill owes a sentence or the product owes a better refusal, by reading what the product already says at the moment the author meets it.
3. Item 1 (a derived variant draws the comparison): product. Carry the predecessor onto the `semantic render` and `semantic rasterize` receipts as `comparedWith`; one paragraph in references/variants.md.
4. Item 2 (`resolve --side theirs`, and a mixed batch refused whole): skill, because the refusal lives in the store worker's files. An 'Answered by' column on the issue-kind table plus the batch rule; record the product change as a follow-up.
5. Item 3 (edge identity counted against the predecessor): skill. The refusal already names the predecessor and the fields; references/edit.md contradicts it. Reword step 2 without growing it.
6. Item 4 (views, flows and beats mint their own ids): product. The stated-id schema message tells the author to leave `id` out, as the store already does one layer down.
7. Pay for every addition by cutting duplication; verify with targeted tests and eval:skill check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## The choice, per item

**1. A derived variant draws the comparison — the product owes the better answer.**
Nothing was refusing anything: `semantic rasterize` and `semantic render` simply
answered a receipt that did not mention the second variant in the picture. The
render answer has carried `changes.predecessor` all along (it is what the marks
are computed from); both CLI receipts dropped it. They now carry
`comparedWith`: the predecessor as a `RenderedVariant`, or null for a variant
that came from nothing. Both commands read it through one helper
(`drawnAgainst` in src/cli/commands/lib/semantic-input.ts) so the two answers
cannot drift. `--variant`'s help says it too. The skill carries the half a
receipt cannot: references/variants.md now opens 'Comparing before you report'
with what the comparison picture is, and that parts added to a derived variant
arrive already marked.

**2. `resolve --side theirs`, and a batch refused whole — the skill, under protest.**
The product could answer this better and the fix is one word, but the site is
src/runtime/semantic-board-store/lib/settle.ts, which another worker owns this
week. See the follow-up below. references/variants.md's issue-kind table gained
an 'Answered by' column (`theirs` only for `competing-field`; every other kind
takes `mine` or an ordinary edit, named per kind), and the paragraph under it
says the refusal names every choice in the batch rather than the offender, so it
is read as naming the payload and not the disagreements.

**3. Edge identity counted against the predecessor — the skill.**
The refusal already explains itself: EDGE_IDENTITY_REUSED says 'changes label,
emphasis relative to its direct predecessor "Initial"', naming the fields.
references/variants.md's Edge identity section was already right. references/edit.md
step 2 was the one that said 'two or more' without saying two or more relative to
what, and it is the step an author is holding while editing. Reworded in place:
the count is against the variant this one came from — a current variant has one
too — over every edit since, not what you just read.

**4. Views, flows and beats mint their own ids — the product.**
The store already answers this well one layer down ('there is no view "Overview"
on this variant to replace. Leave the id out to add "Write path" as a new one'),
but a readable id like `write-path` never reaches it: the schema refuses first,
with a message about the block-id alphabet that invites the author to invent a
conforming id instead. A new `StatedIdSchema` (src/shared/semantic-board/lib/primitives.ts),
used by all seven stated ids in input.ts, now says the same thing the store says
and names every subject that mints its own. The persisted-document schema keeps
the shape-only message, where 'leave id out' would be wrong advice. SKILL.md's
References bullet lost its node-and-relationship reading in three words.

## What was cut to pay for what was added

- references/edit.md step 2 is shorter than it was (10 lines to 8; the file is 7
  words down). Cut: 're-adding those relationships without their ids reads as a
  deletion and an addition' (SKILL.md's References bullet says it), and the
  catalogue restatement 'a new part brings its kind, containment, binding and
  groups; a new runtime path brings its traffic' (the SKILL.md catalogue table
  is the source of truth for every row).
- references/variants.md: the Branching paragraph lost the two clauses SKILL.md's
  evidence step and propose-compare.md step 1 both already carry; 'Repair
  authoring errors first' and 'the current picture shows what it showed before'
  went from the comparison checks (both duplicated); the Claims section lost
  everything SKILL.md's Claims bullet already says, keeping only `--for`,
  re-claiming to extend and what a pane shows; the deleted-and-changed
  restatement lost its duplicate of 'answer part of it and the rest stays open'.

## Verified

Every claim was reproduced in a scratch vault through semantic-board-store, not
read off the code:
- A readable id on a view and on a beat: schema refusal for the first, and
  UNKNOWN_VIEW / UNKNOWN_BEAT with 'Leave the id out' for a block-shaped one.
- EDGE_IDENTITY_REUSED across two separate edits: one changed property applied,
  the second refused against the predecessor, naming both fields.
- A draft holding one `competing-field` and one `deleted-and-changed`: `theirs`
  on both is refused CHOICE_NOT_A_FIELD naming 'iilrNmQA.responsibility,
  SOYT2ksp' — the answerable one included; `mine` on the structural issue alone
  settles it and leaves the field issue open.
- renderBoard on a root variant answers `changes: null`; on a derived one it
  answers the predecessor and a standing per subject.
The two recipe payloads (edit.md, propose-compare.md) still parse against
VariantEditInputSchema after the stated-id change.

## Follow-up (not done here: another worker owns the file)

src/runtime/semantic-board-store/lib/settle.ts:418-426 builds both
CHOICE_NOT_A_FIELD refusals with `describe(input.choices)`, which names every
choice in the batch. It should be `describe(structural)` and `describe(ordering)`
— the issues that actually have no other side — so a mixed batch says which
choices it could not take instead of reading as though none could be answered.
One-line change, two call sites; the skill sentence added here stands in for it
until then.

## Checker diagnostics (scope added mid-task by the coordinator)

references/authoring.md now documents `BINDING_PATH_MISSING` in its Bindings
section — the node, the path, the repo and the checkout, and silence for a
repository this machine has not registered — and, after the drill-down
diagnostics list, the rule that those three and the binding one are checks on a
variant's content and so run only over the variants a write can still change.
Written as 'a write can still change' rather than 'not history', because a
fourth lifecycle is landing in a parallel task. `UNKNOWN_VOCABULARY` is named
as not being one of them: its subject is the vault configuration, so defining
the kind again clears it wherever it sits.

## Owners and checks run

The `comparedWith` field is machine-readable protocol, so it has owners;
nothing asserts refusal prose anywhere. Both live in
tests/system/semantic-boards/rasterize.test.ts, which already rasterizes a root
board and branches a proposal: the root case asserts `comparedWith: null` on
both the rasterize and the render receipt, and the proposal case asserts the
rasterize receipt names the current variant and that `semantic render` of the
same variant answers the same thing. They were first put in workflow.test.ts,
which turned out to sit exactly on the 500-line lint cap, so they moved rather
than pushing that file over.

Run: `bun test --isolate --max-concurrency=1` over
tests/system/semantic-boards/rasterize.test.ts (3 pass),
tests/system/semantic-boards/workflow.test.ts (16 pass),
tests/system/cli/command-contract-artifacts.test.ts (3 pass),
src/cli + src/runtime/semantic-board-store/tests (209 pass),
src/shared/semantic-board/tests + src/runtime/skill-evaluation/tests/failed-captures.test.ts
(144 pass). `bunx tsc --noEmit` clean over this work (the remaining errors are
the parallel `shelved` lifecycle task's, in files this task does not own).
Lint (type-aware policy over the changed sources, baseline over the changed
tests) and `oxfmt --check` clean. `bun run eval:skill check`: suite ok, 15
scenarios, 15 fixtures, 14 coverage parts.
`bun scripts/generate-skill-artifacts.ts` into a scratch directory produces
byte-identical create and edit input schemas, so the stated-id change moved the
refusal wording and not the contract.
<!-- SECTION:NOTES:END -->
