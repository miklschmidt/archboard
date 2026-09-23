---
id: TASK-296
title: >-
  Archboard names its own state, environment and identifiers; excalidraw names
  only the Excalidraw format
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-09-22 16:48'
updated_date: '2026-09-23 00:56'
labels:
  - refactor
dependencies: []
ordinal: 516000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Excalidraw was dropped from the product in favour of the deterministic renderer, so nothing Excalidraw-related is kept. The runtime state directory was ~/.local/state/excalidraw-canvas (Codex home, sqlite logs, pid files, repos.json), the autostart switch was EXCALIDRAW_NO_AUTOSTART, and names such as Excalidraw-Canvas and excalidraw-skill survived from the fork of mcp_excalidraw. Our own names say archboard everywhere, and every remaining trace of Excalidraw is deleted: the Excalidraw* modules and types, the .excalidraw.md format reading and writing, the Obsidian Excalidraw plugin support and its releases tag, excalidraw.com references, any @excalidraw/* dependency, CSS or assets that existed only for Excalidraw, and every test, fixture, document paragraph, skill sentence and eval input that existed only for those. Only the fork-history sentences in CLAUDE.md and DESIGN.md and the upstream git remote remain. Requested on 2026-09-22 after reading the Codex session under the old directory; scope widened the same day from renaming to deletion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every runtime state path the product owns lives under ~/.local/state/archboard (with XDG_STATE_HOME honoured as before), and a machine that still has ~/.local/state/excalidraw-canvas is moved to the new place on first start without losing the Codex home (its login, sessions and logs).
- [x] #2 The autostart switch and every other environment variable, identifier, package script, document and skill the product owns are named archboard; the old environment variable name is no longer read.
- [x] #3 The word excalidraw appears nowhere in the repository except the fork history sentences in CLAUDE.md and DESIGN.md.
- [x] #4 Every Excalidraw dependency, module, type, format path, asset, test and fixture is deleted rather than renamed, and nothing the deterministic renderer or the semantic board path depends on was deleted with them.
- [x] #5 bun run check passes, and the running canvas restarted from the new build serves the same Codex session state as before.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rename the machine-local state directory the product owns: linux $XDG_STATE_HOME/archboard (beside archboard.log), darwin ~/Library/Application Support/archboard, win32 <LOCALAPPDATA>/Archboard.
2. Migrate an existing machine at the one place the directory is resolved (src/runtime/engine/state-dir.ts): when the legacy directory exists, move its entries into the new directory with renameSync, entry by entry, never overwriting an existing entry (so archboard.log already there survives), then remove the legacy directory only when it is empty. Idempotent and memoised per resolved pair so repeated stateDir() calls cost one existsSync. Stale server-<port>.pid files are moved, never deleted.
3. Cover the migration with a focused test under src/runtime/engine/tests/ using a temporary XDG_STATE_HOME: codex-workbench moves, an existing archboard.log is not overwritten, hundreds of pid files survive, a second call is a no-op.
4. Rename EXCALIDRAW_NO_AUTOSTART to ARCHBOARD_NO_AUTOSTART everywhere (config, spawn, help text, skill-evaluation isolation, every test support fixture, docs). The old name is no longer read.
5. Rename the canvas health identity mcp-excalidraw-canvas to archboard-canvas in the server route, the client transport that verifies it, and every fixture that answers it.
6. Rename remaining product-owned strings: the 'Excalidraw Bridge' test fixture node, a stale browser wait description, and the state paths in TESTING.md, INSTALL.md and docs/design/codex-workbench-voice-acceptance.md; regenerate the derived skill copies with bun scripts/sync-skills.ts.
7. Keep the word excalidraw where it names the Excalidraw library, plugin, .excalidraw.md format, Excalidraw* types, excalidraw.com, the upstream fork and package, and the two legacy literals whose whole job is to name the past (the legacy state directory in the migration and the retired 'excalidraw-skill' install cleanup).
8. Verify: bun run fmt, lint, type-check, then test:modules, test:system, test:serial-browser sequentially.

9. SCOPE CHANGE (2026-09-22): delete Excalidraw rather than keep it. Survey first: package.json and bun.lock already carry no @excalidraw dependency, no Excalidraw* identifier survives in src/frontend/scripts/tools/tests, board-io.ts and write-boundary.ts are already gone, and the frontend links only its own stylesheet. What is left is (a) the last live code that still names the format, (b) Excalidraw-only files, and (c) prose.
10. Live code: drop BOARD_FILE_SUFFIX and identityFromVaultPath from board-address.ts and make vaultPathFor take its suffix; drop derivedId/fnv1a/encode from ids.ts (minted only to rename Excalidraw's 21-character nanoids); drop the excalidraw-skill retired-install cleanup from install-skill.ts and sync-skills.ts; drop the Excalidraw export decoder from the CLI test support; drop the .excalidraw DOM filter and window.name; rewrite every comment and help string that named the note format.
11. Excalidraw-only files to delete: libraries/, docs/design/vendor/, docs/design/server-rendering-boundary-fixtures/, docs/design/excalidraw-json-schema.md, docs/adr/0001, scripts/probe-server-rendering-emulation/.
12. Prose: README, TESTING, INSTALL, .gitignore, skills/archboard-dev, docs/agents/*.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
State directory: stateDir() now resolves $XDG_STATE_HOME/archboard (Linux), ~/Library/Application Support/archboard (macOS), <LOCALAPPDATA>/Archboard (Windows), beside the archboard.log the logger already wrote there. XDG_STATE_HOME is honoured exactly as before. A one-time migration runs where the directory is resolved: if the pre-rename directory exists and differs from the current one, the current one is created, every entry is moved with renameSync one at a time, an entry whose name the current directory already holds is left behind rather than overwritten, and the pre-rename directory is removed only once every entry moved. Nothing is ever deleted; a rename that fails leaves that entry for the next start to retry. Memoised per resolved directory so repeated stateDir() calls cost one existsSync. src/runtime/engine/tests/state-dir.test.ts covers it with a temporary HOME/XDG_STATE_HOME: the Codex home moves with its contents, an existing archboard.log is not overwritten and the stale copy stays put, 300 server-<port>.pid files move with everything else, and a machine with no pre-rename directory is left alone.

Environment: EXCALIDRAW_NO_AUTOSTART is ARCHBOARD_NO_AUTOSTART in config, spawn, CLI help, skill-evaluation isolation and 16 test fixtures. The old name is no longer read anywhere. The canvas health identity mcp-excalidraw-canvas is archboard-canvas in the server route, the client transport that verifies it and every fixture that answers it - a canvas already running from an older build will not be recognised until it is restarted.

Excalidraw removal (live code): BOARD_FILE_SUFFIX and identityFromVaultPath deleted from board-address.ts and vaultPathFor now takes its suffix (only caller passes .semantic.json); derivedId, fnv1a and encode deleted from ids.ts - they existed only to rename Excalidraw's 21-character nanoids and nothing imported them; the excalidraw-skill retired-install cleanup deleted from install-skill.ts, sync-skills.ts and its system test; the Excalidraw export decoder deleted from tests/system/cli/support/package-result.ts; the .excalidraw DOM filter and window.name deleted from the browser support and frontend entry; two .excalidraw.md negative tests replaced by positive one-file-per-board assertions. Survey first established that package.json and bun.lock already carry no @excalidraw dependency, no Excalidraw* identifier survived anywhere, and board-io.ts / write-boundary.ts were already gone, so no module the renderer or the semantic board path depends on had to be untangled.

Verification: fmt clean; lint clean (both lanes); both TypeScript projects clean; vite build clean; test:modules 3457 pass 0 fail; test:system 168 pass 0 fail; test:repository 8 pass 0 fail; test:serial-browser 19 pass 0 fail across 16 files.

BLOCKED: the permission system refuses every file deletion in this session (git rm and rm are denied as irreversible local destruction), so the Excalidraw-only FILES are still present and criterion 3 is not met. They are listed in the handback.

2026-09-22: the user ruled on the deletions the agent could not make: groups 1 and 2 deleted (libraries/, the vendored Obsidian plugin source, the server-rendering-boundary fixtures, the emulation probe, the Excalidraw JSON schema note, and seven Excalidraw-era design investigations); the ADRs stay as history (0001, 0003, 0007, 0017 whole, and the one sentence each in 0004, 0006, 0010, 0011, 0015, 0016, 0018, 0020, 0022, 0023). Links to the deleted files were reworded in AGENTS.md, atomic-write.ts, docs/agents/test-suite.md, ADR 0020 and the vendor README (which keeps its shadcn section). Remaining mentions of the word: the kept ADRs, the MIT notice in LICENSE, the legacy literal in state-dir.ts and its test, and the fork sentence in AGENTS.md.

Combined tree verified after the deletions: fmt, lint and both type-checks clean; module lane 3457 pass, system 168, repository 8, browser 19 (16 files, 0 fail). AC5's second half (the restarted canvas serving the same Codex state) awaits the user's restart; the Codex home moved intact (auth.json, sessions, sqlite-home, 226 MB) and the dead server's lock was set aside (TASK-298).

AC #5 second half: the 3100 canvas was restarted from a post-rename build and answers /health as service archboard-canvas. ~/.local/state/excalidraw-canvas no longer exists; ~/.local/state/archboard/codex-workbench/codex-home holds auth.json and 24 session rollouts from before the rename, and the restarted canvas has written a new rollout there. The user's voice sessions (which need the signed-in Codex) work. Gate: bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included).
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude-opus
created: 2026-09-22 17:26
---
Acceptance criteria 3, 4 and 5 are unchecked and the task stays In Progress: this session's permission system refuses every file deletion (both git rm and rm are denied as irreversible local destruction), so the Excalidraw-only files listed in the implementation notes are still on disk. Everything that can be changed in place is done and the whole gate is green. The remaining step is deleting those files.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every runtime path, environment variable, identifier and document is named archboard; the state directory moved to ~/.local/state/archboard with a one-time, non-overwriting migration; every Excalidraw module, format path, file and dependency is deleted except the history the user chose to keep (ADRs, LICENSE notice, fork sentence). Verified by state-dir tests, the live canvas serving the migrated Codex home, and the full gate: bun run check exit 0 on 2026-09-23 at 67ef9b45: lint, fmt, both type-checks, frontend build, 3461 module tests, 168 system, 8 repository, 19 serial-browser tests across 16 files (codex-live-voice and semantic-walkthrough-narration included).
<!-- SECTION:FINAL_SUMMARY:END -->
