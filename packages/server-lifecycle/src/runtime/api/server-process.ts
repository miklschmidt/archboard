// What the server process does for itself: record and release its pid file, report to the
// launcher that started it, and say which code it runs and whether a tab runs older code.
export { serverCodeState, staleFrontend } from "#runtime/services/staleness.ts";
export { recordServerPid, releaseServerPid } from "#runtime/store/pidfile.ts";
export {
	reportStartupEnd,
	reportStartupOwnership,
} from "#runtime/protocol/server-startup-terminal.ts";
