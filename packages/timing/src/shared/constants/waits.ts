// Every duration of Archboard, each declared once with its use (`uses.ts`), grouped by the
// subsystem that owns it in a file of its own beside this one. The names a caller may pass to each
// operation of `timing` are derived here from those uses.

import type { Use } from "#shared/constants/uses.ts";
import { CHECKS } from "#shared/constants/checks.ts";
import { CODEX } from "#shared/constants/codex.ts";
import { GIT } from "#shared/constants/git.ts";
import { CLAIMS, MODEL_LOCKS } from "#shared/constants/model-locks.ts";
import { RASTER } from "#shared/constants/raster.ts";
import { SERVER_LIFECYCLE } from "#shared/constants/server-lifecycle.ts";
import { TELEMETRY } from "#shared/constants/telemetry.ts";
import { RECORDER, RECORDING } from "#shared/constants/walkthrough-recording.ts";
import { REPLAY } from "#shared/constants/walkthrough-replay.ts";

/** Every declared duration, by its name. */
const WAITS = Object.freeze({
	...SERVER_LIFECYCLE,
	...GIT,
	...CHECKS,
	...CODEX,
	...RASTER,
	...MODEL_LOCKS,
	...CLAIMS,
	...TELEMETRY,
	...RECORDING,
	...RECORDER,
	...REPLAY,
}) satisfies Readonly<Record<string, Use>>;

type Waits = typeof WAITS;

/**
 * How long a declared duration is.
 * @param wait Its name.
 * @returns Its length, in milliseconds.
 */
function lengthOf(wait: keyof Waits): number {
	return WAITS[wait].ms;
}

/** The names whose declared use is one of `Kind`. */
type NamesOf<Kind extends Use["use"]> = {
	[Name in keyof Waits]: Waits[Name]["use"] extends Kind ? Name : never;
}[keyof Waits];

/** A bound on one piece of work: the names `within` accepts. */
type Bound = NamesOf<"bound">;
/** A condition looked at until it holds: the names `pollUntil` accepts. */
type Polled = NamesOf<"polled">;
/** A delay before something runs once: the names `after` accepts. */
type Delay = NamesOf<"delay">;
/** A cadence: the names `every` accepts. */
type Tick = NamesOf<"tick">;
/** A span from a stamp: the names `expiresAt` and `lapsed` accept. */
type Span = NamesOf<"span">;
/** A doubling delay: the names `backoff` accepts. */
type Backoff = NamesOf<"backoff">;
/** A duration another owner needs as a number: names `ms` accepts. */
type Handed = NamesOf<"handed">;
/** How long a motion takes: names `ms` accepts. */
type Motion = NamesOf<"motion">;
/** A duration `ms` reads: one handed to another owner, or a motion. */
type Readable = NamesOf<"handed" | "motion">;
/** A wait whose end is a timeout: the names a `TimedOut` names. */
type Timeout = NamesOf<"bound" | "polled" | "span" | "delay">;
/** Every declared name. */
type Wait = keyof Waits;

export { lengthOf, WAITS };
export type { Backoff, Bound, Delay, Handed, Motion, Polled, Readable, Span, Tick, Timeout, Wait };
