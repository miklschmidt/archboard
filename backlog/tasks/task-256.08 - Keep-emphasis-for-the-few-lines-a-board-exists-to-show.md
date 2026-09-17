---
id: TASK-256.08
title: Keep emphasis for the few lines a board exists to show
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:40'
updated_date: '2026-09-17 19:45'
labels: []
dependencies: []
references:
  - skills/archboard/references/authoring.md
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 458000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Emphasis is meant to single out the few lines a board exists to show, and the batch has both failures at once — with the commoner one in the arm that is meant to be better.

Over-marking, three runs, all flagged by the grader: baseline S00 r1 at 10 hero of 12 relationships, baseline S05 r1 at 8 of 10, candidate S00 r1 at 10 hero plus 1 muted of 15. Under-marking, eight runs, every relationship left normal on a board with a spine worth marking: baseline S01 r1, S01 r2 and S05 r2, and candidate S05 r1, r2 and r3 — all three — plus S08 r3 and S14 r3. On S05 the candidate arm marked nothing at all while the baseline marked 8, 0 and 2. Across the whole batch, 48 of 66 board variants have no hero relationship, and muted appears on 6 boards. So a ceiling-only rule would make the commoner failure worse.

The guidance is identical in both arms and never says how much. SKILL.md's catalogue row says "the few lines the board exists to show" and authoring.md's field table says "hero for the few central lines, muted for context. Line weight only." Neither gives a proportion, says what a reader loses when most of a board is marked, or shows emphasis on an architecture board at all — the only worked example is one hero edge of three in the sequence recipe. Contrast traffic, two rows below in the same table, which gets a paragraph in authoring.md including "Stamping it on every relationship says nothing." The grader's own behaviour gives a usable line: it complained at 10/12, 8/10 and 10/15 and passed 6/13, 5/15, 7/14, 4/13 and 4/10 without comment.

The vocabulary an implementer needs: emphasis is a per-relationship enum of normal, hero and muted (vocabulary.ts:35), stored on the edge (content.ts:153). It does NOT exist on nodes, and it does not exist on flow steps — FlowStepInputSchema (input.ts:119-131) is strict and permits only id, as, from, to, label, kind, note, repeat. One baseline S07 run put emphasis on four steps and was refused with `Unrecognized key: "emphasis"`, which names the key and not the path, so the author stripped emphasis from the whole payload and lost it on the relationships where it was legal. Where each field lives — repeat and note on the step, traffic and emphasis on the relationship — is the sentence this and TASK-256.06 both want.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill says how much of a board may be emphasised and what a reader loses when more is
- [x] #2 The skill says that a board with a spine marks it, so the fix does not turn over-markers into non-markers
- [x] #3 The skill gives muted a positive instruction, not only a mention
- [x] #4 The skill says which fields live on a step and which on a relationship, so emphasis is not authored where it is refused
- [x] #5 The skill text stays about archboard's own source and passes the eval:skill check leak guard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the batch's emphasis evidence in the task description and the current wording in SKILL.md's catalogue row and authoring.md's relationship table.
2. SKILL.md: rewrite the `emphasis` catalogue row so it asks for the spine first, gives the proportion, and says what over-marking costs.
3. authoring.md: give emphasis its own paragraph beside traffic's — the spine, the proportion (about a third, never past half), what a reader loses when most lines are hero, and a positive instruction for muted.
4. authoring.md: say which fields live on a step and which on a relationship, and what to do with the refusal that names the key and not the path.
5. Keep every example archboard's own; run bun run eval:skill check for the leak guard.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
skills/archboard/SKILL.md: the `emphasis` catalogue row now asks for the spine, gives the proportion (a third of the relationships, never past half) and says that a board with a spine and no hero leaves the reader to find it. A new paragraph under the catalogue says which subject each row lands on: `note` and `repeat` on a flow step, `emphasis` and `traffic` on a relationship, `from`/`to`/`kind`/`label` on both.

skills/archboard/references/authoring.md: emphasis gets its own three paragraphs beside traffic's — the spine (worked from archboard's own write path: the CLI's call into the canvas, the canvas's write through the board store, the store's atomic write, against the lease, the version check and the broadcast as context), the ceiling with what over-marking costs a reader, the under-marking case with a one-sentence test for whether a board has a spine at all, and muted as a positive instruction (startup registration, a configuration read, a dependency that explains a part, a teardown path). A new 'A step is not a relationship' subsection lists the step's fields and what to do with the refusal; the field table's `emphasis` row and the 'unknown field' refusal row follow.

Correction to the task description: the refusal is not path-free. z.prettifyError renders it over two lines — `✖ Unrecognized key: "emphasis"` then `→ at flows[0].steps[0]` — verified by parsing a step with emphasis through VariantEditInputSchema. The skill therefore tells the author to read the location line and take the key off those steps, rather than claiming the refusal does not say where.

Verification: bun run eval:skill check ok (15 scenarios, 15 fixtures, 14 coverage parts, leak guard included); bun test src/runtime/skill-distribution/tests 8 pass; oxfmt --check clean. Every example is archboard's own source.

Carried in by the coordinator from TASK-256.07 (outside this task's own acceptance criteria): `archboard semantic compare <board> [--variant <id|name>]` is now named in SKILL.md's Reads bullet and in the 'When to read more' row for read.md, and skills/archboard/references/read.md gains it as step 3 (the old step 3 is now 4). Wording taken from src/cli/commands/semantic-compare.ts and kept in step with references/propose-compare.md: every part, relationship, sequence, step, walkthrough and beat either state has, as added/removed/changed/unchanged, the fields that moved, the endpoints a relationship or step now lands on, a root architecture refused, and a moved end reported as one relationship that moved rather than a removal beside an addition.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Emphasis now has a proportion (about a third, never past half), the spine it is for, and the under-marking failure that was commoner than over-marking in the batch — 48 of 66 board variants marked nothing. muted gained a positive instruction, and a new section says which subject each catalogue row lands on, so emphasis is not authored onto a step where the schema refuses it. Verified in the wave-2 gate, run lane by lane because the box was too short on memory for bun run check in one process: lint, fmt:check and type-check clean, the frontend build, 3450 module tests, 163 system tests, the repository lane, and the full serial browser lane at exit 0 with no failures. The derived skills were synced with bun scripts/sync-skills.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
