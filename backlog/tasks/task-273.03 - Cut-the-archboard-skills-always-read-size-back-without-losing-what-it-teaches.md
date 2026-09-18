---
id: TASK-273.03
title: Cut the archboard skill's always-read size back without losing what it teaches
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-18 17:49'
updated_date: '2026-09-18 18:03'
labels: []
dependencies: []
parent_task_id: TASK-273
priority: high
ordinal: 483000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Between the frozen baseline and the candidate, skills/archboard/SKILL.md grew from 18.6 KB to 32.4 KB (+74%). In batch 2026-09-18T14-01-43-895Z median author tokens rose 21% (S06 +87%, S10 +58%, S04 +53%, S09 +53%) with output flat: the growth is cached input, the skill carried through every turn. About 6 KB of the file is table-alignment padding forced by the catalogue's long 'flow' row. SKILL.md is read by every run; references are read per workflow, so bytes moved from SKILL.md into the recipe that needs them are paid only by that workflow. Constraint (memory skill-examples-never-from-evals): nothing may be added, removed or reworded to suit one scenario; shared guidance stays portable CS terms, archboard names only inside a recipe's worked example.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SKILL.md is materially smaller than 32.4 KB; the target and the measured result are recorded in the task
- [ ] #2 Every rule SKILL.md taught before is still taught, in SKILL.md or in the recipe of the workflow that needs it; a reviewer diff-checks this rule by rule
- [ ] #3 Every skill citation (<file>#<heading>) in evals/evals.json and rubric.md still resolves, updated where a heading moved
- [ ] #4 Derived skill copies are resynced and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Padding: turn the catalogue, Which recipe and When to read more tables into lists so no cell sets a column width; check bun run fmt output. Commit.
2. Dedup inside SKILL.md: runbook steps that restate an essential or an evidence rule shrink to the move and a link; Keep it true keeps only what is not stated elsewhere (its heading and the rules evals cite stay); the flow row's condition lives once in Which recipe. Commit.
3. Moves: sequence-only detail (columns choice, self calls, fixed counts) lives in references/create-sequence.md, which already holds most of it; SKILL.md keeps the step and a link. Commit.
4. Keep every heading slug so evals citations resolve; run the citation check (eval:skill check and citations test).
5. Resync skills (bun scripts/sync-skills.ts), gate lane by lane.
Size target: SKILL.md at or under 22 KB (from 32,419 bytes); rule ledger in the notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Size: SKILL.md 32,419 bytes (~8.1k tokens) -> 21,419 bytes (~5.4k tokens), target <= 22 KB met. Lever 1 padding -8,303 (7c7a282a); lever 2 dedup -1,342 (cc3cfad4); lever 3 moves -1,355 (38c3733e). Headings unchanged, so every evals.json/rubric.md citation still resolves (bun run eval:skill check: suite ok).

