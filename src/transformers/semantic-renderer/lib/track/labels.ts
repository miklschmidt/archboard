// Label boxes slide onto their lines (TASK-349).
//
// Graphviz puts every label box somewhere on its rank. A line through a box
// that stands to one side of both its ends has to jog on the way in and on the
// way out. Here each box slides sideways, within its band, to where both ends
// could reach it straight: a point both cards' faces cover, or as near as the
// band allows. Cards, title rows, lanes and frame walls stay where they are;
// boxes between them keep their order and spacing, placed as close to where
// they want to be as the gap allows.
import {
	CONTAINER_INSET,
	LABEL_CARD_CLEARANCE,
	LABEL_LABEL_CLEARANCE,
} from "@/transformers/semantic-renderer/config";
import { LANE, type Station } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Net } from "@/transformers/semantic-renderer/lib/track/channels";
import { Scene, centreX, type Item } from "@/transformers/semantic-renderer/lib/track/scene";

/** Room kept between a sliding box and a card or lane beside it. */
const LABEL_GAP = LANE;
/** How far a line keeps from a card's corner, as ports do. */
const FACE_MARGIN = 20;
/** The bound of a stretch with nothing on one side: beyond any drawing. */
const OPEN_REACH = 1_000_000;

/** A label box that may slide, and where it wants its centre. */
interface Slider {
	readonly item: Item;
	readonly wanted: number;
	/** How firmly it holds its wanted centre against its neighbours: firm where its line can run straight. */
	readonly weight: number;
}

/** How firmly a label whose line must jog anyway holds its place, against one whose line runs straight. */
const JOGGING_WEIGHT = 0.01;

/** Something that stays put on a band, as an interval a box may not enter. */
type Wall = readonly [number, number];

/**
 * The x a station's line can reach it at: a card's face, or a single x.
 * @param station The station.
 * @returns The lowest and highest x.
 */
function reach(station: Station): [number, number] {
	if (station.kind !== "card") return [station.x, station.x];
	const { x, width } = station.item!.box;
	const margin = Math.min(FACE_MARGIN, width / 2);
	return [x + margin, x + width - margin];
}

/**
 * Where a label box wants its centre, and how firmly: a point both its ends
 * can reach straight, nearest where it stands, held firmly; else the edge of
 * its upper end's reach nearest the lower one, held loosely, since its line
 * jogs wherever the box stands.
 * @param item The label box.
 * @param above The station its line comes from.
 * @param below The station its line goes on to.
 * @returns The wanted centre x, and its weight.
 */
function wantedCentre(
	item: Item,
	above: Station,
	below: Station,
): { wanted: number; weight: number } {
	const [a, b] = reach(above);
	const [c, d] = reach(below);
	const low = Math.max(a, c);
	const high = Math.min(b, d);
	if (low <= high) return { wanted: Math.min(high, Math.max(low, centreX(item))), weight: 1 };
	return { wanted: c > b ? b : a, weight: JOGGING_WEIGHT };
}

/**
 * Every label box that sits on a line, with where it wants its centre.
 * @param nets Every net.
 * @returns The sliders.
 */
function slidersOf(nets: readonly Net[]): Slider[] {
	const into = new Map<Item, Net>();
	const outOf = new Map<Item, Net>();
	for (const net of nets) {
		if (net.bottom.kind === "label") into.set(net.bottom.item!, net);
		if (net.top.kind === "label") outOf.set(net.top.item!, net);
	}
	return [...into].flatMap(([item, above]) => {
		const below = outOf.get(item);
		return below === undefined ? [] : [{ item, ...wantedCentre(item, above.top, below.bottom) }];
	});
}

/**
 * What stays put on one band: its cards and title rows, its lanes, and the
 * walls of every frame the band passes through.
 * @param scene The placed scene.
 * @param band The band.
 * @param lanes The x of every lane on the band.
 * @returns The walls, widened by the gap a box keeps.
 */
function wallsOn(scene: Scene, band: number, lanes: readonly number[]): Wall[] {
	const items = [...scene.cards.values(), ...scene.titles.values()].filter(
		(item) => item.band === band,
	);
	return [
		...items.map(({ box }): Wall => [box.x - LABEL_GAP, box.x + box.width + LABEL_GAP]),
		...lanes.map((x): Wall => [x - LABEL_GAP, x + LABEL_GAP]),
		...frameWallsOn(scene, band),
	].toSorted((one, other) => one[0] - other[0]);
}

/**
 * The walls of every frame and group region a band passes through.
 * @param scene The placed scene.
 * @param band The band.
 * @returns Each wall, widened by the frame's inset.
 */
function frameWallsOn(scene: Scene, band: number): Wall[] {
	return [...scene.walled(band).values()].flatMap((walls) =>
		walls.map((wall): Wall => [wall - CONTAINER_INSET, wall + CONTAINER_INSET]),
	);
}

/**
 * The open stretch of a band a box stands in, between the walls either side of it.
 * @param walls The band's walls, left to right.
 * @param item The box.
 * @returns Its lowest left edge and highest right edge.
 */
function stretchOf(walls: readonly Wall[], item: Item): [number, number] {
	const centre = centreX(item);
	const left = walls.filter(([, high]) => high <= centre + 0.5).map(([, high]) => high);
	const right = walls.filter(([low]) => low >= centre - 0.5).map(([low]) => low);
	return [Math.max(-OPEN_REACH, ...left), Math.min(OPEN_REACH, ...right)];
}

/**
 * Place boxes that share one stretch: in their order, spaced, each as near its
 * wanted centre as the others and the stretch allow (pool-adjacent violators).
 * @param sliders The boxes, left to right.
 * @param low The stretch's left edge.
 * @param high The stretch's right edge.
 */
