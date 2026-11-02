---
id: TASK-565
title: Remove the dead code that the retired boards left behind
status: Done
assignee:
  - '@claude'
created_date: '2026-11-02T20:10:00Z'
updated_date: '2026-11-02T22:45:00Z'
labels:
  - cleanup
  - refactor
dependencies:
  - TASK-564
documentation:
  - docs/adr/0068-one-live-canonical-model-and-consumer-path.md
priority: medium
ordinal: 1014000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0068 retired boards, but it removed behavior faster than it removed the code around that behavior. TASK-564 found eight source files that nothing imported, and that search looked only at whole files. Code with no caller costs every reader and agent time, and TASK-564 had to decide how to rename some of it. The repository has lint for boundaries and a ceiling on interface width, but nothing reports an export or a message that nobody uses, and package.json lists no dead-code tool. Leads from TASK-564, which still need proof: the browser handles the socket messages model_note, model_lock, model_doing and pane_error, but a literal search of server source found no sender. `embedsRelationships` in apps/cli/src/cli/operations/vault/vault.ts names `/api/semantic-boards` routes that no server route serves. The legacy reader under the canvas behavior has callers in retained replay and migration preview, so some of it is live, and each part needs its own proof.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every source file under packages/ and apps/ is reachable from a process entry, a browser entry or a package export
- [x] #2 Every exported name has a caller outside its own file. A test counts only for a fixture export or a seam that drives live code, and the task notes list those kept names
- [x] #3 No socket message, CLI route relationship, refusal code or configuration key remains that nothing sends, serves or reads
- [x] #4 Each package whose interface gets narrower has a lower ceiling in tests/system/repository-policy/interface-width-ceilings.json
- [x] #5 Tests that only covered deleted code are gone, and no test of live behavior was removed
- [x] #6 LEGACY_AUTHORITY migration, retained originals and talk replay keep working, and the decoding of legacy formats keeps reading exactly as before
- [x] #7 The ADR of TASK-564 still names each kept use of the word board correctly after the deletions
- [x] #8 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure every export and file with the TypeScript AST: reachability from process entries, browser entries and package exports, and the callers of each name outside its own file.
2. Delete unreachable files and exports with no caller, repeating to a fixed point. Check each removed test title by hand, and never remove a test of live behavior by machine.
3. Stop exporting names that only their own file uses, and remove socket messages, flags, refusal codes and configuration keys that nothing sends, serves or reads.
4. Lower the interface ceilings, follow the deletions in the current model through the shared writer, and make sure that ADR 0072 stays correct.
5. Run the complete gate after the rebase onto feat/vello-renderer.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured with a TypeScript AST walk from process entries, browser entries and package exports. The commits removed about 8,000 lines and stopped exporting 1,169 names.

AC 2 changed. It said that a test never counts as the only caller, and AC 5 says that no test of live behavior goes. Both cannot hold, because a test of live behavior often reaches a name through its export. AC 2 now says what the pass did, and these names remain:
- 252 names run in their own file, and a test also imports them.
- 72 names have only tests as callers: 23 in codex-realtime-voice, 22 in codex-app-server, 9 in workbench, 7 in model, 4 in renderer, 2 in code-intel, 2 in server-lifecycle, and 1 each in apps/web, process and skills. They are seams that drive live code or fixtures, for example renderLegacyBoard, renderSemanticView, themeColor, iconNames, readVariantFootprint, createVariantLocality, listedLegacyBoard and talkOfFixture.
- 75 barrel names are used only by tests of another package.
- The vendored shadcn components stay as they were generated.

AC 1 has one kept exception. Nothing imports packages/renderer/src/shared/rules/render/core-guard.ts. The string that scripts/build-core.ts writes into the generated core module reaches its CoreGuard. Four .d.ts files are ambient declarations.

These stay on purpose and are not finished:
- packages/model/src/runtime/store/lock/claims.ts (claimModel, claimOn, claimWriterId, releaseClaim, takeClaimRevocation) has no production caller, but it runs through acquisition.ts, the concurrency core of the live lease. Its removal is its own change.
- model-changes.ts, use-model-changes.ts and the canvas failure state for a refresh have no sender now. Their removal means a redesign of the stale state of the legacy canvas, and live legend and camera tests use the feed.

Not checked by this pass: the deletions of test files were read by title. A machine prune that removed live tests was reset and redone by hand.

Review restored live installer and cache behavior tests. withoutOldBlock stays exported from repo-setup.ts as a test seam for repository setup. Removed the unused clipboard dependency and the unreachable refusal envelope. The source boundary guide and the voice consumer guide now describe the narrower interfaces.

Final measure at e99e1eec0: 253 names run in their own file and a test also imports them, 72 names have only tests as callers, and 75 barrel names are used only by tests of another package. Two exports have no caller on purpose: BrowserRequestActionsAreExhaustive and BrowserSnapshotDeltaKeysAreExhaustive are compile checks, and the export keeps each one alive under noUnusedLocals. The pass deleted both by mistake, and the three types of the packed voice declarations went with them. A gate failure found the three types, and a read of that diff found the two checks. All five are restored. The review also removed the refusal envelope and the clipboard dependency, and the refusal formatter left the model with them.

Final validation: bun run check exited 0 with 21 of 21 tasks successful. ADR 0072 was read against the tree and gained the diagnostic board key.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed about 8,000 lines of dead code and stopped exporting 1,169 names: unreachable files, exports with no caller, tests that only reached them, socket messages, the --expect-version flag, refusal codes and the native clipboard dependency. Interface ceilings moved down with the narrowed packages, and the model followed the deletions.

AC 2 was reworded because it conflicted with AC 5. The task notes list the kept names, and the two unfinished removals: the store-level lock claims and the model change feed. bun run check exits 0.
<!-- SECTION:FINAL_SUMMARY:END -->
