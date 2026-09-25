// Wrapping the track engine's widest rank (TASK-349). A board whose ranks run
// wider than the page reads better when its widest rank of cards is dealt out
// over two to four staggered rows, or its cards nothing connects are set out as
// a grid. Each way is placed and routed here, where the layout engines run, and
// the one that reads best is kept when it clearly beats the board as it is;
// the router then draws it where the drawing is painted.
import type { ElkNode } from "@archboard/elk-rs";
import type { Viz } from "@viz-js/viz";
import { REFERENCE_PANE } from "@/shared/shell-geometry/index";
import { TrackPlacement } from "@/transformers/semantic-renderer/lib/track/placement";
import {
	PAGE_MARGIN,
	routeScene,
	trunkKind,
} from "@/transformers/semantic-renderer/lib/track/route";
import { Scene } from "@/transformers/semantic-renderer/lib/track/scene";
import {
	crossingsOf,
	readsBetter,
	scoreOf,
	wrapPlans,
} from "@/transformers/semantic-renderer/lib/track/score";

/** How much better a wrap must fit the page than the board unwrapped. */
const WORTH_WRAPPING = 1.1;
/** The fewest cards a rank holds before wrapping it is worth trying. */
const MIN_WRAPPED = 4;

/** A placement, routed: its scene, the page it needs and how many times its lines cross. */
interface Routed {
	readonly placed: ElkNode;
	readonly scene: Scene;
	readonly width: number;
	readonly height: number;
	readonly crossings: number;
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
		crossings: crossingsOf(lines.values()),
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
 * is wider than the page's shape; cards a container or group holds together
 * stay in one row when the rank is cut.
 * @param whole The board placed and routed whole.
 * @returns Each wrap, as how far each wrapped card is lowered.
 */
function wrapsOf(whole: Routed): Map<string, number>[] {
	if (whole.width / whole.height <= REFERENCE_PANE.width / REFERENCE_PANE.height) return [];
	return wrapPlans(widestRuns(whole.scene));
}

/**
 * Place a measured hierarchy for the track router: whole, or with its widest
 * rank wrapped into rows when that fits the page clearly better.
 * @param viz The initialized Graphviz instance.
 * @param graph The measured hierarchy, every label measured.
 * @returns The same hierarchy placed, with label boxes, frame title rows and polylines.
 */
function placeTracks(viz: Viz, graph: ElkNode): ElkNode {
	const placement = new TrackPlacement(graph);
	const whole = routed(placement.place(viz));
	const gridded = placement.gridded() ? [new TrackPlacement(graph, new Map(), true)] : [];
	const wrapped = [
		...gridded.map((grid) => routed(grid.place(viz))),
		...wrapsOf(whole).map((lowered) => routed(new TrackPlacement(graph, lowered).place(viz))),
	];
	const best = wrapped.reduce<Routed | undefined>(
		(one, other) => (one === undefined || readsBetter(other, one) ? other : one),
		undefined,
	);
	return best !== undefined && scoreOf(best) > scoreOf(whole) * WORTH_WRAPPING
		? best.placed
		: whole.placed;
}

export { placeTracks };
