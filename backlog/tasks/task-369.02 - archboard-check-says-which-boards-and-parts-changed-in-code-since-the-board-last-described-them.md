---
id: TASK-369.02
title: >-
  archboard check says which boards and parts changed in code since the board
  last described them
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 10:52'
labels:
  - history
  - cli
dependencies:
  - TASK-369.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: high
type: feature
ordinal: 650000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The tracer bullet of the history lens, and its cheapest reading. TASK-257 found 141 commits with no vault update. On 2026-09-29, Board viewer was 10 commits behind, 6 of them in `subjects.ts`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For each board, the check reports the commits to its bound files since the point the ADR chose, per board and per part
- [ ] #2 Parts that drill into another board are skipped, and a binding to a directory counts every file below it
- [ ] #3 Renamed files keep their history, and repositories this machine has not registered stay silent
- [ ] #4 The reading does not run inside the check that open canvases poll every 5 seconds
- [ ] #5 archboard-dev and `.archboard/README.md` tell a maintainer to read it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Shared schema src/shared/code-check: the answer of GET /api/vault/code-check { boards, findings, skipped, behind } (ADR 0046), findings = VaultDiagnostic with severity warning|information (empty from this task), skipped = board-level reasons (no-current-variant, board-unreadable), behind = per board: lastChange (commit | uncommitted | unknown), commits (repo, hash, time, subject, files, large), parts (subject, repo, path, commits) and skipped parts with reasons (unbound, drill-down, repository-unregistered, checkout-unavailable, ref-not-checked-out).
2. Runtime module src/runtime/history-lens (needs Git processes and the board store, so runtime; TASK-369.03-05 reuse it): a cancellable git runner with a timeout from timing.ts, the commit walk (no merges, -M renames, name-status, file counts, large = more than 30 files), the mapping of commits onto bound paths (file or every file below a directory, following renames newest first), the board's last change from the board file's own history (git log --follow, compareVariants on the current variant, uncommitted change = now, untracked-not-ignored = now, vault outside Git or ignored file = unknown), and behind per board and part (checkout has the commit: HEAD ^L; else commits after its time). Parts skipped: unbound, drill-down, unregistered repository, unavailable checkout, pinned to a ref the checkout does not have out. One walk per repository per request; an in-memory answer keyed on board versions, the checkouts with their HEADs and the vault HEAD.
3. Server: src/server/archboard/lib/code-check-route.ts mounts GET /api/vault/code-check as checkout work (checkoutWork.trackRequest: a disconnect or a stop cancels it), registered in application.ts; /api/vault/check is unchanged.
4. CLI: archboard check --code runs the plain check, then GET /api/vault/code-check; JSON result gains codeCheck; stderr prints findings, skips per reason and behind per board and part; exit 1 only for a plain diagnostic or a warning finding.
5. Tests: history-lens on a temp Git repository built in the test (criteria 1-3), the route (runs only on its own route, disconnect cancels: criterion 4), the CLI (exit status, plain check never asks the code route).
6. Docs: archboard-dev closing steps and .archboard/README.md tell a maintainer to read behind; cli-command-audit.json entry for check.
7. Dogfood: proposals Archboard server@TASK-369.02 (Code check route, History lens) and Command interface@TASK-369.02 (Vault check calls the code check route); run ./bin/dogfood check --code and compare with the design note's measurement.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## What was built

- `src/shared/code-check/index.ts`: `CodeCheckAnswerSchema` = `{ boards, findings, skipped, behind }` (ADR 0046). `boards`: `{ board, variant, version }` for each board read at its current variant. `findings`: `CodeFindingSchema` = `VaultDiagnosticSchema` with severity `warning | information` (no `evidence` yet; always empty from this task). `skipped`: board-level `{ reason: "no-current-variant" | "board-unreadable", board, detail? }`. `behind`: `BoardBehindSchema` per board, a union of `{ board, variant, lastChange: commit | uncommitted, commits, parts, skipped }` and `{ board, variant, lastChange: { kind: "unknown", reason: "vault-outside-git" | "board-file-ignored" } }` (no counts at all, so an unknown board never reads as zero). The top-level answer is not strict, so a parse drops the route's `success`; every inner object is strict.
- `src/runtime/history-lens` (new runtime module; runtime because it runs Git and reads boards, and the server and CLI layers may use runtime; its own module because TASK-369.03 to 369.05 reuse it). Interface: `createBehindReading()` (behind with its memory), `walkCommits` (no merges, `-M` renames, `--name-status -z`, caller names the range), `commitsByBoundPath` (file or every file below a directory, following renames newest first), `partReading` (read or skipped with reason), `isLargeCommit` (more than 30 files). Its own Git runner (`lib/git.ts`) keeps the whole output, because the engine's `git()` caps output at 64 KB; it takes the caller's signal and `HISTORY_LENS_GIT_TIMEOUT_MS`, and sets `GIT_OPTIONAL_LOCKS=0`.
- `src/server/archboard/lib/code-check-route.ts` (+ root entrypoint `src/server/archboard/code-check.ts`): `GET /api/vault/code-check`, mounted in `application.ts` after the board routes, run through `checkoutWork.trackRequest` (a disconnect or a stop cancels it; stop never refuses for it). It lists boards, reads each through the store, skips boards with no current variant or an unreadable file, and asks the server's one `createBehindReading()` instance.
- CLI: `archboard check --code` (`src/cli/commands/vault.ts`): plain check first, then the route with the CLI's interrupt signal. JSON result is the plain check plus `codeCheck`. Stderr: plain diagnostic lines, one line per board-level skip reason with a count, then behind per board, per part with commits, and skip counts per reason (`src/cli/commands/lib/code-check-lines.ts`). Exit 1 only for a plain diagnostic or a finding with severity warning.
- `HISTORY_LENS_GIT_TIMEOUT_MS = 60_000` in `timing.ts`.

