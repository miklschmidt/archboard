---
id: TASK-369.04
title: >-
  An agent can list the parts that change together with no relationship between
  them
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:19'
updated_date: '2026-10-06 12:19'
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
- [ ] #1 For a board, the answer lists part pairs that meet the ADR's thresholds, with their shared commits and degree, and marks the pairs that no relationship joins
- [ ] #2 On Semantic renderer, the answer reproduces the painters measurement in the design note, or explains the difference by commits since
- [ ] #3 On Command interface, Claims and Panes are not reported, because their shared commits are sweeps
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
<!-- SECTION:NOTES:END -->
