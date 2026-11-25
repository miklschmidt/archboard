import { lengthOf, type Timeout, WAITS } from "#shared/constants/waits.ts";

/** One length in a unit a person reads, with at most one decimal. */
const UNITS = [
	{ name: "h", ms: 3_600_000 },
	{ name: "min", ms: 60_000 },
	{ name: "s", ms: 1000 },
] as const;

/**
 * A duration as a person reads it: "250 ms", "1.5 s", "2 min", "4 h".
 * @param ms The duration.
 * @returns Its words.
 */
function spoken(ms: number): string {
	const unit = UNITS.find((each) => ms >= each.ms);
	if (unit === undefined) return `${ms} ms`;
	return `${Math.round((ms / unit.ms) * 10) / 10} ${unit.name}`;
}

/**
 * A wait that ran out. Its message reads the same for every wait: how long it took and what it
 * waited for. The caller adds what it knows, such as the process it waited on and what to do next.
 * A timeout says only that the time ran out: it never proves that the work it bounded stopped.
 */
class TimedOut extends Error {
	/** The wait that ran out. */
	readonly wait: Timeout;

	/**
	 * Say that a wait ran out.
	 * @param wait The wait that ran out.
	 * @param ms How long it ran, when the caller overrode its declared length.
	 */
	constructor(wait: Timeout, ms: number = lengthOf(wait)) {
		const declared: { readonly waitingFor?: string } = WAITS[wait];
		super(`Timed out after ${spoken(ms)} waiting for ${declared.waitingFor ?? wait}.`);
		this.name = "TimedOut";
		this.wait = wait;
	}
}

export { TimedOut };
