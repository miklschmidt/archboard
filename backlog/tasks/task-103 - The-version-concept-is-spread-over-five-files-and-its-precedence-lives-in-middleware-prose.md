---
id: TASK-103
title: >-
  The version concept is spread over five files, and its precedence lives in
  middleware prose
status: To Do
assignee: []
created_date: '2026-08-23 15:01'
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
- [ ] #1 One module owns the version: stamping on write, the stated/remembered precedence, the move description and the conflict prose; `src/server.ts` middleware calls it rather than reading the note file itself
- [ ] #2 `src/core/board.ts` no longer exports version functions, and `src/core/version.ts` is renamed so "version" does not resolve to the package version first
- [ ] #3 `test:version` still proves the diagnoses in-process and the refusal over HTTP, against the new seam
<!-- AC:END -->
