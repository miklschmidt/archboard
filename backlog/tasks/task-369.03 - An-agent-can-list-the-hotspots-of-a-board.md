---
id: TASK-369.03
title: An agent can list the hotspots of a board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:19'
updated_date: '2026-10-06 11:40'
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
ordinal: 651000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A hotspot is a part that changes often. The improve-codebase-architecture skill starts by walking `git log` for hot spots, and a board can give the answer per part instead of per file.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For a board, the answer ranks its parts by the number of commits that changed their bound files in a window, with a default and an option
- [ ] #2 Commits over the size filter are left out, and the answer says how many
- [ ] #3 The read recipe of the consumer skill says when to use it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Affected boards: Archboard server (a Locality route; the History lens answers hotspots too) and Command interface (a Locality command). Proposals Archboard server@TASK-369.03 and Command interface@TASK-369.03 are drawn.
2. Shared answer, src/shared/locality: LocalityAnswer = { board, version, variant, periods (per repository: head, since, until), commits (every commit any hotspot lists, newest first), hotspots (every read part ranked by commits in the period, each with count and its commit ids newest first), leftOut { largeCommits }, skipped (parts not read, with reason, as behind) }. TASK-369.04 adds a sibling list of coupled pairs and uses leftOut and commits as they are. The commit and part schemas derive from the code-check ones.
3. Runtime src/runtime/history-lens: readLocality walks each repository once (git log --no-merges --since to HEAD), follows renames through every commit with commitsByBoundPath, then drops large commits and counts them; an answer memory keyed on options, board version and checkout HEADs, which also lets a request that arrives during a walk wait for it and starts no second walk, and cancels the walk only when every waiter has gone.
4. Server: GET /api/semantic-boards/locality?board=&variant=&since= as checkout work (locality-route.ts), mounted in application.ts.
5. CLI: archboard semantic locality <board> [--variant <name>] [--since <date>] (semantic-locality.ts), JSON result with a ranked summary on stderr.
6. Default period: one year before the commit time of each checkout's HEAD, a duration in src/shared/timing/timing.ts.
7. Skill: read.md recipe step says when to use it; evals/coverage.json row and an S18 scenario with its fixture; bun run eval:skill check; cli-command-audit.json entry.
8. Tests: history-lens on a temporary Git repository built in the test (ranking, default and --since period, large commits left out and counted, renames, skipped parts, memory and the shared walk), the route, the CLI contract. Run the real command on the dogfood vault.
9. Close: correct both proposals to what was built, adopt, ./bin/dogfood check and check --code.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What was built

- `src/shared/locality/index.ts`: `LocalityAnswerSchema` = `{ board, version, variant, periods, commits, hotspots, leftOut, skipped }` (strict); `LocalityReplySchema` adds the route's `success: true`; `PeriodStartSchema` (a date, or a date and time with its offset). `commits` derives from `BehindCommitSchema` without `large`, `hotspots` from `BehindPartSchema` plus `count`, `skipped` is `BehindSkipSchema`, `variant` is `RenderedVariantSchema`.
- `src/runtime/history-lens/lib/locality.ts` (`createLocalityReading`, exported from the index): the walk of each repository is `git log --no-merges --since=@<start> <HEAD commit>` through `walkCommits`; renames are followed through every commit (large ones included) by `commitsByBoundPath`, and large commits (`isLargeCommit`) are dropped only when each part's commits are listed. Parts come from `partReading` (so unbound, drill-down, unregistered repository, checkout-unavailable, ref-not-checked-out are skipped with the reason, exactly as behind skips them).
- `src/runtime/history-lens/lib/answer-memory.ts` (`createAnswerMemory`, exported): the server's memory, keyed on board id and version, variant, start of period and each registered checkout with its HEAD (the same inspection behind keys on). A request that arrives while an answer is made waits for it and starts no second walk; the work stops only when the last request waiting for it has gone.
- `src/server/archboard/lib/locality-route.ts` (+ root entrypoint `src/server/archboard/locality.ts`): `GET /api/semantic-boards/locality?board=&variant=&since=`, run through `checkoutWork.trackRequest`, mounted in `application.ts` after the board routes.
- `src/cli/commands/semantic-locality.ts`: `archboard semantic locality <board> [--variant <name>] [--since <date>]`; JSON on stdout, a ranked summary on stderr.
- `src/shared/timing/locality.ts`: `LOCALITY_DEFAULT_PERIOD_MS` (365 days).
- Skill: `skills/archboard/references/read.md` step 5 says when to use it and how to report it; `SKILL.md` names it in the recipe pointer. Evals: `evals/coverage.json` row, scenario S18 and `evals/fixtures/S18.json`. `docs/design/cli-command-audit.json` has the entry.

