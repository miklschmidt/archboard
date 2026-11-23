// Every duration in Archboard, and the waiting done with it.
//
// A duration used to sit next to the code that consumed it. Read one at a time
// they all look independent, and they are not. So they live here, with what pulls
// against what written beside them, and the reasons are the point: the next person
// to halve one of these should not have to discover by accident what else they halved.
// The relations the code relies on are data that one test checks (`relations.ts`).
//
// A caller does not read a duration to wait with it. Each duration is declared once with
// its use (`uses.ts`), and its name is accepted only by the operation that serves that use:
// `within` bounds work, `pollUntil` looks again until a condition holds, `after` and `every`
// run something later or at a cadence, `expiresAt` and `lapsed` measure spans from a stamp,
// and `backoff` spaces out retries. The deadline arithmetic, the timers and their cleanup, the
// poll loops and their cadence, and the wording of a timeout live behind these operations.
// `ms` reads a number only for a duration handed to another owner and for a motion.
//
// The operations run on the ambient timers, which Bun's fake timers drive in a test and the
// stepped clock drives in a recording. Each of their timers carries the name of its wait, so a
// test preload can shorten one by name.
//
// This module is imported by the pane, the server, the CLI and the checks, so
// it stays free of `process`, `node:` imports and anything a browser does not
// have. Where a value can be overridden from the environment, the default is
// here and the override stays at the point of use, in the process that has an
// environment to read, and reaches `within` as its `ms` option.

export { within } from "#shared/operations/within.ts";
export { pollUntil } from "#shared/operations/poll-until.ts";
export { after, every } from "#shared/operations/timers.ts";
export { backoff, expiresAt, lapsed, ms } from "#shared/operations/spans.ts";
export { TimedOut } from "#shared/operations/timed-out.ts";
export { createElapsedClock } from "#shared/constants/elapsed-clock.ts";
export { painterPhasesJson } from "#shared/constants/diagram-motion.ts";
export type {
	Backoff,
	Bound,
	Delay,
	Handed,
	Motion,
	Polled,
	Span,
	Tick,
	Timeout,
	Wait,
} from "#shared/constants/waits.ts";
