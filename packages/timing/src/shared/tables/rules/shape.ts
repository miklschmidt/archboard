// The shape of timing's private tables: a duration's name and how a wait or a
// pause reads its durations. Both halves of the tables (published.ts and
// host.ts) are written in it, each against the durations it can see.

/** The groups of durations a table names, each under the name its durations start with. */
type Groups = Readonly<Record<string, Readonly<Record<string, number>>>>;

/** Every duration of some groups, named by its group and its key, such as `"codexRealtime.stop"`. */
type NameOf<Of extends Groups> = {
	[Group in keyof Of & string]: `${Group}.${keyof Of[Group] & string}`;
}[keyof Of & string];

/** How one poll waits, on the durations it may name. */
interface WaitPolicy<Name extends string> {
	/** The bound when the caller names none. Without one, only the caller's bound or cap ends it. */
	readonly bound?: Name;
	/** The sleep between two looks; 0 is one turn of the event loop. */
	readonly cadence: Name | 0;
	/**
	 * Where the bound is checked: before each look, or after each look that found
	 * nothing, before the sleep. A wait that sleeps first checks before the sleep.
	 */
	readonly check: "beforeProbe" | "afterProbe";
	/** The first look runs whatever the time; the bound is checked before each later one. */
	readonly firstProbeFree?: true;
	/** It sleeps before each look rather than after it. */
	readonly sleepFirst?: true;
	/** It refuses only past the bound, so a look at the bound's own moment still counts. */
	readonly strict?: true;
	/**
	 * How the sleep meets the bound: in full, cut to the time left, or cut to the
	 * time left and skipped when none is left.
	 */
	readonly sleep: "full" | "cut" | "cutOrSkip";
}

/** How one pause between the passes of a loop that keeps its own decisions sleeps. */
interface PausePolicy {
	/**
	 * The shortest a pause cut to a moment sleeps. Without one, a pause with no
	 * time left before its moment does not sleep at all.
	 */
	readonly floorMs?: number;
}

export type { Groups, NameOf, PausePolicy, WaitPolicy };