function placeRun(sliders: readonly Slider[], low: number, high: number): void {
	const offsets: number[] = [];
	let offset = 0;
	for (const { item } of sliders) {
		offsets.push(offset);
		offset += item.box.width + LABEL_LABEL_CLEARANCE;
	}
	const room = high - low - (offset - LABEL_LABEL_CLEARANCE);
	if (room < 0) return;
	const blocks: { value: number; weight: number; count: number }[] = [];
	sliders.forEach(({ item, wanted, weight }, index) => {
		blocks.push({ value: wanted - item.box.width / 2 - offsets[index]!, weight, count: 1 });
		while (blocks.length > 1 && blocks.at(-2)!.value > blocks.at(-1)!.value) {
			const last = blocks.pop()!;
			const before = blocks.at(-1)!;
			before.value =
				(before.value * before.weight + last.value * last.weight) / (before.weight + last.weight);
			before.weight += last.weight;
			before.count += last.count;
		}
	});
	const lefts = blocks.flatMap(({ value, count }) => Array.from({ length: count }, () => value));
	sliders.forEach(({ item }, index) => {
		const left = Math.min(low + room, Math.max(low, lefts[index]!)) + offsets[index]!;
		item.box = { ...item.box, x: left };
	});
}

/**
 * Slide every label box toward where its line can reach it straight, then
 * move the nets through it with it.
 * @param scene The placed scene.
 * @param nets Every net, whose label ends follow their boxes.
 */
function slideLabels(scene: Scene, nets: readonly Net[]): void {
	const lanes = lanesByBand(scene, nets);
	const sliders = slidersOf(nets);
	scene.bands.forEach((_, band) => {
		const walls = wallsOn(scene, band, lanes[band]!);
		const runs = new Map<string, Slider[]>();
		for (const slider of sliders.filter(({ item }) => item.band === band)) {
			const key = stretchOf(walls, slider.item).join(",");
			runs.set(key, [...(runs.get(key) ?? []), slider]);
		}
		for (const [key, run] of runs) {
			const [low, high] = key.split(",").map(Number);
			placeRun(
				run.toSorted((one, other) => one.item.box.x - other.item.box.x),
				low!,
				high!,
			);
		}
	});
	settleOnLanes(scene, nets);
	for (const net of nets) {
		if (net.top.kind === "label") net.topX = centreX(net.top.item!);
		if (net.bottom.kind === "label") net.bottomX = centreX(net.bottom.item!);
	}
}

/**
 * Whether a box keeps a gap from every other item on its band.
 * @param item The item being moved.
 * @param box Where it would stand.
 * @param others The items it must keep clear of, itself among them or not.
 * @param gap The room it keeps.
 * @returns True when nothing is closer.
 */
function keepsGap(item: Item, box: Item["box"], others: Iterable<Item>, gap: number): boolean {
	return [...others]
		.filter((other) => other !== item && other.band === item.band)
		.every(
			({ box: other }) =>
				other.x >= box.x + box.width + gap || box.x >= other.x + other.width + gap,
		);
}

/**
 * Whether a label box, moved, keeps its room from every other box on its
 * band: a card's clearance from a card or title row, a label's from a label.
 * @param scene The scene.
 * @param item The label box.
 * @param box Where it would stand.
 * @returns True when nothing is closer.
 */
function clearOnBand(scene: Scene, item: Item, box: Item["box"]): boolean {
	return (
		keepsGap(
			item,
			box,
			[...scene.cards.values(), ...scene.titles.values()],
			LABEL_CARD_CLEARANCE,
		) && keepsGap(item, box, scene.labels.values(), LABEL_LABEL_CLEARANCE)
	);
}

/**
 * Where a line would meet a label from one of its other stations: a lane's
 * x, or the point of a card's face nearest the label.
 * @param station The station.
 * @param item The label box.
 * @returns The x.
 */
function meetingX(station: Station, item: Item): number {
	const [low, high] = reach(station);
	return Math.min(high, Math.max(low, centreX(item)));
}

/**
 * Move a label box straight over or under the lane or card face its line
 * comes from or goes to, when it stands within a jog's width of it and can
 * move there clear of its neighbours: the line then runs straight through its
 * label instead of jogging a few points on either side of it, which a corner
 * could not turn whole.
 * @param scene The scene.
 * @param nets Every net.
 */
function settleOnLanes(scene: Scene, nets: readonly Net[]): void {
	// In the board's order, so which of two neighbours moves first never depends on the document's.
	const ordered = nets.toSorted((one, other) => one.order - other.order);
	const pairs = [
		...ordered.map((net) => [net.bottom, net.top] as const),
		...ordered.map((net) => [net.top, net.bottom] as const),
	].filter(([label, other]) => label.kind === "label" && other.kind !== "label");
	const settled = new Set<Item>();
	for (const [label, other] of pairs) {
		const item = label.item!;
		const shift = meetingX(other, item) - centreX(item);
		const box = { ...item.box, x: item.box.x + shift };
		if (settled.has(item) || Math.abs(shift) >= 2 * LANE || !clearOnBand(scene, item, box))
			continue;
		item.box = box;
		settled.add(item);
	}
}

/**
 * The x of every lane, by the band it passes.
 * @param scene The placed scene.
 * @param nets Every net.
 * @returns The lanes on each band.
 */
function lanesByBand(scene: Scene, nets: readonly Net[]): number[][] {
	const lanes = scene.bands.map((): number[] => []);
	// A line to a wall ends on its track: the far end it aims at is no lane.
	const stations = nets.flatMap((net) =>
		net.wall === "bottom" ? [net.top] : net.wall === "top" ? [net.bottom] : [net.top, net.bottom],
	);
	for (const station of stations) if (station.kind === "lane") lanes[station.band]!.push(station.x);
	return lanes;
}

export { slideLabels };