Rule ledger (SKILL.md before -> where it lives now):
Lever 1 (7c7a282a), restructure only, no wording lost:
- Catalogue table (14 rows, When the source shows / You author): the Row table stays (lib/citations.ts catalogueRowsOf requires a table whose first column is Row, one backticked key per row) as a short index 'Row | Lands on'; each row's full condition and payload text moved verbatim into the list under it ('_Shows:_ ... _Author:_ ...').
- Which recipe table -> list, same five recipes and conditions. When to read more table -> list, same four references and topics.
Lever 2 (cc3cfad4), duplicates merged:
- Runbook 2 'a board this walk creates is claimed at step 13' -> Essentials Claims ('a board you are creating is claimed after the write that makes it') and runbook 13.
- Runbook 3 'a part whose internals already have a board links with drillDown instead of being drawn again' -> catalogue drillDown row + Keep it true (runbook 3 links the row).
- Verification 'archboard check is for after a vocabulary edit or when an answer carries warnings' -> runbook 16 and Vocabulary essential.
- Evidence rule 3: container rule said twice in the rule -> said once in the same rule (endpoint only when the source addresses the whole module; a part drawn with children is a container whatever its kind; giving a part children moves its relationships to the child whose body runs).
- Keep it true 'Author meaning, report the renderer defect' -> intro paragraph.
- Keep it true 'every relationship and step has a line of source evidence; a picture needing a relationship the source lacks is wrong' -> evidence rule 3 + catalogue 'A row the source does not support stays out'.
- Keep it true 'use the configured vocabulary and levels; extend config.yaml only for a vocabulary request' -> Vocabulary essential.
- Keep it true 'a binding only to the file that implements it' -> evidence rule 2 (Keep it true keeps 'Fewer, truer parts').
- Keep it true traffic bullet (authored intent, never a measurement; chosen from what runs per request; a still picture proves nothing about motion) -> catalogue traffic row.
- Keep it true refusal bullet: 'never edit the vault / never invent an id' -> Essentials CLI bullet (now says so); 'when the CLI cannot do it, say what remains open' -> Essentials CLI bullet (already said).
- Keep it true drillDown bullet stays in Keep it true (reuse, a part drawn anyway, button rule); catalogue drillDown row drops its 'never a node added only to carry the link' and links Keep it true.
- Catalogue binding row 'nothing for a part you could not inspect' -> evidence rule 2 (row links it).
- Catalogue flow row 'a board asked to describe how something travels is parts, containment and calls' -> Which recipe paragraph ('A new board is the architecture recipe first'); row keeps 'owes no flow merely because what it draws runs in order' and links Which recipe.
- 'The rows land on different subjects' paragraph: which subject each row lands on -> the Row table's Lands on column; the step key refusal and its repair stay in the paragraph.
Lever 3 (38c3733e), moved to the recipe of the workflow that needs it:
- Runbook 7 (participants a subset of nodes; named parts are columns; a part drawn whole is one column; other parts candidates, not owed; the choice settles message kinds) -> references/create-sequence.md step 1 (already stated there); runbook 7 keeps the step and links it.
- Runbook 9 (self call is one step with that participant at both ends; recursive function, own method, own state, handler re-entering itself; fixed count is repeat on a self step or a call alike; a note stating the count leaves the repeat out) -> create-sequence.md step 1; added there: 'a handler re-entering itself' and 'A note stating a fixed count in prose leaves the repeat out'. Runbook 9 keeps the second pass in one line.
- Evidence rule 3 sequence tail (order, returns, branch in a note, fixed-list loop is repeat, unknown-length loop is note) -> create-sequence.md step 1 and catalogue repeat/note rows; rule 3 keeps one sentence linking the recipe.
- Evidence rule 4 variant targeting (--variant vs payload variant, command line wins, warns naming both) -> references/edit.md step 3, propose-compare.md step 1, variants.md; rule 4 keeps 'a write naming none edits the current architecture'.
- Reads essential, what compare reports (added/removed/changed/unchanged, fields moved, where a relationship or step lands, root refused) -> references/read.md step 3; Reads keeps the command and links it.

Gate: fmt:check, test:modules (3334 pass), test:system (168 pass), test:repository (8 pass) green. lint and type-check fail only in the other workers' in-flight src/runtime/skill-evaluation files (reaudit.ts, reaudit.test.ts, run-manifest.test.ts), none touched here. Derived copies resynced (bun scripts/sync-skills.ts; diff -r clean).

Review round 1 (commit below): create-sequence.md now says a note stating the count does not replace the repeat (the step carries the repeat, a note beside it if needed); Keep it true regains 'use the configured vocabulary and levels; extend config.yaml only when the request is about vocabulary' (links Vocabulary essential, which also states it); evidence rule 3 regains 'a call into it lands on the child whose body runs, not on the container' and '(a branch or a loop of unknown length in a note, a count the source fixes in repeat)'; evidence rule 4 regains 'so a proposal-only request lands nothing there' and links propose-compare.md as well as edit.md; runbook 3 links the drillDown row; Lands-on column says 'a relationship (edge)'. evals.json and rubric.md untouched. Size now 21,873 bytes (~5.5k tokens), still under the 22 KB target. eval:skill check ok; fmt:check, test:modules (3334), test:repository (8) pass; derived copies resynced.
<!-- SECTION:NOTES:END -->