## Decisions the ADRs did not settle

1. The answer's shape, for TASK-369.04 to extend: `hotspots` is a list of every part the lens read, ranked (most commits first, ties in the variant's order), each with `count` and its commit ids newest first. The commit records (subject, time, file count) sit once in `commits`, newest first, as behind keeps them. TASK-369.04 adds a sibling list of coupled pairs that names parts by `subject` and commits by the same ids, and reads `commits`, `leftOut` and `skipped` as they are. `leftOut.largeCommits` counts the distinct large commits that changed a bound file of a part the lens read; a pair needs no second number because both readings use the same filter and the same walk.
2. A part with no commit in the period is listed with `count: 0`, so the inspector can say that a selected part had none; a part that was not read is only in `skipped`.
3. A part whose checkout has no commit is skipped as `checkout-unavailable` (detail: no commit) rather than ranked with 0.
4. The period is per repository: HEAD's commit time ends it and, by default, the year (365 days) before that starts it. `periods` says what each repository read, so a reader never has to compute it. A `--since` start applies to every repository.
5. `--since` takes a date (`2026-01-31`, midnight UTC) or a date and time with its offset, nothing looser (`Date.parse` takes `1`); the command refuses anything else as a usage error (exit 2) before it asks the server, and the route refuses it too.
6. Variant rule (ADR: the current variant, or a named draft): with no `--variant` the lens reads the current variant, and refuses a board with none; it does not fall back to a sole draft the way `semantic show` does. A named historical or shelved variant is refused with the reason. A server refusal fails the command with exit 1, as every other server refusal does.
7. The route is `GET /api/semantic-boards/locality`, beside the board routes it reads, and not under `/api/vault/`, because it is about one board and not the vault; the pane inspector (TASK-369.07) asks it with the same query.
8. Memory holds 32 answers (oldest leaves first) so a user who walks across boards does not lose the answer of the board before; the ADR said "each answer" and a bounded map is what that means in a process that lives for days. An in-flight walk is shared (ADR: a request that arrives while the walk runs waits), and the sharing is the one place where cancellation differs from the code check: a hang-up cancels the shared work only when no other request still waits.
9. The default period is `src/shared/timing/locality.ts`, a second entrypoint of the timing module, because `timing.ts` is at the 600-line limit that lint enforces (the voice durations did the same through `voice.ts`).
10. Dogfood: no relationship anchors were drawn, since no relationship of these two boards carries one.

## Evidence and gate

- Criterion 1 (ranking, default period, `--since`): `src/runtime/history-lens/tests/locality.test.ts` (ranking with ties in variant order, the year before HEAD, `since`, renames, merges, draft variant); `src/server/archboard/tests/locality-route.test.ts`; `src/cli/commands/tests/semantic-locality.test.ts`.
- Criterion 2 (large commits left out and counted): `locality.test.ts` "a commit of more than 30 files is left out of every count, and the answer says how many".
- Criterion 3: `skills/archboard/references/read.md` step 5; `evals/coverage.json` row, scenario S18 and `evals/fixtures/S18.json`; `bun run eval:skill check` (19 scenarios, 19 fixtures, 14 coverage parts); `docs/design/cli-command-audit.json` entry.
- Gate: type-check 0, lint 0 (lint:tests, lint:policy), fmt:check clean, test:modules 4036 pass, test:system 192 pass, test:repository 20 pass, test:serial-browser exit 0.
- Real command on the dogfood vault (2026-10-06): `./bin/dogfood semantic locality "Board viewer"`: 35 parts read, 3 skipped as drill-down, 21 large commits left out; Viewer entry point 20 commits, Select semantic subjects 15, Semantic queries 9. `./bin/dogfood check` and `check --code` exit 0; Archboard server and Command interface read 0 commits behind after adoption.
- Dogfood: Archboard server and Command interface proposals TASK-369.03 adopted (versions 36 and 30). Their vault files were committed inside 0c606eead (the TASK-369.05 commit), because that commit took the shared Git index while my blobs were staged; the content is only TASK-369.03.
<!-- SECTION:NOTES:END -->
