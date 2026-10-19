// The trail a pane's reader drilled along, as a pure reducer (ADR 0050).
//
// The pane holds one board, the one the shell pointed it at. A drill-down in
// its own vault stacks another board on top of it, which the pane reads in
// place. A drill-down into another repository cannot be read in place: the pane
// is in one vault at a time and only the server moves it, so the reader asks
// the shell to show that board there, and the trail waits. When the pane
// arrives on the board it asked for, the boards it came through are kept
// before the pane's new board. Any other arrival is somebody else pointing the
// pane, and the trail is a history of a different pane, so it goes.
//
// The list of stops is `before`, then the pane's own board, then `above`.
// Every stop of `above` is in the pane's own vault, because leaving it is a
// move of the pane.

/** One board a pane has been looking at. */
interface DrillStop {
	/** The board name. */
	readonly board: string;
	/** A variant id or name, or undefined for the board's current variant. */
	readonly variant: string | undefined;
	/** The vault the board is in. */
	readonly vault: string;
	/** The repository identity of that vault, or null when it has none or is not known. */
	readonly repository: string | null;
}

/** A trail, and the dive it is waiting on. */
interface DrillTrail {
	/** The boards the reader came through before the pane's own board, from another vault or board. */
	readonly before: readonly DrillStop[];
	/** The boards the reader drilled into on top of the pane's own board, in its vault. */
	readonly above: readonly DrillStop[];
	/** The board the reader asked the shell to show, and the stops to keep before it once it is shown. */
	readonly pending: { readonly stop: DrillStop; readonly before: readonly DrillStop[] } | null;
}

/** A trail that has gone nowhere. */
const NO_TRAIL: DrillTrail = { before: [], above: [], pending: null };

/** A step of the trail, and the board the shell must show for it, if any. */
interface TrailStep {
	readonly trail: DrillTrail;
	/** The board to ask the shell to show: the step leaves the pane's vault, or its own board. */
	readonly dive: DrillStop | null;
}

/**
 * Every stop, the pane's own board among them.
 * @param trail The trail.
 * @param own The pane's own board.
 * @returns The stops, first to last.
 */
function stopsOf(trail: DrillTrail, own: DrillStop): readonly DrillStop[] {
	return [...trail.before, own, ...trail.above];
}

/**
 * Follow a drill-down from the board on screen.
 * @param trail The trail.
 * @param own The pane's own board.
 * @param stop The board the drill-down leads to.
 * @returns The trail, and the board to show when it is in another vault.
 */
function drillInto(trail: DrillTrail, own: DrillStop, stop: DrillStop): TrailStep {
	if (stop.vault === own.vault) {
		return { trail: { ...trail, above: [...trail.above, stop], pending: null }, dive: null };
	}
	return { trail: { ...trail, pending: { stop, before: stopsOf(trail, own) } }, dive: stop };
}

/**
 * Go back to one of the boards the reader came through.
 * @param trail The trail.
 * @param own The pane's own board.
 * @param depth Where it is among the stops: 0 is the first.
 * @returns The trail, and the board to show when the stop is before the pane's own board.
 */
function drillBack(trail: DrillTrail, own: DrillStop, depth: number): TrailStep {
	const kept = depth - trail.before.length;
	if (kept >= 0) {
		return { trail: { ...trail, above: trail.above.slice(0, kept), pending: null }, dive: null };
	}
	const stop = trail.before[depth];
	if (stop === undefined) return { trail, dive: null };
	// A trail that came back to the board the pane holds: the shell would not
	// move the pane, so nothing would arrive. The pane is there already.
	if (sameBoard(stop, own) && stop.variant === own.variant) {
		return {
			trail: { before: trail.before.slice(0, depth), above: [], pending: null },
			dive: null,
		};
	}
	return {
		trail: { ...trail, pending: { stop, before: trail.before.slice(0, depth) } },
		dive: stop,
	};
}

/**
 * The shell pointed the pane at a board. When it is the one the trail asked
 * for, the trail is kept before it; otherwise the trail is somebody else's.
 * @param trail The trail.
 * @param own The board the pane holds now.
 * @returns The trail.
 */
function drillArrived(trail: DrillTrail, own: DrillStop): DrillTrail {
	const { pending } = trail;
	return pending !== null && sameBoard(pending.stop, own)
		? { before: pending.before, above: [], pending: null }
		: NO_TRAIL;
}

/**
 * Whether two stops are one board in one vault. A board name is matched as the
 * server matches it, without case.
 * @param a One stop.
 * @param b The other.
 * @returns Whether they are the same board.
 */
function sameBoard(a: DrillStop, b: DrillStop): boolean {
	return a.vault === b.vault && a.board.toLowerCase() === b.board.toLowerCase();
}

/**
 * The shell could not show a board the trail asked for: the trail stays where
 * it was. A refusal answers one dive, so a later dive the trail waits on now
 * still waits.
 * @param trail The trail.
 * @param stop The board the refused dive asked for.
 * @returns The trail, no longer waiting on that dive.
 */
function drillRefused(trail: DrillTrail, stop: DrillStop): DrillTrail {
	return trail.pending?.stop === stop ? { ...trail, pending: null } : trail;
}

export {
	NO_TRAIL,
	drillArrived,
	drillBack,
	drillInto,
	drillRefused,
	stopsOf,
	type DrillStop,
	type DrillTrail,
	type TrailStep,
};
