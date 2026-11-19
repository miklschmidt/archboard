// Every duration in Archboard, grouped by the subsystem that owns it, and the
// waiting that callers would otherwise write around them.
//
// A duration used to sit next to the code that consumed it. Read one at a time
// they all look independent, and they are not. So they live here, with what pulls against what written
// beside them, and the reasons are the point: the next person to halve one of
// these should not have to discover by accident what else they halved.
//
// Each owner has one frozen group, such as `MODEL_LOCK_MS` or `CODEX_PROCESS_MS`,
// in a file of its own beside this one, and the group stays inside. A duration
// is named by its owner and its key, such as `"pane.report"`. Callers do not do
// the waiting themselves (ADR 0083):
//
// - `waitUntil` polls a probe on a named wait, which keeps that wait's bound,
//   cadence and how it meets its bound.
// - `pause` sleeps one named cadence for a loop that keeps its own decisions.
// - `deadline` ends a named duration from a moment, under an optional cap; an
//   age check compares the time now with it.
// - `durationMs` reads a duration as a number, only for what takes a number and
//   is not a wait: a stylesheet, a physics constant, a timer, a library's option
//   or the words of a message.
//
// Where callers would compute from a duration, the owner's file holds that
// computation as one function, such as `codexRestartDelayMs`, and callers call it.
//
// This module is imported by the pane, the server, the CLI and the checks, so
// it stays free of `process`, `node:` imports and anything a browser does not
// have. Where a value can be overridden from the environment, the default is
// here and the override stays at the point of use, in the process that has an
// environment to read.

export { waitUntil } from "#shared/waits/wait-until.ts";
export { pause } from "#shared/waits/pause.ts";
export { deadline } from "#shared/durations/deadline.ts";
export { durationMs } from "#shared/durations/duration-ms.ts";
export { codexRestartDelayMs } from "#shared/constants/codex.ts";
export { localityDefaultSinceSeconds } from "#shared/constants/history-lens.ts";
export { columnSlideSettledMs } from "#shared/constants/column-motion.ts";
export { reachHopDelayMs } from "#shared/constants/exploring.ts";
export { painterPhasesJson } from "#shared/constants/diagram-motion.ts";
export type { Clock } from "#shared/waits/clock.ts";
export type { CadenceName, WaitName } from "#shared/waits/policies.ts";
export type { PauseOptions } from "#shared/waits/pause.ts";
export type { WaitOptions, WaitOutcome } from "#shared/waits/wait-until.ts";
export type { DurationName } from "#shared/durations/names.ts";
export type { ReadableName } from "#shared/durations/duration-ms.ts";
