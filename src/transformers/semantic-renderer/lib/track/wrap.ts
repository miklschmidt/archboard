// Wrapping the track engine's widest rank (TASK-349). A board whose ranks run
// wider than the page reads better when its widest rank of cards is dealt out
// over two to four staggered rows. Each way is placed and routed here, where
// the layout engines run, and the one that fits the reference pane best is
// kept; the router then draws it where the drawing is painted.
import type { ElkNode } from "@archboard/elk-rs";
import type { Point } from "@/transformers/semantic-renderer/lib/geometry";
import type { Viz } from "@viz-js/viz";
import { REFERENCE_PANE, fitIn } from "@/shared/shell-geometry/index";
import { TrackPlacement } from "@/transformers/semantic-renderer/lib/track/placement";
import {
	PAGE_MARGIN,
	routeScene,
	trunkKind,
} from "@/transformers/semantic-renderer/lib/track/route";
import { Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** How much better a wrap must fit the page than the board unwrapped. */
const WORTH_WRAPPING = 1.1;
/** The fewest cards a rank holds before wrapping it is worth trying. */
const MIN_WRAPPED = 4;
/** What one crossing costs a layout, as the share of its fit it keeps. */
const CROSSING_COST = 0.97;

/** A placement, routed: its scene, the page it needs and how many times its lines cross. */
interface Routed {
	readonly placed: ElkNode;
	readonly scene: Scene;
	readonly width: number;
	readonly height: number;
	readonly crossings: number;
}

/** A straight run of one line. */
interface Run {
	readonly line: number;
	readonly from: Point;
	readonly to: Point;
}

/**
 * Whether a value lies strictly between two others, clear of both.
 * @param value The value.
 * @param one One end.
 * @param other The other end.
 * @returns True when it is inside.
 */
function inside(value: number, one: number, other: number): boolean {
	return value > Math.min(one, other) + 1 && value < Math.max(one, other) - 1;
}

/**
 * How many times two different lines cross: a level run of one through an
 * upright run of another. Lines on one trunk run together and do not cross.
 * @param lines Every line's points.
 * @returns The crossings.
 */
function crossingsOf(lines: ReadonlyMap<string, Point[]>): number {
	const runs: Run[] = [...lines.values()].flatMap((points, line) =>
		points.slice(1).map((to, index) => ({ line, from: points[index]!, to })),
	);
	const level = runs.filter(({ from, to }) => Math.abs(from.y - to.y) < 0.5);
	const upright = runs.filter(({ from, to }) => Math.abs(from.x - to.x) < 0.5);
	return level.reduce(
		(total, one) =>
			total +
			upright.filter(
				(other) =>
					other.line !== one.line &&
					inside(other.from.x, one.from.x, one.to.x) &&
					inside(one.from.y, other.from.y, other.to.y),
			).length,
		0,
	);
}

/**
 * How readable a routed layout is: its fit to the reference pane, less a
 * share for every crossing.
 * @param layout The routed layout.
 * @returns The score.
 */
function scoreOf(layout: Routed): number {
	return fitIn(layout) * CROSSING_COST ** layout.crossings;
}

/**
 * Route a placement to learn the page it needs.
 * @param placed The placed hierarchy.
 * @returns The placement, its routed scene and its page.
 */
function routed(placed: ElkNode): Routed {
	const scene = new Scene(placed);
	const lines = routeScene(
		scene,
		(placed.edges ?? [])
			.filter((edge) => edge.sources[0] !== edge.targets[0])
			.map((edge) => ({
				id: edge.id,
				order: Number(edge.layoutOptions?.["archboard.order"] ?? 0),
				kind: trunkKind(edge),
				placed: edge,
			})),
		PAGE_MARGIN,
	);
	const boxes = [...scene.cards.values(), ...scene.labels.values(), ...scene.titles.values()].map(
		(item) => scene.moved(item, PAGE_MARGIN),
	);
	return {
		placed,
		scene,
		width: Math.max(...boxes.map((box) => box.x + box.width)) + PAGE_MARGIN,
		height: Math.max(...boxes.map((box) => box.y + box.height)) + PAGE_MARGIN,
		crossings: crossingsOf(lines),
	};
}

/**
 * What holds a card: every container and group region around it, so cards
 * held alike stay in one row when a rank wraps.
 * @param scene The routed scene.
 * @param id The card.
 * @returns A key naming its holders.
 */
function holdersOf(scene: Scene, id: string): string {
	const frames = [...scene.frames].filter(([, frame]) => frame.members.includes(id));
	const regions = scene.regions.filter((region) => region.members.includes(id));
	return [...frames.map(([frame]) => frame), ...regions.map(({ group }) => group)].join("|");
}

/**
 * The rank holding the most cards.
 * @param scene The routed scene.
 * @returns Its cards.
 */
function widestRank(scene: Scene): string[] {
	const bands = new Map<number, string[]>();
	for (const [id, item] of scene.cards) bands.set(item.band, [...(bands.get(item.band) ?? []), id]);
	return [...bands.values()].reduce<string[]>(
		(one, other) => (other.length > one.length ? other : one),
		[],
	);
}

/**
 * The widest rank's cards in runs held alike, left to right, each with its width.
 * @param scene The routed scene.
 * @returns The runs, or none when no rank is wide enough to wrap.
 */
function widestRuns(scene: Scene): { ids: string[]; width: number }[] {
	const widest = widestRank(scene);
	if (widest.length < MIN_WRAPPED) return [];
	const boxes = new Map(widest.map((id) => [id, scene.cards.get(id)!.box]));
	const runs: { key: string; ids: string[]; width: number }[] = [];
	for (const id of widest.toSorted((one, other) => boxes.get(one)!.x - boxes.get(other)!.x)) {
		const key = holdersOf(scene, id);
		const last = runs.at(-1);
		const box = boxes.get(id)!;
		if (last?.key === key && key !== "") {
			last.ids.push(id);
			last.width = box.x + box.width - boxes.get(last.ids[0]!)!.x;
		} else runs.push({ key, ids: [id], width: box.width });
	}
	return runs;
}

/**
 * The ways to wrap a board's widest rank of cards into rows, when the board
 * is wider than the page's shape, every row after the first lowered one row
 * of cards more: the rank cut left to right into two to four rows of about
 * equal width, with cards a container or group holds together kept in one
 * row, and the rank dealt out across the rows card by card.
 * @param whole The board placed and routed whole.
 * @returns Each wrap, as how far each wrapped card is lowered.
 */
function wrapPlans(whole: Routed): Map<string, number>[] {
	if (whole.width / whole.height <= REFERENCE_PANE.width / REFERENCE_PANE.height) return [];
	const runs = widestRuns(whole.scene);
	const total = runs.reduce((sum, { width }) => sum + width, 0);
	const cards = runs.flatMap(({ ids }) => ids);
	const plans = [2, 3, 4].flatMap((rows) => {
		const cut = new Map<string, number>();
		let before = 0;
		for (const { ids, width } of runs) {
			const row = Math.min(rows - 1, Math.floor(((before + width / 2) * rows) / total));
			for (const id of ids) if (row > 0) cut.set(id, row);
			before += width;
		}
		const dealt = new Map(
			cards.map((id, index) => [id, index % rows] as const).filter(([, row]) => row > 0),
		);
		return rows < cards.length ? [cut, dealt] : [];
	});
	const seen = new Set<string>();
	return plans.filter((plan) => {
		const key = JSON.stringify([...plan]);
		const fresh = plan.size > 0 && !seen.has(key);
		seen.add(key);
		return fresh;
	});
}

/**
 * Place a measured hierarchy for the track router: whole, or with its widest
 * rank wrapped into rows when that fits the page clearly better.
 * @param viz The initialized Graphviz instance.
 * @param graph The measured hierarchy, every label measured.
 * @returns The same hierarchy placed, with label boxes, frame title rows and polylines.
 */
function placeTracks(viz: Viz, graph: ElkNode): ElkNode {
	const whole = routed(new TrackPlacement(graph).place(viz));
	const wrapped = wrapPlans(whole).map((lowered) =>
		routed(new TrackPlacement(graph, lowered).place(viz)),
	);
	const best = wrapped.reduce<Routed | undefined>(
		(one, other) => (one === undefined || scoreOf(other) > scoreOf(one) ? other : one),
		undefined,
	);
	return best !== undefined && scoreOf(best) > scoreOf(whole) * WORTH_WRAPPING
		? best.placed
		: whole.placed;
}

export { placeTracks };
