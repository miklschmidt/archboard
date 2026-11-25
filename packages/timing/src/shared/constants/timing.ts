// Every duration in Archboard, grouped by the subsystem that owns it.
//
// A duration used to sit next to the code that consumed it. Read one at a time
// they all look independent, and they are not. So they live here, with what pulls against what written
// beside them, and the reasons are the point: the next person to halve one of
// these should not have to discover by accident what else they halved.
//
// Each owner has one frozen group, such as `MODEL_LOCK_MS` or `CODEX_PROCESS_MS`,
// in a file of its own beside this one, and the group stays inside. A caller
// asks the owner's function for one duration by its key, such as
// `paneMs("report")`. Where callers would compute from a duration, the owner's
// file holds that computation as one function, such as `codexRestartDelayMs`
// or `codexApprovalExpiresAt`, and callers call it.
//
// This module is imported by the pane, the server, the CLI and the checks, so
// it stays free of `process`, `node:` imports and anything a browser does not
// have. Where a value can be overridden from the environment, the default is
// here and the override stays at the point of use, in the process that has an
// environment to read.

// ── The server and its processes ─────────────────────────────────────────
export { modelLockMs, claimMs } from "#shared/constants/model-locks.ts";
export { serverLifecycleMs } from "#shared/constants/server-lifecycle.ts";
export { gitGroupCleanupDeadline, gitMs } from "#shared/constants/git.ts";
export { processGroupPollMs } from "#shared/constants/process-groups.ts";
export {
	codexApprovalExpiresAt,
	codexApprovalMs,
	codexContextFreshUntil,
	codexProcessMs,
	codexRealtimeMs,
	codexRestartDelayMs,
	codexSessionMs,
} from "#shared/constants/codex.ts";
export { rasterMs } from "#shared/constants/raster.ts";
export { checkMs } from "#shared/constants/checks.ts";
export { localityDefaultSinceSeconds } from "#shared/constants/history-lens.ts";
export { createElapsedClock } from "#shared/constants/elapsed-clock.ts";
export {
	recorderMs,
	recorderPageReadyDeadline,
	recorderPageReadySeconds,
	recordingMs,
} from "#shared/constants/walkthrough-recording.ts";
export { replayMs } from "#shared/constants/walkthrough-replay.ts";
export { skillEvalMs } from "#shared/constants/skill-eval.ts";
export { telemetryMs } from "#shared/constants/telemetry.ts";

// ── The browser ──────────────────────────────────────────────────────────
export { paneMs } from "#shared/constants/pane.ts";
export { modelCacheMs, shellClockMs } from "#shared/constants/shell.ts";
export { columnMs, columnSlideSettledMs, sidebarMs } from "#shared/constants/column-motion.ts";
export { exploringMs, reachHopDelayMs } from "#shared/constants/exploring.ts";
export { painterPhasesJson, pictureMs, presentationMs } from "#shared/constants/diagram-motion.ts";
export { subtitleMs, voiceMs } from "#shared/constants/voice-motion.ts";
