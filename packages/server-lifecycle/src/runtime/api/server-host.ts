// What the server process does for itself: the entry check, its pid file, and whether its source and frontend bundle are stale.
export { isMainModule } from "#runtime/services/entry.ts";
export { frontendState, sourceState } from "#runtime/services/staleness.ts";
export { removePidFile, sweepDeadPidFiles, writePidFile } from "#runtime/store/pidfile.ts";
