// What the server process does for itself: the entry check, its pid file, whether its source and
// frontend bundle are stale, and what it reports to the launcher that started it.
export { isMainModule } from "#runtime/services/entry.ts";
export { frontendState, sourceState } from "#runtime/services/staleness.ts";
export { recordServerPid, removePidFile } from "#runtime/store/pidfile.ts";
export {
	reportStartupEnd,
	reportStartupOwnership,
} from "#runtime/protocol/server-startup-terminal.ts";
