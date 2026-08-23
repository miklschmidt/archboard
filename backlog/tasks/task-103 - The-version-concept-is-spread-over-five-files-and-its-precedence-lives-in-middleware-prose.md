---
id: TASK-103
title: >-
  The version concept is spread over five files, and its precedence lives in
  middleware prose
status: Done
assignee:
  - '@claude'
created_date: '2026-08-23 15:01'
updated_date: '2026-08-23 15:32'
labels: []
dependencies: []
references:
  - src/core/board.ts
  - src/core/board-io.ts
  - src/core/board-lock.ts
  - src/server.ts
  - src/core/canvas-client.ts
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
priority: medium
type: task
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
One idea — which edit of this note is this, and has the board moved past what this writer was editing — has no module. Its parts at commit 2a4d9cc: `noteVersion`/`versionNumber`/`versionOfNoteAt`/`versionMove`/`describeVersionMove` (`src/core/board.ts:360–439`) and `describeVersionConflict` (:609); `stampVersion` (`src/core/board-io.ts:685`, the rule that a byte-identical write does not bump); `claimSeen`/`claimSaw` (`src/core/board-lock.ts:461–470`, what the canvas remembers telling a writer); `statedVersionOf`/`rememberedVersionFor`/`refuseStaleVersion` (`src/server.ts:1081–1184`), which stats the note itself at :1158 past `board-io`; and `versionsSeen`/`statedVersion`/`rememberVersion` in `src/core/canvas-client.ts` (a read mutates what the next write asserts). The ordering that ties them — stated beats remembered, remembered is read under the lock, the note's own number is deliberately not a source — exists only as prose at `server.ts:1065–1080`. `src/core/version.ts` (13 lines) is `packageVersion()` and is the first grep hit for "version". `board.ts` (914 lines, ~45 exports) is at least four concepts — naming, vault paths, frontmatter, version, conflict prose, save classification, image embedding, listing — and the version half is the sharpest to lift.

Architecture review 2026-08-23, candidate 3. Worth exploring rather than Strong: the evidence is TASK-091 finishing, not an open pull. Deepened shape: one module answers "what version is this writer editing, and has the board moved past it", so the three sources and their precedence are its interface rather than a comment; the middleware calls one verb under the lock; `board.ts` sheds its version half.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One module owns the version: stamping on write, the stated/remembered precedence, the move description and the conflict prose; `src/server.ts` middleware calls it rather than reading the note file itself
- [x] #2 `src/core/board.ts` no longer exports version functions, and `src/core/version.ts` is renamed so "version" does not resolve to the package version first
- [x] #3 `test:version` still proves the diagnoses in-process and the refusal over HTTP, against the new seam
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/core/board-version.ts as the single version module, moving note parsing, lookup, move diagnosis, conflict prose, byte-identical-aware stamping, stated-over-remembered checking, and kept remembered state. 2. Route board-io through it, remove board.ts version functions, rename version.ts to package-version.ts, and update import-only callers. 3. Put claim and client remembered versions behind the new module names, with server.ts calling one check under the lock. 4. Extend check-version.mjs at the new seam for precedence, remembered conflict refresh, and no note-derived expectation. 5. Run the allowed focused checks after each slice, then final greps, explicit-path commits, task notes, acceptance evidence, and Backlog finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Slice 1: added src/core/board-version.ts for note counts, move diagnosis, conflict prose, stamping, source parsing, precedence, and kept remembered state; board-io and existing diagnostics now use the new module; board.ts exports no version functions; renamed src/core/version.ts to src/core/package-version.ts. Import-only ripples: src/core/note-watch.ts, src/core/board-hold.ts, src/core/canvas-client.ts, src/core/mcp-server.ts, src/cli/run.ts, scripts/check-boards.mjs, scripts/check-version.mjs, and the version import region in src/server.ts. Evidence: backend tsc passed before expected TASK-101 frontend errors; test:version passed 57 checks; test:lock passed 115 checks.

Slice 2: moved claim and client remembered versions behind board-version rememberedVersion/rememberVersion names, with kept() preserving them through hot reload; board-lock now only ends remembered state when a claim ends. The write middleware now parses statedVersion once and calls checkBoardVersion once under the held lock; checkBoardVersion owns stated-over-remembered precedence, current-note comparison, and conflict refresh. check-version gained four in-process seam checks. Evidence: full type-check passed; test:version passed 61 checks after its new HTTP coverage caught and verified the holdOn undefined integration correction; test:lock passed 115 checks; test:module-scope passed 50 modules and its self-test.

Final verification at commits 3399725 and 93c9486: bun run type-check passed; test:version passed 61 checks including in-process stated-over-remembered, conflict refresh, no note-derived expectation, byte-identical stamping, three move diagnoses, and real HTTP refusal; test:lock passed 115; test:module-scope passed 50 modules plus self-test; test:doing passed 42; test:one-write passed 58. Final symbol audit found moved version functions only in src/core/board-version.ts and callers importing that path, no version exports in board.ts, only board-version.ts and package-version.ts under src/core, and the write-boundary region calls checkBoardVersion without calling versionOfNoteAt or reading a board state file for the comparison.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created src/core/board-version.ts as the sole owner of note version parsing and stamping, stated-over-remembered write checks, kept writer memory, move diagnosis, and conflict prose. The write-boundary middleware now calls checkBoardVersion once under the board lock; board-io stamps through the module, board.ts has no version exports, and packageVersion moved to package-version.ts. Verified with type-check, 61 version checks including the new seam and HTTP refusal, 115 lock checks, module-scope and self-test, 42 doing checks, 58 one-write checks, and final import/symbol audits.
<!-- SECTION:FINAL_SUMMARY:END -->
