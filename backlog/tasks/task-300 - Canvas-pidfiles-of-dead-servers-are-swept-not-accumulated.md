---
id: TASK-300
title: 'Canvas pidfiles of dead servers are swept, not accumulated'
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-09-22 20:47'
updated_date: '2026-09-22 20:56'
labels:
  - bug
dependencies: []
ordinal: 520000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each canvas writes server-<port>.pid in the state directory and removes it on a clean exit; a server killed by SIGKILL or a crash leaves it forever. The state directory held 244 such files on 2026-09-22, most from test canvases in late August on random ports. They are harmless to stop (which never signals a pidfile pid) but pile up, and a pid-only record cannot tell its server from a later process that inherited the pid.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pidfile records the server's pid and kernel start time; readers that want the pid still get it.
- [x] #2 A canvas that starts listening removes every server-*.pid whose recorded process is gone (absent, a zombie, or born at another time), and never one whose server is alive.
- [x] #3 The owner-record logic is shared with the Codex root lock (TASK-298) instead of written twice.
- [x] #4 A focused test covers a dead server's pidfile removed and a live one kept.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/shared/process-observation/lib/owner-record.ts: ownerRecord(pid) writes '<pid> <kernel start time>' (pid alone where the host cannot observe), recordedOwnerIsGone(record) is true only when the pid is absent, a zombie or born at another time, recordedOwnerPid(record) reads the pid back. Exported from the module index.
2. storage-lock.ts uses them instead of its own copies.
3. pidfile.ts: writePidFile writes ownerRecord(pid); readPidFile keeps returning the pid; sweepDeadPidFiles() removes every server-<port>.pid whose owner is gone. canvas-resources calls it right after writing its own pidfile.
4. Tests: owner-record unit test beside the observation tests is unnecessary, the storage lock tests already cover the record; a pidfile test with a temporary state directory covers a dead server's file removed, a reused pid removed, a live one kept, and the pid still read back.
5. Sweep the operator's 244 stale files by starting the canvas; bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner-record logic moved to @/shared/process-observation (ownerRecord, recordedOwnerIsGone, recordedOwnerPid) in index.ts, since readProcessObservation lives there and a lib file importing index would cycle; storage-lock.ts dropped its copies. pidfile.ts writes the record, readPidFile reads the pid through recordedOwnerPid, sweepDeadPidFiles removes server-<port>.pid files whose owner is gone and is called by canvas-resources right after the canvas writes its own. Ran the sweep once on the operator's state directory: 243 of 245 removed; kept the live 3100 canvas and server-35923.pid, a pid-only file whose pid is now a Chrome renderer, which doubt keeps by design (removable by hand). bun run check exit 0, 0 failures in every lane.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pidfiles record pid and kernel start time, and a canvas that starts listening removes every server-*.pid whose owner is absent, a zombie or a reused pid, never a live one. The owner record is shared with the Codex root lock. Verified by a new pidfile test (dead, reused and live files), the storage lock tests, bun run check, and a live sweep of 243 stale files.
<!-- SECTION:FINAL_SUMMARY:END -->
