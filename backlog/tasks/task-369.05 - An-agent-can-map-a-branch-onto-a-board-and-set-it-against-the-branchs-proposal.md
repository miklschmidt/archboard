---
id: TASK-369.05
title: >-
  An agent can map a branch onto a board and set it against the branch's
  proposal
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:19'
updated_date: '2026-10-06 11:39'
labels:
  - history
  - cli
  - skill
dependencies:
  - TASK-369.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: medium
type: feature
ordinal: 653000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reviewer wants to know which parts a change touched, and whether the proposal for the task said it would touch them. This is the architecture review beside the standards and spec reviews of the code-review skill. A pull request recording also needs it to choose its steps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a base ref, the answer lists the parts whose bound files changed between the merge base and HEAD
- [ ] #2 Given a proposal, the answer splits the parts into named and changed, changed but not named, and named but not changed
- [ ] #3 The machine-readable answer has a schema, and the pull request recording recipe of the consumer skill uses it to choose the parts its steps are about
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared schema src/shared/footprint: the answer of GET /api/vault/footprint?board&base&variant (ADR 0045): board, version, base ref, the current variant and the proposal read, repositories (merge base, head, or why unread), commits (large marked), and either changed (no proposal) or the three lists namedAndChanged / changedNotNamed / namedNotChanged, each part with commits and the reasons it is named; skipped parts with reason, in none of the lists.
2. Runtime: src/runtime/history-lens gains readFootprint (merge base per checkout, one walk mapReading via partReading, walkCommits, commitsByBoundPath, isLargeCommit) and a pure namedParts over compareVariants.
3. Server: src/server/archboard/lib/footprint-route.ts mounts GET /api/vault/footprint as checkout work, mounted in application.ts; root entrypoint src/server/archboard/footprint.ts.
4. CLI: archboard semantic footprint <board> --base <ref> [--variant <proposal>] in src/cli/commands/semantic-footprint.ts, registered in run.ts; text lines on stderr; refusals for the unknown variant, nothing to compare, not a draft, no current variant.
5. Tests: history-lens footprint on a temp Git repository (criteria 1,2), route (checkout work, cancellation), CLI (routing, query, exit).
6. Consumer skill: pull request recording recipe reads the footprint to choose its parts; evals/coverage.json row and scenario; bun run eval:skill check; docs/design/cli-command-audit.json.
7. Dogfood: proposals Archboard server@TASK-369.05 and Command interface@TASK-369.05, adopted at close; run the real command on a recent task's range.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What was built

- `archboard semantic footprint <board> --base <ref> [--variant <proposal>]` (`src/cli/commands/semantic-footprint.ts`), registered in `run.ts`. It asks `GET /api/vault/footprint?board=&base=&variant=` and prints the answer as JSON (stdout) with a summary and one line per part on stderr. Information only: no severity, exit status unchanged.
- Answer schema: `src/shared/footprint/index.ts` (`FootprintAnswerSchema`, `FootprintReplySchema` = the answer with `success`, which the route sends and the command prints; the command contract publishes it as the command's result schema in the generated command-contract proof). Without a proposal: `changed`. With one: `namedAndChanged`, `changedNotNamed`, `namedNotChanged`. Every list entry is `{ subject, repo, path, commits, named }`; `named` holds why the proposal names the part (`by: part | relationship | step`, with the status and the two ends). `commits` are the walked commits that changed a part (`BehindCommitSchema`, large ones marked), `repositories` says per checkout `read` (base, mergeBase, head, commit count) or `unread` (`base-unresolved`, `no-merge-base`), `skipped` lists every part not read with the reason and the reasons it is named.
- `src/runtime/history-lens`: `readFootprint` (`lib/footprint.ts`), `namedParts` over `compareVariants` (`lib/named-parts.ts`), `answerCommit` (`lib/answer-commit.ts`, the commit as an answer carries it; behind and locality can share it). It reuses `partReading`, `walkCommits`, `commitsByBoundPath`, `isLargeCommit` (inside `answerCommit`) and `snapshotCheckoutAccess`. No second walk, no second comparison.
- `src/server/archboard/lib/footprint-route.ts` (+ root entrypoint `src/server/archboard/footprint.ts`): runs through `checkoutWork.trackRequest`, as the code check route does. Mounted in `application.ts`.
- Consumer skill: `references/sequences-views-walkthroughs.md`, the pull request's recording: new step 2 chooses the parts from `changed`, reads the subject of a `large` commit, takes `skipped` and `unread` parts from the diff. Evals: scenario S19 and fixture S19 (S16's board against the commits after the `2.3.3` tag: 6 commits for the five parts of app.py, 1 for the three parts of cli.py, none for ctx.py and sessions.py, the development server skipped; no large commit), two rows in `coverage.json` part 7 (the command with S19; `--variant` as a runtime owner). `bun run eval:skill check`: suite ok, 20 scenarios.
- `docs/design/cli-command-audit.json`: entry for `semantic footprint`.

