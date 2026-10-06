---
id: TASK-369.04
title: >-
  An agent can list the parts that change together with no relationship between
  them
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:19'
updated_date: '2026-10-06 12:51'
labels:
  - history
  - cli
dependencies:
  - TASK-369.03
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: medium
type: feature
ordinal: 652000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two parts that change in the same commits depend on each other, whether or not the code shows it (Tornhill). When no relationship joins them on the board, that is a hidden dependency or one decision carried by two modules (Ousterhout's information leakage). The measurement in the design note shows both the signal and its trap.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For a board, the answer lists part pairs that meet the ADR's thresholds, with their shared commits and degree, and marks the pairs that no relationship joins
- [x] #2 On Semantic renderer, the answer reproduces the painters measurement in the design note, or explains the difference by commits since
- [x] #3 On Command interface, Claims and Panes are not reported, because their shared commits are sweeps
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected boards: Archboard server (History lens and Locality route answer change coupling too) and Command interface (the Locality command answers it). Proposals Archboard server@TASK-369.04 and Command interface@TASK-369.04 change those parts' responsibilities; no new part, since coupling is a file inside the History lens directory.
2. Shared answer, src/shared/locality: a sibling list coupling[] beside hotspots: { subjects: [a, b] in variant order, repo, commits (shared ids, newest first), shared, degree (integer percent, truncated as code-maat prints it), unjoined }. It names parts by subject and commits by the ids in commits, and shares periods, leftOut and skipped. commits holds every commit a hotspot lists, which covers every shared commit.
3. Runtime: src/runtime/history-lens/lib/coupling.ts, a pure function over the parts the lens read with their counted commits (the same split as hotspots, from the one walk) and the variant's content: pairs in one repository, bound paths that do not overlap, at least 5 shared commits, degree (shared / mean of the two counts) at least 30%, fixed. unjoined when no relationship (and no flow step, see notes) joins them in either direction, a part inside an end counting at that end, and neither part holds the other. readLocality calls it with the split it already makes.
4. CLI human summary: coupled pairs with shared commits and degree, unjoined marked.
5. Tests: src/runtime/history-lens/tests/coupling.test.ts on a temporary Git repository (thresholds at their edges, large commits left out, overlapping paths, joined by a relationship, by a container end, containment, unjoined); CLI summary test if one exists.
6. Real command on Semantic renderer (painters) and Command interface (Claims and Panes).
7. read.md step 5 says how to read coupled pairs; S18/coverage if the graded answer changes; cli-command-audit.json entry; bun run eval:skill check.
8. Gate lanes one at a time.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What was built

- `src/shared/locality/index.ts`: `CoupledPairSchema` and a `coupling` list beside `hotspots` in `LocalityAnswerSchema`: `{ subjects: [a, b], repo, commits, shared, degree, unjoined }`. Parts are named by subject and commits by the ids of the answer's `commits`; `periods`, `leftOut` and `skipped` are shared with hotspots.
- `src/runtime/history-lens/lib/coupling.ts` (`couplePairs`): a pure function over the split that `readLocality` already makes for hotspots (each part read, with its counted commits), so the walk is not repeated and large commits are already out. `locality.ts` calls it and puts the list in the answer.
- `src/cli/commands/semantic-locality.ts`: the stderr summary gives one `coupling:` line per pair (degree, shared commits, both names, and whether nothing on the board joins them), or one line saying there is none; lines about the whole answer now start `locality:`. The contract's summary, description and relationship say change coupling too.
- `skills/archboard/references/read.md` step 5: how to read `coupling` and an unjoined pair, in portable terms. `evals/evals.json` S18 asks also which parts change together and grades `locality.coupling` (on Flask 3.0.0 no pair passes, and the five parts that bind app.py must not be reported as coupled); `evals/coverage.json` row and `evals/fixtures/S18.json` comment follow. `docs/design/cli-command-audit.json` entry updated.
- Dogfood: proposals Archboard server@TASK-369.04 (History lens, Locality route) and Command interface@TASK-369.04 (Locality) restate the three parts' responsibilities; no part or relationship changes.

## Decisions the ADR did not settle

1. Degree is an integer percent, truncated as code-maat prints it (`(int coupling)`), while the 30% test uses the exact ratio (`shared * 200 >= 30 * (a + b)`), as code-maat's `within-threshold?` does. So a pair at 30.3% reads `degree: 30`.
2. Each part's commit count for the degree is its hotspot count: commits of 30 files or fewer in the period. code-maat also counts module revisions after the changeset-size filter (`module-by-revs` runs on the filtered change sets).
3. Order: degree, then shared commits, highest first, then the variant's order (code-maat sorts by degree, then mean revisions). `subjects` lists the two parts in the variant's order.
4. A flow step joins its two ends as a relationship does. ADR 0045 names only relationships; a sequence board draws its dependencies as steps, and without this every coupled pair of such a board would be marked unjoined. The footprint already treats a step's ends like a relationship's.
5. A container counts as at an end inside it, besides the ADR's rule that a part inside an end counts as at that end. A relationship between a part inside a container and a part outside it crosses the container's edge, and ADR 0044 counts it among the container's callers or outgoing relationships. Measured: on Command interface, Commands and Server client change together in 34 commits (35%); Claims, Panes and other commands inside Commands have relationships to Server client, so without this the pair read as unjoined although the board draws the dependency.
6. All coupled pairs are listed, joined or not, with `unjoined` marking the ones that ask the question. A pair where one part holds the other is joined (ADR: "neither part is inside the other").
7. The answer gives no count of pairs left out for overlapping paths: both parts are still in `hotspots`, so nothing is hidden about a part.

## Real answers (2026-10-06, HEAD 78eb66dc5, default period 2025-10-06 to 2026-10-06)

- Semantic renderer: Architecture painter (lib/svg/architecture.ts, 29 commits) and Sequence painter (lib/svg/dataflow.ts, 21), both inside Renderer core, share 11 commits, degree 44%, unjoined. The design note's 6 commits and 36% (20 and 13 commits) at 048312ee did not follow renames: both files moved from src/runtime/semantic-renderer in 853a8a462 on 2026-09-17. The lens follows renames (ADR 0045), so at 048312ee it reads 24 and 15 commits, 7 shared (3c5713293, 2026-09-12, before the move), 35%. Since then 4 more shared commits (dd0e007d4, 925c97330, 57f614d8d, cc52a5cdb, all renderer pulse and far-view work) make 11 and 44%. Other pairs: View dispatcher and Board answer 59% (joined), SVG document and Sequence painter 36% (unjoined), Data-flow layout and Sequence painter 36% (joined), Architecture painter and SVG document 30% (joined). Renderer core binds the whole directory and overlaps every painter, so it pairs with none. 19 large commits left out.
- Command interface: Claims (claim.ts, 7) and Panes (pane.ts, 11) are not reported. They share 12 commits, 10 of them large (50 to 864 files), as the note says, and 2 small ones: degree 22%, under both thresholds. Reported pairs: Command catalogue and Server client 44%, 26 commits, unjoined; Server client and Commands 35%, 34 commits, joined through the commands inside Commands. 36 large commits left out.

Dogfood: the proposals Archboard server@TASK-369.04 and Command interface@TASK-369.04 already state what was built (three responsibilities, nothing else in semantic compare); they are left as drafts for the closing step to adopt. ./bin/dogfood check reports no diagnostics. Gate (2026-10-06): lint 0, fmt:check 0, type-check 0, test:modules 4046 pass, test:system 192 pass, test:repository 20 pass; bun run eval:skill check: 20 scenarios, 20 fixtures, 14 coverage parts. Commits: 28f849d71 (proposals), ae06ac9f3 (feature), 4a6095740 (skill, evals, audit).

test:serial-browser exit 0 (after build:frontend).

## Independent review (2026-10-06)

couplePairs matches code-maat (logical_coupling.clj, coupling_algos.clj) and ADR 0045: at least 5 shared counted commits, degree as shared over the mean of the two counts, the 30% test on the exact ratio, the degree cut as code-maat's (int coupling), large commits out before counting (module-by-revs also counts after the size filter), one repository per pair, overlapping bound paths left out, and the split of the one walk. Re-run on the dogfood vault: Semantic renderer reads Architecture painter 29, Sequence painter 21, 11 shared, 44%, unjoined; an independent git log --follow gives the same, and at 048312ee it gives 24, 15, 7 shared, 35% (20, 13, 6 shared, 36% without following the move in 853a8a462). Command interface leaves Claims and Panes out: 12 shared, 10 of them large (50 to 864 files), 2 counted, 22%. Flask 3.0.0 (S18) has no pair: src/flask/app.py shares at most 3 counted commits with another bound file.

Decisions 4 and 5 kept and recorded as an amendment of ADR 0045 (7f6bca3da). On the dogfood vault on 2026-10-06, decision 4 changes no pair (every call is also a relationship, as the consumer skill asks), and decision 5 changes one: Commands and Server client.

Fixes: 6dedeead0 (the coupling test pinned neither the cut degree nor the exact 30% edge; the CLI test's degree 41 let the hotspot assertion pass on the coupling line), 7f6bca3da (ADR amendment, schema description of unjoined), d01828714 (read.md step 6 names coupled pairs; the coverage row says S18 grades only an empty list and nothing grades the unjoined reading; audit result), 55ada04eb (Locality on Command interface said it lists only unjoined pairs; both proposals carry their board's scope as summary; adopted, Archboard server version 54, Command interface version 39).

Footprint against base 2711b8a8c: History lens and Locality are named and changed. Locality route is named and not changed: the route passes the lens's answer through, so its file did not change, but the answer it serves now holds change coupling, and its responsibility says so. Commands changed through ae06ac9f3 (semantic-locality.ts, named as Locality) and 6dedeead0 (a test under src/cli/commands/tests), nothing else inside it. Archboard server, Code check route, Code check and Vault check changed only through TASK-367.05 and TASK-367.24 commits. Behind after adoption: Skill evaluation's Evaluation inputs are behind by 4a6095740 and d01828714 (S18's prompt and feature, the coverage row); the board's parts still say what they do, so it stays right. ./bin/dogfood check reports no diagnostics.

Review gate (2026-10-06, after 55ada04eb): lint 0, fmt:check 0, type-check 0 (both failed once on other agents' work in progress in src/runtime/code-check and web-tree-sitter types, and passed on the next run), test:modules 4068 pass, test:system 192 pass, test:repository 20 pass, build:frontend 0, test:serial-browser exit 0 (24 pass); bun run eval:skill check: 20 scenarios, 20 fixtures, 14 coverage parts; skill-evaluation and install-targets tests 242 pass.

Independent review (2026-10-06): the coupling test could not tell a cut degree from a rounded one or > from >=; three new pairs now tell them apart (6dedeead0). Decisions 4 (a flow step joins its ends) and 5 (a container counts as at an end inside it) are kept and recorded as an amendment to ADR 0045 (7f6bca3da). The coverage row no longer claims S18 grades the unjoined reading (d01828714). Both proposals were adopted (55ada04eb).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard semantic locality now lists change coupling beside the hotspots: part pairs in one repository that share at least 5 counted commits at a degree of at least 30% (shared over the mean, cut to whole percent), with their shared commits, and marks the pairs that no relationship, flow step or containment joins. Large commits and pairs with overlapping paths are left out. Verified by coupling.test.ts at the threshold edges and semantic-locality.test.ts (pass with --isolate), and by real runs: Architecture painter and Sequence painter share 11 commits at 44% unjoined on Semantic renderer (the note's 6 and 36% did not follow a rename), and Claims and Panes are not reported on Command interface because 10 of their 12 shared commits are large.
<!-- SECTION:FINAL_SUMMARY:END -->
