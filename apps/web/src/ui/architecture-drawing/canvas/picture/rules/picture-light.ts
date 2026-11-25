// How a picture stands in the light, as the painter reads it. The marks say
// what is lit, and this says how strongly each part of the picture shows.

import { ms } from "@archboard/timing";

/** How strongly the picture lights a poked part's connections. */
type ProbeMode = "pick" | "hover";

/** What is receding from a part picked out, and from a part the pointer rests on. */
const RECEDE: Readonly<Record<ProbeMode, number>> = { pick: 0.14, hover: 0.24 };

/** What recedes behind a presented step. */
const PRESENTED_VEIL = 0.16;

/** What recedes behind a veil that is not presented, and a label behind any light. */
const QUIET_VEIL = 0.28;

/** How strongly a trace's second hop, its third, and each hop after show. */
const REACH: readonly number[] = [0.78, 0.6, 0.46];

/** The state the light is read from. */
interface LightState {
	readonly probing: ProbeMode | null;
	readonly veiled: boolean;
	readonly presenting: boolean;
	/** What stands in the light. */
	readonly standing: ReadonlySet<string> | null;
	/** How many hops beyond the first each subject a trace reached is. */
	readonly reach: ReadonlyMap<string, number> | null;
	readonly reducedMotion: boolean;
}

/**
 * How long a part that a trace reaches waits before it lights: one hop's wait for each hop beyond
 * the first, so what a part reaches lights outward from it, nearest first.
 * @param hops How many hops away the part is, 1 for a direct neighbour.
 * @returns The wait, in milliseconds.
 */
function reachDelay(hops: number): number {
	return (hops - 1) * ms("exploring.reachHop");
}

/**
 * How one lit subject shows.
 * @param hops How many hops from the part it is, 1 for what the part touches.
 * @returns Its opacity, and how long it waits to show so.
 */
function shineOf(hops: number): { opacity: number; delay: number } {
	const grade = Math.min(hops, REACH.length + 1);
	return grade < 2
		? { opacity: 1, delay: 0 }
		: { opacity: REACH[grade - 2] ?? 1, delay: reachDelay(grade) };
}

/**
 * What everything out of the light shows at, and how long the change takes.
 * @param state The state.
 * @returns The opacity of the rest and of labels, and the milliseconds.
 */
function restOf(state: LightState): { rest: number; labels: number; duration: number } {
	if (state.veiled && state.presenting) {
		return { rest: PRESENTED_VEIL, labels: QUIET_VEIL, duration: ms("presentation.step") };
	}
	if (state.veiled) return { rest: QUIET_VEIL, labels: QUIET_VEIL, duration: 0 };
	if (state.probing === null) {
		return { rest: 1, labels: 1, duration: ms("exploring.lightingFade") };
	}
	return {
		rest: RECEDE[state.probing],
		labels: QUIET_VEIL,
		duration: ms("exploring.lightingFade"),
	};
}

/**
 * How a picture stands in the light.
 * @param state The state.
 * @returns The light, in the painter's terms.
 */
function pictureLight(state: LightState) {
	const { rest, labels, duration } = restOf(state);
	const receding = state.veiled || state.probing !== null;
	const standing = receding ? [...(state.standing ?? [])] : [];
	return {
		rest,
		labels,
		duration: state.reducedMotion ? 0 : duration,
		subjects: Object.fromEntries(
			standing.map((id) => [id, shineOf(state.reach?.get(id) ?? 1)] as const),
		),
	};
}

export { pictureLight, reachDelay, type LightState, type ProbeMode };
