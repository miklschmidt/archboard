---
id: TASK-298
title: >-
  Codex storage survives a moved state directory and a dead owner: stale locks
  taken over, a relocated config followed
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-09-22 18:26'
updated_date: '2026-09-22 18:39'
labels:
  - bug
dependencies: []
ordinal: 518000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two leftovers of a Codex home that moved or whose owner died refuse every later start, and each has been fixed by hand.

1. Dead owner lock. The owner lock inside CODEX_HOME (.archboard-codex-process.lock, src/runtime/codex-process/lib/storage.ts acquireLock) is a create-exclusive file holding the owner's pid, and nothing checks whether that pid is alive. A server that dies without its cleanup (signal 9, a crash, or on 2026-09-22 a server whose state directory the TASK-296 migration moved out from under it, so its release unlinked a path that no longer existed) leaves the lock behind and every later start is refused with 'Dedicated Codex roots are locked or colliding'. The machine held .lock.stale-* files hand-renamed on 2026-09-13, 09-19 and 09-22. A bare pid is also not an identity: after a reboot the recorded pid can belong to an unrelated process, so the lock must record the owner's kernel start time too.

2. Relocated config. config.toml is the one-line strict config archboard writes, sqlite_home = <absolute CODEX_SQLITE_HOME>. The TASK-296 migration renamed ~/.local/state/excalidraw-canvas to ~/.local/state/archboard, so the config still names the old sqlite home and ensureCanonicalConfig refuses it as a conflict: 'Codex startup refused. Pre-existing Codex config ... conflicts with the canonical sqlite_home' (reproduced 2026-09-22 by archboard start in ~/Work/Docs-Architecture-Design, exit 3). Any move of the state directory (XDG_STATE_HOME change, restore from backup) does the same.

3. Wrong recovery advice. Every storage refusal is suffixed 'Recovery: use fresh owner-controlled 0700 CODEX_HOME and CODEX_SQLITE_HOME roots', which for a lock or config refusal tells the operator to abandon the Codex home and with it the login and sessions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A start that finds the lock held by an owner that is not alive (pid absent, a zombie, or a pid now belonging to a process born at a different time) sets the stale file aside (renamed with a timestamp, never deleted) and takes the lock; a lock held by a live owner is still refused, naming the pid.
- [x] #2 The lock records the owner's pid and kernel start time; a lock in the old pid-only format is judged by the pid alone.
- [x] #3 A config that is exactly archboard's own one-line form naming a sqlite home that no longer exists is replaced by the canonical config; a config naming an existing different directory, or any other content, is still refused.
- [x] #4 Each storage refusal carries recovery advice that fits it; a lock or config refusal never tells the operator to start from fresh roots.
- [x] #5 Focused storage tests cover a dead owner's lock taken over and preserved, a live owner's lock refused, a relocated config followed and a foreign config refused.
- [x] #6 archboard start in ~/Work/Docs-Architecture-Design starts the canvas with the migrated Codex home (still signed in), and bun run check passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lock (new src/runtime/codex-process/lib/storage-lock.ts, extracted from storage.ts which hit the 600-line limit): record '<pid> <kernel start time>' via @/shared/process-observation; on EEXIST read the record, and when its owner is absent, a zombie or born at another time, rename the lock to .lock.stale-<UTC stamp>-<pid>, re-read the moved file (put it back if it is not the record judged dead, i.e. another start won the takeover) and create the lock again. Doubt (unreadable record, no observation) refuses. The refusal names the pid read from the lock.
2. Config (storage.ts ensureCanonicalConfig): a config that is exactly configTextFor(X) for an absolute X that lstat reports ENOENT is replaced by the canonical config; anything else, or our form naming an existing directory, is still config_conflict.
3. Recovery (process-spawn.ts): a Record<CodexStorageFailureCode, string> of per-code advice, so a new code fails type-check; only the path-shape codes advise fresh roots.
4. Tests in src/runtime/codex-process/tests/storage.test.ts; reproduce with archboard start in ~/Work/Docs-Architecture-Design; bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis 2026-09-22: archboard start exited 3 with config_conflict because codex-home/config.toml still read sqlite_home = "~/.local/state/excalidraw-canvas/codex-workbench/sqlite-home" after the TASK-296 move. The lock had already been set aside by hand for the third time (pids 1092386, 1800834, 250780, all dead). A server started before the migration kept its Codex writing under the old CODEX_HOME until 20:23, recreating ~/.local/state/excalidraw-canvas/codex-workbench/codex-home with only models_cache.json and an empty thread-writer-locks; the migration will not move it again because the new directory already has codex-workbench. It is a cache and was left for the user to remove. Also noticed, not fixed: the server's startup refusal is printed by the CLI but never written to archboard.log, and 244 stale server-<port>.pid files accumulate (harmless: stop never signals a pidfile pid).

Implemented per plan. Verified live: archboard start in ~/Work/Docs-Architecture-Design now answers 'Canvas server running' (pid 698354), config.toml was rewritten to the archboard sqlite home, the lock reads '698354 linux:36587587', Codex writes the migrated sqlite-home, and 'codex login status' against the migrated home says 'Logged in using ChatGPT'. storage.test.ts 12 pass; codex-process module tests 55 pass; tsc and lint:policy clean.

bun run check exit 0: module 3460 pass, system 168, repository 8, browser lanes all pass, 0 fail.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard start refused after the TASK-296 state-directory move because config.toml still named the old sqlite home, and the Codex root lock had been cleared by hand three times. Storage now (1) records the lock owner's pid and kernel start time and sets aside, never deletes, a lock whose owner is absent, a zombie or a reused pid, still refusing a live owner by pid (new storage-lock.ts); (2) follows its own one-line config when the sqlite home it named no longer exists, refusing anything else; (3) gives per-code recovery advice so a lock or config refusal no longer says to start from fresh roots. Verified by four new storage tests, bun run check (exit 0), and live: archboard start in ~/Work/Docs-Architecture-Design runs, config rewritten, Codex uses the migrated sqlite-home and reports 'Logged in using ChatGPT'.
<!-- SECTION:FINAL_SUMMARY:END -->
