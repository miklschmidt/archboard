---
id: TASK-325
title: stop never orphans a live server it does not recognize
status: Done
assignee:
  - '@implementer'
created_date: '2026-09-24 01:07'
updated_date: '2026-10-11 14:25'
labels:
  - cli
dependencies: []
priority: medium
type: bug
ordinal: 560000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the health service name changed (TASK-324), archboard stop run by the new CLI against a server started by the old code answered "Archboard server is not running; stale pidfile removed (pid 2428646)" while that pid was alive and listening on the port, and start then refused because the port was taken. The pidfile was deleted without stopping anything, so the server was orphaned until it was killed by hand (2026-09-24). A pidfile whose process is alive and holds the port is not stale, whatever its health check answers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 stop keeps the pidfile of a process that is alive, and says what answers there and how to stop it, instead of reporting nothing running
- [x] #2 A pidfile whose process is gone is still removed as stale
- [x] #3 One owner proves both
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. pidfile.ts: add removePidFileIfOwnerGone(port) reusing removeIfOwnerGone (pid + kernel start time). 2. spawn.ts absentServerResult: remove the pidfile only when the owner is gone; otherwise keep it and throw naming the pid, that it holds a pidfile but does not answer as this server, and how to end it (kill pid). foreignServiceError path unchanged. 3. One test in pidfile.test.ts: live child pid keeps the file and throws; exited pid removes it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Absent path of stopServer now removes the pidfile only when the recorded owner is gone (pid dead or reused, via recordedOwnerIsGone); a live owner keeps the file and stop throws naming the pid and 'kill <pid>'. Decision: no listening-socket check (live recorded pid that does not answer is enough; also covers a server still starting or stopping). foreignServiceError path unchanged. Owner: src/runtime/engine/tests/pidfile.test.ts (live child + exited child against a silent port).

Review fixes: a server that is shutting down stops answering before it removes its pidfile, so stop waits up to SERVER_STOP_PIDFILE_WAIT_MS (2x SERVER_HTTP_STOP_GRACE_MS) for the owner to exit or the file to go before it reports the process as stuck. A pidfile with no recorded start time words the error as 'may be' and advises ps -p before kill. Timing constants moved to timing/lib/server-stop.ts because timing.ts is at its line limit. AC1 reworded to 'alive': the listening socket is deliberately not checked.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
stop no longer deletes the pidfile of a live process that does not answer /health. absentServerResult keeps the pidfile when its owner is alive (pid and kernel start time, so a recycled pid counts as gone) and throws an error naming the pid, the port and the kill-then-stop recovery; a dead owner's pidfile is still removed and reported as before. Verified by src/runtime/engine/tests/pidfile.test.ts (real child process: live case keeps the file and rejects, dead case removes it), red under the old unconditional removal. Not checked: that the live pid holds the port.
<!-- SECTION:FINAL_SUMMARY:END -->
