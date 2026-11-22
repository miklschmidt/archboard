// How a duration is used. Each duration is declared once, with its use, and its name is then
// accepted only by the one operation of `timing` that serves that use: a bound by `within`, a
// polled wait by `pollUntil`, a delay by `after`, a tick by `every`, a span by `expiresAt` and
// `lapsed`, a backoff by `backoff`, and a duration handed to another owner or a motion by `ms`.
// So a polled wait cannot be read as a number, and a caller cannot build its own loop around it.

/** A bound on one piece of work, which `within` races the work against. */
interface BoundUse {
	readonly use: "bound";
	readonly ms: number;
	/** What the work is, as the end of "Timed out after 5 s waiting for …". */
	readonly waitingFor: string;
}

/** A condition `pollUntil` looks at again until it holds or the wait ends. */
interface PolledUse {
	readonly use: "polled";
	readonly ms: number;
	/** What the wait is for, as the end of "Timed out after 5 s waiting for …". */
	readonly waitingFor: string;
}

/** A delay before something runs once, which `after` schedules. */
interface DelayUse {
	readonly use: "delay";
	readonly ms: number;
}

/** A cadence something runs at, which `every` keeps. */
interface TickUse {
	readonly use: "tick";
	readonly ms: number;
}

/**
 * A span of time measured from a stamp: when something stamped now expires (`expiresAt`), and
 * whether the span since a stamp has run out (`lapsed`). A span that a person waits out also says
 * what was waited for, so its timeout reads as every other one does.
 */
interface SpanUse {
	readonly use: "span";
	readonly ms: number;
	readonly waitingFor?: string;
}

/** A delay that doubles after each failed attempt, from its base up to its cap. */
interface BackoffUse {
	readonly use: "backoff";
	readonly ms: number;
	readonly max: number;
}

/** A duration another owner needs as a number: a library option, a painter, a protocol field. */
interface HandedUse {
	readonly use: "handed";
	readonly ms: number;
}

/** How long a motion a person watches takes. */
interface MotionUse {
	readonly use: "motion";
	readonly ms: number;
}

type Use = BoundUse | PolledUse | DelayUse | TickUse | SpanUse | BackoffUse | HandedUse | MotionUse;

/**
 * Declare a bound on one piece of work.
 * @param ms How long the work may take.
 * @param waitingFor What the work is, for its timeout message.
 * @returns The declaration.
 */
function bound(ms: number, waitingFor: string): BoundUse {
	return { use: "bound", ms, waitingFor };
}

/**
 * Declare a wait that looks again until its condition holds.
 * @param ms How long the wait may take.
 * @param waitingFor What the wait is for, for its timeout message.
 * @returns The declaration.
 */
function polled(ms: number, waitingFor: string): PolledUse {
	return { use: "polled", ms, waitingFor };
}

/**
 * Declare a delay before something runs once.
 * @param ms The delay.
 * @returns The declaration.
 */
function delay(ms: number): DelayUse {
	return { use: "delay", ms };
}

/**
 * Declare a cadence.
 * @param ms The time between two runs.
 * @returns The declaration.
 */
function tick(ms: number): TickUse {
	return { use: "tick", ms };
}

/**
 * Declare a span measured from a stamp.
 * @param ms How long the span runs.
 * @param waitingFor What a person waits for while it runs, when its end is a timeout.
 * @returns The declaration.
 */
function span(ms: number, waitingFor?: string): SpanUse {
	return waitingFor === undefined ? { use: "span", ms } : { use: "span", ms, waitingFor };
}

/**
 * Declare a delay that doubles after each failed attempt.
 * @param ms The first delay.
 * @param max The longest delay.
 * @returns The declaration.
 */
function backoff(ms: number, max: number): BackoffUse {
	return { use: "backoff", ms, max };
}

/**
 * Declare a duration another owner needs as a number.
 * @param ms The duration.
 * @returns The declaration.
 */
function handed(ms: number): HandedUse {
	return { use: "handed", ms };
}

/**
 * Declare how long a motion takes.
 * @param ms The duration.
 * @returns The declaration.
 */
function motion(ms: number): MotionUse {
	return { use: "motion", ms };
}

export { backoff, bound, delay, handed, motion, polled, span, tick };
export type { Use };
