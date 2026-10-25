// Every duration in Archboard, grouped by the subsystem that owns it.
//
// A duration used to sit next to the code that consumed it. Read one at a time
// they all look independent, and they are not: ADR 0016 is where that stopped
// being tolerable. So they live here, with what pulls against what written
// beside them, and the reasons are the point: the next person to halve one of
// these should not have to discover by accident what else they halved.
//
// Each owner has one frozen group, such as `BOARD_LOCK_MS` or `CODEX_PROCESS_MS`,
// in a file of its own beside this one. A caller imports its owner's group and
// reads a key of it. A value with one owner and no siblings stays one named
// constant. Where callers would repeat a computation from a group, the owner's
// file holds it as one function, such as `codexRestartDelayMs`.
//
// This module is imported by the pane, the server, the CLI and the checks, so
// it stays free of `process`, `node:` imports and anything a browser does not
// have. Where a value can be overridden from the environment, the default is
// here and the override stays at the point of use, in the process that has an
// environment to read.

// ── The server and its processes ─────────────────────────────────────────
export { BOARD_LOCK_MS, CLAIM_MS } from "#shared/constants/board-locks.ts";
export { SERVER_LIFECYCLE_MS } from "#shared/constants/server-lifecycle.ts";
export {
	CLI_INTERRUPT_CLEANUP_MS,
	GIT_MS,
	PROCESS_GROUP_OBSERVATION_POLL_MS,
} from "#shared/constants/git.ts";
export {
	CODEX_APPROVAL_MS,
	CODEX_PROCESS_MS,
	CODEX_REALTIME_MS,
	CODEX_SESSION_MS,
	TAB_SESSION_GRACE_MS,
	codexRestartDelayMs,
} from "#shared/constants/codex.ts";
export {
	HEADLESS_CHROMIUM_CALL_MS,
	IMAGE_CLIPBOARD_MS,
	SEMANTIC_RASTER_CLEANUP_MS,
	SEMANTIC_RASTER_JOB_TIMEOUT_MS,
	SEMANTIC_RASTER_STARTUP_TIMEOUT_MS,
} from "#shared/constants/raster.ts";
export { LANGUAGE_SERVER_STOP_MS } from "#shared/constants/code-check.ts";
export { LOCALITY_DEFAULT_PERIOD_MS } from "#shared/constants/history-lens.ts";
export { createElapsedClock } from "#shared/constants/elapsed-clock.ts";
export { RECORDER_MS, RECORDING_MS } from "#shared/constants/walkthrough-recording.ts";
export { REPLAY_MS } from "#shared/constants/walkthrough-replay.ts";
export { SKILL_EVAL_MS } from "#shared/constants/skill-eval.ts";

// ── The browser ──────────────────────────────────────────────────────────
export { PANE_MS } from "#shared/constants/pane.ts";
export { BOARD_CACHE_MS, SHELL_CLOCK_MS } from "#shared/constants/shell.ts";
export { COLUMN_MS, SIDEBAR_MS } from "#shared/constants/column-motion.ts";
export { EXPLORING_MS } from "#shared/constants/exploring.ts";
export {
	FAR_VIEW_SWAP_MS,
	FLOW_CYCLE_CAP_MS,
	PICTURE_ENTRY_PHASES,
	PICTURE_MS,
	PICTURE_TRANSITION_PHASES,
	PRESENTATION_MS,
} from "#shared/constants/diagram-motion.ts";
export { SUBTITLE_MS, VOICE_MS } from "#shared/constants/voice-motion.ts";
