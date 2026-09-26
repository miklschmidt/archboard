// Label boxes that share one stretch of a band, placed together (TASK-349):
// in the order Graphviz stood them, or in the order of where they want to be
// when that crosses fewer lines, spaced, so that the fewest lines jog at their
// labels, then each as near where it wants to be as that allows. A port moved
// after Graphviz ranked its block can leave one label's line on the far side
// of another's, and the line then hooks back to its card.
import { LABEL_LABEL_CLEARANCE } from "@/transformers/semantic-renderer/config";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Item } from "@/transformers/semantic-renderer/lib/track/scene";

/** A label box that may slide, where it wants its centre, and where its line reaches it straight. */
interface Slider {
	readonly item: Item;
	readonly wanted: number;
	/** The x its line reaches it at straight from the station above, and from the one below. */
	readonly reaches: readonly (readonly [number, number])[];
	/** Where its line leaves the station above and enters the one below. */
	readonly ends: readonly [number, number];
}

/** A placement's cost: how many lines jog at their labels, how many of those jogs are too short to turn whole, then how far the boxes stand from where they want to be. */
type Cost = readonly [number, number, number];

/** The shortest jog a line turns with two whole bends and a straight run between them. */
const WHOLE_JOG = 2 * LANE;

/** How far outside a reach still counts as in it: rounding, not a jog. */
const TOLERANCE = 1e-6;

/**
 * What one box costs standing at one centre.
 * @param slider The box.
 * @param centre Its centre.
 * @returns How many of its two lines jog there, and how far it stands from its wanted centre.
 */
function costAt(slider: Slider, centre: number): Cost {
	const off = slider.reaches.map(([low, high]) => Math.max(low - centre, centre - high, 0));
	return [
		off.filter((d) => d > TOLERANCE).length,
		off.filter((d) => d > TOLERANCE && d < WHOLE_JOG - TOLERANCE).length,
		Math.abs(centre - slider.wanted),
	];
}

/**
 * Whether one cost is lower than another: fewer jogs, then less displacement.
 * @param one A cost.
 * @param other Another.
 * @returns True when the first is lower.
 */
function cheaper(one: Cost, other: Cost): boolean {
	if (one[0] !== other[0]) return one[0] < other[0];
	if (one[1] !== other[1]) return one[1] < other[1];
	return one[2] < other[2] - TOLERANCE;
}

/** Where the boxes of one stretch stand, in their order, and what that costs. */
interface RunPlan {
	readonly sliders: readonly Slider[];
	readonly centres: readonly number[];
	readonly cost: Cost;
}

/**
 * Where boxes that share one stretch would stand: in their order, spaced, so
 * that the fewest lines jog, then each as near its wanted centre as that
 * allows. A box's cost changes only at its reaches' edges and its wanted
 * centre, so some best placement has every box at one of those points of its
 * own or of a box packed against it; each box tries them all, carried along
 * the packed row, and keeps the cheapest left neighbour that leaves it room.
 * @param sliders The boxes, left to right.
 * @param low The stretch's left edge.
 * @param high The stretch's right edge.
 * @returns The plan, or nothing when the boxes do not fit.
 */
function planRun(sliders: readonly Slider[], low: number, high: number): RunPlan | undefined {
	const widths = sliders.map(({ item }) => item.box.width);
	const gaps = widths.map((width, index) =>
		index === 0 ? 0 : (widths[index - 1]! + width) / 2 + LABEL_LABEL_CLEARANCE,
	);
	const offsets = gaps.map((_, index) =>
		gaps.slice(0, index + 1).reduce((sum, gap) => sum + gap, 0),
	);
	const first = low + widths[0]! / 2;
	const last = high - widths.at(-1)! / 2 - offsets.at(-1)!;
	if (last < first) return undefined;
	const anchors = [
		first,
		last,
		...sliders.flatMap((slider, index) =>
			[
				slider.wanted,
				...slider.reaches.flatMap(([one, other]) => [
					one - WHOLE_JOG,
					one,
					other,
					other + WHOLE_JOG,
				]),
			].map((x) => x - offsets[index]!),
		),
	];
	type Step = { centre: number; cost: Cost; from: number };
	const steps: Step[][] = [];
	sliders.forEach((slider, index) => {
		const centres = [
			...new Set(anchors.map((x) => Math.min(last, Math.max(first, x)) + offsets[index]!)),
		];
		steps.push(
			centres.flatMap((centre): Step[] => {
				const own = costAt(slider, centre);
				if (index === 0) return [{ centre, cost: own, from: -1 }];
				let best: Step | undefined;
				let from = -1;
				steps[index - 1]!.forEach((step, at) => {
					if (step.centre > centre - gaps[index]! + TOLERANCE) return;
					if (best === undefined || cheaper(step.cost, best.cost)) [best, from] = [step, at];
				});
				return best === undefined
					? []
					: [
							{
								centre,
								cost: [best.cost[0] + own[0], best.cost[1] + own[1], best.cost[2] + own[2]],
								from,
							},
						];
			}),
		);
	});
	let at = steps
		.at(-1)!
		.reduce((best, step, index, all) => (cheaper(step.cost, all[best]!.cost) ? index : best), 0);
	const cost = steps.at(-1)![at]!.cost;
	const centres: number[] = [];
	for (let index = sliders.length - 1; index >= 0; index -= 1) {
		const step = steps[index]![at]!;
		centres.unshift(step.centre);
		at = step.from;
	}
	return { sliders, centres, cost };
}

/**
 * How many pairs of boxes in an order stand their lines across each other:
 * one box left of another whose line comes from, or goes on to, further left.
 * @param sliders The boxes, left to right.
 * @returns The count.
 */
function crossingsIn(sliders: readonly Slider[]): number {
	return sliders.reduce(
		(sum, one, index) =>
			sum +
			sliders
				.slice(index + 1)
				.reduce(
					(more, other) => more + one.ends.filter((x, end) => x > other.ends[end]! + 0.5).length,
					0,
				),
		0,
	);
}

/**
 * Place boxes that share one stretch in the order Graphviz stood them, or in
 * the order of where they want to be when that crosses no more lines and
 * jogs fewer or moves them less: a port settled after Graphviz ranked the
 * block can stand a label's line on the far side of another label's.
 * @param sliders The boxes.
 * @param low The stretch's left edge.
 * @param high The stretch's right edge.
 */
function placeRun(sliders: readonly Slider[], low: number, high: number): void {
	const plans = [
		sliders.toSorted((one, other) => one.item.box.x - other.item.box.x),
		sliders.toSorted(
			(one, other) => one.wanted - other.wanted || one.item.box.x - other.item.box.x,
		),
	].flatMap((order) => planRun(order, low, high) ?? []);
	const plan = plans.reduce<RunPlan | undefined>((best, one) => {
		if (best === undefined) return one;
		const [crossed, least] = [crossingsIn(one.sliders), crossingsIn(best.sliders)];
		return crossed < least || (crossed === least && cheaper(one.cost, best.cost)) ? one : best;
	}, undefined);
	plan?.sliders.forEach(({ item }, index) => {
		item.box = { ...item.box, x: plan.centres[index]! - item.box.width / 2 };
	});
}

export { placeRun, type Slider };