## Decisions the ADRs did not settle

1. Behind's per-board `skipped` lists every part it did not read, reasons `unbound`, `drill-down`, `repository-unregistered`, `checkout-unavailable`, `ref-not-checked-out` (with `ref: { named, checkedOut }`). `parts` lists every read part, also with zero commits. So every part of the current variant is in exactly one of the two lists. Behind keeps its skips to itself (not in the top-level `skipped`) so the reading is self-contained, as locality and footprint will be; the top-level `skipped` holds what the whole check did not read (boards with no current variant or an unreadable file).
2. `checkout-unavailable` is a fifth reason: the repository is registered but its checkout is gone, its identity changed, or the bound path leaves the checkout. It carries the resolver's error as `detail`.
3. A bound path that no longer exists is still read: Git keeps the history of a deleted file, and its deletion is where to look. Its ref is resolved against the checkout root (`resolveLocalCodeTarget({ ...binding, path: "." })`), because the ref rule does not depend on the path. This reuses the one ref rule of `src/runtime/code-target` instead of a copy.
4. A version of a board file that this build cannot parse (an older schema, such as before the 2.3.0 order migration) counts as a change: the lens cannot show that the current variant stayed the same. The store exposes no pure decode with migrations (`migrateSemanticBoardDocument` is private and the store was another task's write scope). On the dogfood vault no board's walk reaches such a version. A later task can export a pure decode from the store.
5. The last change is found by comparing each commit's version with its first parent's version (`<commit>^:<path before>`), not with the next older commit of `--follow`, so a board edited on two branches compares correctly. Merges with no change of their own are left out.
6. The walk: per repository, one `git rev-list` per distinct last change (`HEAD ^L` when the checkout has `L`; else `git log --since=@t HEAD` filtered to commits strictly after `t`), then one `git log --no-walk --stdin` over the union. Rename following runs over that union in date order.
7. Memory: one entry, the last answer, keyed on the vault checkout root and HEAD, each board file with its version, and each registered checkout's inspection (root, identity, HEAD). No in-flight sharing: only the CLI asks, and a waiter would be cancelled with the first caller.
8. CLI text output lives on stderr through a second output case (`code`) whose presentation is diagnostics then result, so behind prints also on exit 0.
9. The JSON key for the code check in the CLI result is `codeCheck`.

## What TASK-367.05 extends

- `--variant <name>`: add the option to `checkContract` in `src/cli/commands/vault.ts` and pass it as a query to `GET /api/vault/code-check`; `runCodeCheck` in `src/server/archboard/lib/code-check-route.ts` then reads the named draft per board and records it in `boards[].variant`. Behind must keep reading the current variant only (ADR 0045), so pass behind the current-variant boards as today.
- Findings: create `src/runtime/code-check` (text adapter), call it from `runCodeCheck` beside `behindReading.read`, and put its findings in `findings`. Extend `CodeFindingSchema` with `evidence` when TASK-367.06 needs it, and widen `DiagnosticSubjectSchema` in semantic-policy with `step` (the code-check subject schema is derived from it with `VaultDiagnosticSchema.shape.subject.unwrap()`).
- Skips: add the code pass's reasons to `CodeCheckSkipSchema.reason` (path ignored, text-only, unparsed, unregistered repository, ref not checked out, relationship or step skipped with its end) and add the optional `subject`/`repo` fields there; the CLI already prints one line per reason with a count.
- CLI text: `codeCheckLines` in `src/cli/commands/lib/code-check-lines.ts` prints no findings yet; add them there with `diagnosticLine` (which needs to accept severity `information`) and their evidence lines.
- Exit status already fails on a finding with severity `warning` (`failsCheck` in vault.ts).
- The consumer skill's verification step (TASK-367.05 #5) is not written; this task added only the archboard-dev closing step and `.archboard/README.md`.

## Dogfood run and the design note

./bin/dogfood check --code on 2026-10-06 after adoption (exit 0, 0.9 s): Agent workbench 0, Archboard 1, Archboard server 0, Board persistence 1, Board rasterizer 0, Board viewer 10 (since 2779dff27), Browser application 9, Codex session 5 (3 large), Codex workhorse 0, Command dispatch 0, Command interface 0, Renderer layout 1, Semantic renderer 1, Skill evaluation 1, Voice coordinator 2. Six boards read 0 or 1 because TASK-368.05 edited their current variants in place today. None of the commits counted is a TASK-369.02 commit, so this task puts no board behind besides the two it adopted (closing step 6).

Against the design note (048312ee, 2026-09-29: Board viewer 10, Command interface 3, Codex session 2, four boards 1, eight boards 0): the reading run on a clone at 048312ee gives Board viewer 10, Command interface 3, Codex session 2, four boards at 1 (Archboard, Board rasterizer, Skill evaluation, Voice coordinator), six boards at 0, and two boards that differ: Renderer layout 9 and Semantic renderer 2 where the note says 0. Their last change is 7e338b3f6 (2026-09-28 00:27); the counted commits (2026-09-27 17:02 to 22:24) were committed earlier on branches that merged after it (aadd67e33, 7f528637c). ADR 0045 counts the commits on HEAD that are not in the history of the last change, so they count; the note counted by time since the last write. The drill-down trap of the note (Semantic renderer card on Archboard server adds 259 commits) is skipped as drill-down.
<!-- SECTION:NOTES:END -->