## Decisions the ADR did not settle

1. The route, not the CLI, reads the board and resolves the variants, so the refusals have codes the contract maps to exit 2: `NO_CURRENT_VARIANT`, `UNKNOWN_VARIANT`, `NOTHING_TO_COMPARE` (the variant is the current one), `NOT_A_DRAFT` (shelved or historical: ADR 0045 says the lens never reads those). A board with no current variant is refused even with `--variant`, because only a current variant says what is built.
2. The range of a checkout is `<merge base>..HEAD`, merges left out (`walkCommits` does that). The ref is resolved with `rev-parse --verify --end-of-options <ref>^{commit}`, so a ref that begins with a dash is a ref, never an option (test). Nothing is fetched. A checkout is read at HEAD, so an uncommitted change is not in the footprint (stated in the command help and the audit). A checkout where the ref does not resolve, or shares no history with HEAD, is `unread` in `repositories`, and each of its parts is `skipped` with the reason (`base-unresolved` or `no-merge-base`) beside behind's five reasons. So a part never reads as unchanged because its checkout was not read.
3. With a proposal the parts read are the proposal's parts plus the parts only the current variant has (the removed ones). A part on both is read with the proposal's binding: it is what the task intends to build. Without a proposal, the current variant's parts.
4. A skipped part carries `named` too (empty without a proposal). It is in none of the three lists, but a reader sees that the proposal names a part the lens could not read.
5. A part is named once per reason, in the order the comparison found them: the part itself, its relationships, its steps. A relationship or step with status added, changed or removed names both ends; a part at both ends of a self-loop is named once. Flows, walkthroughs and beats name nothing (ADR 0023: a walkthrough edit badges no part).
6. The answer is not kept in memory. ADR 0045 keeps each answer keyed on what it derives from; that serves the pane inspector's repeated selections. A footprint is asked once per branch, walks only the commits between a merge base and HEAD (0.5 s for a task's range here), and a kept answer would need the whole key (HEADs of every checkout, both variants' versions) for no reader. A later task can put it behind `createAnswerMemory` if a pane asks.
7. `commits` lists only commits that changed a part it read, with the number of commits in the whole range per repository in `repositories[].commits`, so a reader sees how much of the range touched the board. The summary line says it as "N of M commits changed a part it read".
8. The recipe's footprint step is step 2 of the pull request's recording (the other steps move down by one). The recipe does not use `--variant`: the board of that recipe is disposable. The vault's own boards use `--variant` through archboard-dev (TASK-369.06).

Adoption: both proposals were built on the state before TASK-369.03 adopted, so adoption was refused as PARENT_SUPERSEDED. Restated as 'TASK-369.05 after TASK-369.03' on Archboard server and Command interface from the compare against the parent, shelved the first ones with that reason, adopted the new ones. Real command on the dogfood vault: 'semantic footprint "Renderer layout" --base 155bdef83 (the start of TASK-368.08)' reads 2 of 18 commits as changing 6 parts (Compound graph, Layout engines, Block engine, Renderer core, Entry row: 2 commits each; Card blocks 1), 5 skipped. 'semantic footprint "Archboard server" --base c894b9e6c' (this task and TASK-369.03 on main): 2 of 5 commits, 5 parts changed (HTTP application, Archboard server, History lens 2 each; Locality route and Footprint route 1 each), 5 skipped; --variant on the adopted proposal is refused NOTHING_TO_COMPARE, exit 2. Gate: lint:tests, lint:policy, fmt:check, type-check, test:modules (4036), test:system (192), test:repository (20) pass; eval:skill check ok (20 scenarios).
<!-- SECTION:NOTES:END -->
