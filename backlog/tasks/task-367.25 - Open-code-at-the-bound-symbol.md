---
id: TASK-367.25
title: Open code at the bound symbol
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:16'
updated_date: '2026-10-06 13:11'
labels:
  - code-check
  - ui
dependencies:
  - TASK-367.06
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 633000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A binding with a symbol names more than a file, but Open code still opens the file at its top. Adding a field makes a promise to every reader of it (archboard-dev).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Open code opens a local checkout at the line where the bound symbol is defined, when code facts find it
- [ ] #2 The GitHub target links to that line
- [ ] #3 Without a symbol, or when the symbol is not found, it opens the file as today
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Line lookup: src/runtime/code-target gains symbolLine(binding, target, signal), reading the bound file through code facts (a pass over one listed file; findSymbol definition), giving the first line of the definition, else undefined (no symbol, a directory, text file, not found, unreadable).
2. Opener: routes.ts asks a new route dependency lineOf after resolving; passes the line to planOpenerCommand (presets: code/cursor --goto path:line, zed path:line; custom: a {line} token, 1 when unknown; platform: no line) and to the GitHub link on failure actions.
3. GitHub: githubUrlForBinding(binding, line) gives /blob/<ref>/<path>#L<n>; the line is used only when the checkout has the bound ref out (a checkout on another ref reads another version).
4. Update the three readers' comments (routes.ts, resolver-core.ts, presentation.ts).
5. Tests: resolver/symbolLine unit owner, presentation GitHub-line owner, planning owner for presets and {line}, route (system activation-contract) test with a fake opener that records argv.
6. Hand test on own server with a printing opener; skill sentence if any; board proposal per archboard-dev.

Board: Archboard server@TASK-367.25 adds the relationship Code opener -> Code facts (call, anchored at createCodeFacts in src/server/code-opener/lib/symbol-line.ts). The line lookup lives in the opener, not in runtime/code-target, so the anchor is held by the end that binds src/server/code-opener. Decisions: bound file only (as the code check holds a binding symbol), a directory opens as today; GitHub line only when the checkout has the bound ref out; presets open at the line (code/cursor --goto path:line, zed path:line), a custom opener may use a {line} token, the platform opener has no line.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built: src/server/code-opener/lib/symbol-line.ts (symbolLine: one-file code facts pass, findSymbol definition, first line of the definition), routes.ts asks it after the target resolves and passes the line to planOpenerCommand and to the GitHub failure link; planning.ts takes options {line, platform}; presentation.ts githubUrlForBinding(binding, line) gives blob/<ref>/<path>#L<n>. Comments of the three readers (routes.ts, resolver-core.ts, presentation.ts) now say what they do. Skill: authoring.md sentence on View in code.
Decisions: (1) the lookup lives in the opener, not runtime/code-target, so the board relationship Code opener -> Code facts is anchored in code of the end that binds src/server/code-opener. (2) Bound file only, as the code check holds a binding symbol: no re-export following (definitionSite not used), and a directory opens as today; a directory needs the listing of readable files that only code-check owns, so it is left out. (3) The facts pass lists exactly the one real target file, so no git ls-files runs per click; neverRead still applies in code facts. (4) A file read as text (any language but TS/TSX for now) gives no line, so it opens as today. (5) A read error or a vanished file gives no line, never a failed open; an abort rethrows. (6) Editors: code and cursor open with --goto path:line, zed with path:line; the platform opener has no line; a custom opener may write {line} in an argument and reads 1 where the binding has no line (so {path}:{line} on a directory binding is a user's choice to avoid; the settings test button passes no line either). The settings schema needed no change: only {path} is counted. (7) GitHub: a file with a line links blob/<ref>/<path>#L<n>, else tree as before. The line is read from the working tree, so it is linked only where the checkout has the bound ref out: a checkout on another ref gets CHECKOUT_ON_OTHER_REF with a plain tree link (the file there is not the file at the bound ref). With no registered checkout there is no line to find, so the fallback links the file. (8) No answer-shape change: the success reply carries no line, so src/shared/code-target is untouched.

Board close: Archboard server@TASK-367.25 (parent l8We8gCC, TASK-367.24 anchors) draws Code opener -> Code facts (call, anchor createCodeFacts in src/server/code-opener/lib/symbol-line.ts); adopted at v71 (dca91aea1) with the board's scope as its summary. Footprint against base 0db035f15 (parent of 9a10b54dd): namedAndChanged Code opener (9a10b54dd); changedNotNamed none; namedNotChanged Code facts, which is normal (a new caller does not change the file of what it calls); skipped five drill-downs. current was the proposal's parent. ./bin/dogfood check: no diagnostics. ./bin/dogfood check --code: no findings, no skips, and no board is behind 9a10b54dd (no board binds src/runtime/code-target). Hand test on a server of its own (port 3519, a temporary copy of web-shop, a temporary checkout and a custom opener that appends its arguments to a file, stopped afterwards): Ledger.post opened with --goto <file>:5, a symbol the file lacks and a symbol-less binding both with :1 (the file as today); with the opener executable missing the failure carried https://github.com/acme/payments/blob/HEAD/src/ledger.ts#L5. Not done by hand: the code, cursor and zed presets (owned by the planning test, no real editor opened). Left out: directory with a symbol; following a re-export; INSTALL.md and the settings page text do not yet mention {line} (outside the write scope).
<!-- SECTION:NOTES:END -->
