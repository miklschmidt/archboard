---
id: TASK-331
title: >-
  Adopting a proposal whose parent another adoption superseded warns and needs
  --force
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 13:37'
updated_date: '2026-09-24 14:04'
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
- [x] #1 semantic adopt of a proposal whose parent is no longer the current variant, because another variant was adopted after it was branched, is refused with a warning that names the superseded parent, the variant that replaced it, and the two ways on (branch again from the current variant, or --force)
- [x] #2 --force adopts it anyway, and the adoption record says it was forced
- [x] #3 A proposal branched from the current variant adopts exactly as before
- [x] #4 The consumer skill's variants reference and the archboard-dev closing steps describe the refusal and --force
- [x] #5 One test owner proves the refusal and the forced adoption
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store (src/runtime/semantic-board-store/lib/adopt.ts): after the existing lifecycle/settlement checks, walk the draft chain the proposal stands on (parent, through drafts, stopping at current or a shelved/root variant). A historical variant on that chain means a later adoption superseded the architecture the proposal was built on: refuse PARENT_SUPERSEDED naming the superseded variant, the variant adopted over it (the adoption whose from is that variant), the current variant, and the two ways on (branch again from the current variant and restate the change, or --force). With force the adoption lands and its record carries forced: true. A proposal whose chain reaches the current variant, and a first adoption on a board nobody built (no historical variant), are untouched.
2. Schema (src/shared/semantic-board): BoardAdoptInputSchema gains force?: boolean; AdoptionSchema gains forced?: true (additive, no contract version move, per ADR 0036's precedent). New refusal code in outcome.ts.
3. CLI contract (src/cli/commands/semantic-lifecycle.ts): --force option (value none) and a declared PARENT_SUPERSEDED refusal (exit 1, as the other variant refusals); description says what --force does. Client passes the adopt body through unchanged; the server route parses BoardAdoptInputSchema, so both carry force with no code of their own.
4. Decision record: ADR 0037 (adopting over a superseded base needs force), CONTEXT.md Adoption entry; VARIANT_HISTORICAL's advice (branch from it and adopt that) mentions that the adoption then needs --force.
5. Test owner: tests/system/semantic-boards/lifecycle.test.ts, one CLI test: two siblings off the current variant, adopt one, the other is refused with the declared exit and the board unchanged, --force adopts it and the record says forced. Existing store tests keep proving a proposal from the current variant and a first adoption adopt as before.
6. Skills: consumer skill variants.md Adoption; archboard-dev closing step 3 relies on the refusal; evals/coverage.json rows (runtime owner) for the refusal and adoptions[].forced; bun run generate:skill-artifacts.
7. Dogfood: affected board Board persistence (Adopt node's responsibility and description); proposal Board persistence@TASK-331. Command interface's Semantic lifecycle node (resolve, adopt, shelve) is unaffected at its level of detail.
8. Gate lanes one at a time; commit.

Revision: the test owner is tests/system/semantic-boards/variant-targeting.test.ts (lifecycle.test.ts is at the 500-line lint limit).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions:
- The rule walks what the proposal stands on (its parent, then through drafts), because a draft follows its predecessor and carries it; a historical variant on that line is one a later adoption superseded. The walk ends well at the current variant, and at a shelved or root variant (no adoption superseded those). So a first adoption on a board nobody built never fires (no historical variant exists), and a draft whose line reaches the current variant adopts as before.
- The case of two sibling drafts off a planned board's root draft, one adopted first, is left alone: the root draft never became historical, so nothing names a superseded architecture; no workflow reaches it today.
- Refusal code PARENT_SUPERSEDED, declared in the adopt contract with exit 1 like the other variant refusals (VARIANT_HISTORICAL, VARIANT_UNSETTLED exit 1); exit 5 is kept for held/revoked/moved-version writes a script retries.
- AdoptionSchema.forced is z.literal(true).optional(), written only when force actually overrode the refusal, so a --force on an ordinary adoption records nothing it did not do. Additive field; the contract version does not move (ADR 0036 precedent). Readers of adoptions: the CLI adopted line and skill-evaluation counts, neither affected.
- VARIANT_HISTORICAL's advice (branch from it and adopt that) now says that adoption needs --force, since it leaves out what was adopted since.
- ADR 0037 records the decision; it amends ADR 0023's 'any coherent draft, including a competing branch, may be adopted'.
- Test owner: tests/system/semantic-boards/lifecycle.test.ts 'a proposal built on an architecture a later adoption superseded is adopted only when forced' (CLI to server to store, since --force has to cross both boundaries). Verified it fails with the refusal disabled.
- Manual run on a vault copy (worktree server on 3331): the refusal prints the superseded variant, the variant adopted over it and the current one, exit 1.

The test owner moved to tests/system/semantic-boards/variant-targeting.test.ts ('a proposal built on an architecture a later adoption superseded is adopted only when forced'): lifecycle.test.ts would have passed the 500-line lint limit, and variant-targeting already owns what adopting means on a board nobody built.

Validation (worktree task-331): type-check 0; lint 0 (after splitting adopt.ts for the complexity limit); fmt:check 0; test:modules 3390 pass / 3 fail; test:system 181 pass / 0 fail; test:repository 8 pass / 0 fail; test:serial-browser 18 pass / 0 fail (a first run failed once in semantic-board-inspection.test.ts on a refit timeout; the rerun passed). The 3 module failures are 5 s timeouts in src/runtime/semantic-renderer/tests/wide-boards.test.ts (Archboard server, Browser application, Voice coordinator boards). They fail the same way on a clean export of HEAD 02832131, so they come before this change (the renderer follow-ups of TASK-328). Dogfood: Board persistence@TASK-331 branched and drawn (main 79c26d48), checked against adopt.ts as built, adopted at version 12 (main 4252c09f); dogfood check reports no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic adopt refuses PARENT_SUPERSEDED when the proposal stands (through drafts) on a historical variant, that is, one a later adoption superseded. The refusal names that variant, the variant adopted over it and the current one, and gives the two ways on: branch again from the current variant and restate the change, or --force. --force adopts it anyway and the adoption record carries forced: true. A proposal whose line reaches the current variant, and a first adoption on a board nobody built, adopt as before. The change goes through the adopt contract (--force option, declared refusal, derived help), the input and record schemas, and the store; the client and server route pass the parsed input through. ADR 0037 records the decision and amends ADR 0023. CONTEXT.md, the consumer skill's variants reference, archboard-dev's closing steps (they now rely on the refusal) and evals/coverage.json are updated. Proven by tests/system/semantic-boards/variant-targeting.test.ts 'a proposal built on an architecture a later adoption superseded is adopted only when forced', which fails with the refusal disabled.
<!-- SECTION:FINAL_SUMMARY:END -->
