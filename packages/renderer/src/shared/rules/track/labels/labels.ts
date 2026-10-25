// Label boxes slide onto their lines (TASK-349).
//
// Graphviz puts every label box somewhere on its rank. A line through a box
// that stands to one side of both its ends has to jog on the way in and on the
// way out. Here each box slides sideways, within its band, to where both ends
// could reach it straight: a point both cards' faces cover, or as near as the
// band allows, and then to the middle of that stretch where the room allows. An end that shares a trunk's port is not aimed at: the trunk
// turns on its track wherever the box stands. Cards, title rows, lanes and frame walls stay where they are;
// boxes between them keep their spacing and their order, or the order of
// where they want to be when that crosses fewer lines or as few
// (`label-runs.ts`), placed as close to where they want to be as the gap allows.
import {
	CONTAINER_INSET,
	LABEL_CARD_CLEARANCE,
	LABEL_LABEL_CLEARANCE,
} from "#shared/constants/spacing.ts";
import { LANE, type Station } from "#shared/rules/track/routes/chains.ts";
import { sharedAt, type Net } from "#shared/rules/track/channels/channels.ts";
import { placeRun, type Slider } from "#shared/rules/track/labels/label-runs.ts";
import { Scene, centreX, type Item } from "#shared/rules/track/scene/scene.ts";

/** Room kept between a sliding box and a card or lane beside it. */
const LABEL_GAP = LANE;
/** How far a line keeps from a card's corner, as ports do. */
const FACE_MARGIN = 20;
/** The bound of a stretch with nothing on one side: beyond any drawing. */
const OPEN_REACH = 1_000_000;

/** Something that stays put on a band, as an interval a box may not enter. */
type Wall = readonly [number, number];

/**
 * The x a station's line can reach it at: a card's face, the one point of
 * the card its line is held to, or a single x.
 * @param station The station.
 * @returns The lowest and highest x.
 */
function reach(station: Station): [number, number] {
	if (station.kind !== "card") return [station.x, station.x];
	const { x, width } = station.item!.box;
	if (station.at !== undefined) return [x + station.at, x + station.at];
	const margin = Math.min(FACE_MARGIN, width / 2);
	return [x + margin, x + width - margin];
}

/**
 * The x a label's line reaches it at straight from one of its far ends:
 * anywhere when that end shares a trunk's port, since the trunk turns on its
 * track to reach the box wherever it stands.
 * @param net The net between the label and that end.
 * @param end Which of the net's ends is the far one.
 * @returns The lowest and highest x.
 */
function reachFrom(net: Net, end: "top" | "bottom"): [number, number] {
	return sharedAt(net, end) === undefined ? reach(net[end]) : [-OPEN_REACH, OPEN_REACH];
}

/**
 * Where a label box wants its centre: a point both its ends can reach
 * straight, nearest the trunk port one of them shares, or else nearest where
 * it stands; failing that, the edge of its upper end's reach nearest the
 * lower one, since its line jogs wherever the box stands.
 * @param item The label box.
 * @param above The net its line comes from.
 * @param below The net its line goes on to.
 * @returns The wanted centre x.
 */
function wantedCentre(item: Item, above: Net, below: Net): number {
	const [a, b] = reachFrom(above, "top");
	const [c, d] = reachFrom(below, "bottom");
	const low = Math.max(a, c);
	const high = Math.min(b, d);
	if (low > high) return c > b ? b : a;
	const port = sharedAt(above, "top") === undefined ? below.bottomX : above.topX;
	const shared = sharedAt(above, "top") !== undefined || sharedAt(below, "bottom") !== undefined;
	return Math.min(high, Math.max(low, shared ? port : centreX(item)));
}

/**
 * Which way from a station a line steps back under its card: right from a
 * point near the card's left edge it is held to, left from one near its
 * right edge, and no way from its middle or from any other station.
 * @param station The station a label's line comes down from.
 * @returns 1, -1 or 0.
 */
function inwardFrom(station: Station): number {
	if (station.at === undefined) return 0;
	return Math.sign(station.item!.box.width / 2 - station.at);
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
		return below === undefined
			? []
			: [
					{
						item,
						wanted: wantedCentre(item, above, below),
						reaches: [reachFrom(above, "top"), reachFrom(below, "bottom")],
						ends: [above.topX, below.bottomX],
						inward: inwardFrom(above.top),
					},
				];
	});
}

/**
 * How far the scene's cards, title rows and labels reach, left and right: a
 * label slides no further out, since the lines that enter a block run down
 * beside its items.
 * @param scene The scene.
 * @returns The leftmost and rightmost edge.
 */
function extentOf(scene: Scene): Wall {
	const boxes = [...scene.cards.values(), ...scene.titles.values(), ...scene.labels.values()].map(
		({ box }) => box,
	);
	return [
		Math.min(...boxes.map(({ x }) => x)),
		Math.max(...boxes.map(({ x, width }) => x + width)),
	];
}

/**
 * Everything on the scene a label box keeps a card's clearance from: every
 * card and frame title row, and each group region caption on its band, or
 * the whole caption row where the box would reach above the region's top
 * edge ({@link Scene.captionsFor}).
 * @param scene The placed scene.
 * @param label The label box.
 * @returns The items.
 */
function standing(scene: Scene, label: Item): Item[] {
	return [...scene.cards.values(), ...scene.titles.values(), ...scene.captionsFor(label)];
}

/**
 * What stays put on one band for one label box: what it keeps a card's
 * clearance from, its lanes, the walls of every frame the band passes
 * through, and the scene's extent.
 * @param scene The placed scene.
 * @param band The band.
 * @param lanes The x of every lane on the band.
 * @param label The label box.
 * @returns The walls, widened by the gap a box keeps.
 */
function wallsOn(scene: Scene, band: number, lanes: readonly number[], label: Item): Wall[] {
	const items = standing(scene, label).filter((item) => item.band === band);
	const [left, right] = extentOf(scene);
	return [
		...items.map(({ box }): Wall => [box.x - LABEL_GAP, box.x + box.width + LABEL_GAP]),
		...lanes.map((x): Wall => [x - LABEL_GAP, x + LABEL_GAP]),
		...frameWallsOn(scene, band),
		[-OPEN_REACH, left] as const,
		[right, OPEN_REACH] as const,
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
 * Slide every label box toward where its line can reach it straight, then
 * move the nets through it with it.
 * @param scene The placed scene.
 * @param nets Every net, whose label ends follow their boxes.
 */
function slideLabels(scene: Scene, nets: readonly Net[]): void {
	const lanes = lanesByBand(scene, nets);
	const sliders = slidersOf(nets);
	scene.bands.forEach((_, band) => {
		const runs = new Map<string, Slider[]>();
		for (const slider of sliders.filter(({ item }) => item.band === band)) {
			const walls = wallsOn(scene, band, lanes[band]!, slider.item);
			const key = stretchOf(walls, slider.item).join(",");
			runs.set(key, [...(runs.get(key) ?? []), slider]);
		}
		for (const [key, run] of runs) {
			const [low, high] = key.split(",").map(Number);
			placeRun(run, low!, high!);
		}
	});
	settleLabels(scene, nets);
}

/**
 * Settle every label box onto the lane or face its line meets it from, and
 * move the nets through it with it.
 * @param scene The scene.
 * @param nets Every net, whose label ends follow their boxes.
 */
function settleLabels(scene: Scene, nets: readonly Net[]): void {
	settleOnLanes(scene, nets);
	centreOnFaces(scene, nets, slidersOf(nets));
	for (const net of nets) {
		if (net.top.kind === "label") net.topX = centreX(net.top.item!);
		if (net.bottom.kind === "label") net.bottomX = centreX(net.bottom.item!);
	}
}

/**
 * The stretch both of a label's ends reach straight, if they share one.
 * @param slider The label.
 * @returns The lowest and highest centre, or nothing when its line must jog.
 */
function faceOf(slider: Slider): [number, number] | undefined {
	const { reaches } = slider;
	const low = Math.max(...reaches.map(([one]) => one));
	const high = Math.min(...reaches.map(([, other]) => other));
	return low <= high ? [low, high] : undefined;
}

/**
 * Centre each label whose line runs straight on the middle of the stretch
 * both its ends reach, as near as the free room beside it allows; nothing
 * else moves. Where Graphviz stood such a label says nothing, and a fork's
 * branches would otherwise leave or enter their card unevenly.
 * @param scene The scene.
 * @param nets Every net.
 * @param sliders Every label on a line.
 */
function centreOnFaces(scene: Scene, nets: readonly Net[], sliders: readonly Slider[]): void {
	const lanes = lanesByBand(scene, nets);
	for (const slider of sliders.toSorted((one, other) => one.item.box.x - other.item.box.x)) {
		const face = faceOf(slider);
		const { item } = slider;
		if (face === undefined) continue;
		const labels = [...scene.labels.values()]
			.filter((other) => other !== item && other.band === item.band)
			.map(({ box }): Wall => [
				box.x - LABEL_LABEL_CLEARANCE,
				box.x + box.width + LABEL_LABEL_CLEARANCE,
			]);
		const [left, right] = stretchOf(
			[...wallsOn(scene, item.band, lanes[item.band]!, item), ...labels],
			item,
		);
		const half = item.box.width / 2;
		const lowest = Math.max(face[0], left + half);
		const highest = Math.min(face[1], right - half);
		const centre = centreX(item);
		if (centre < lowest - 0.5 || centre > highest + 0.5) continue;
		const middle = Math.min(highest, Math.max(lowest, (face[0] + face[1]) / 2));
		item.box = { ...item.box, x: middle - half };
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
 * Whether a box stands within a stretch.
 * @param box The box.
 * @param stretch The stretch.
 * @returns True when it does.
 */
function within(box: Item["box"], stretch: Wall): boolean {
	return box.x >= stretch[0] && box.x + box.width <= stretch[1];
}

/**
 * How far a box keeps from a container's wall, on whichever side it stands.
 * @param box The box.
 * @param wall The wall's x.
 * @returns The room; less than none when the box straddles the wall.
 */
function keepsFrom(box: Item["box"], wall: number): number {
	return Math.max(box.x - wall, wall - box.x - box.width);
}

/**
 * Whether a label box, moved, keeps its room from everything else on its
 * band: a card's clearance from a card, title row or region caption, a
 * label's from a label, a lane's from every other line passing the band, and
 * a container's inset from its walls, or, where it already stood nearer a
 * wall, no nearer than it stood: it never moves across one.
 * @param scene The scene.
 * @param item The label box.
 * @param box Where it would stand.
 * @param lanes The x of every lane on the label's band.
 * @returns True when nothing is closer.
 */
function clearOnBand(
	scene: Scene,
	item: Item,
	box: Item["box"],
	lanes: readonly number[],
): boolean {
	return (
		keepsGap(item, box, standing(scene, item), LABEL_CARD_CLEARANCE) &&
		keepsGap(item, box, scene.labels.values(), LABEL_LABEL_CLEARANCE) &&
		lanes.every((x) => x <= box.x - LABEL_GAP || x >= box.x + box.width + LABEL_GAP) &&
		[...scene.walled(item.band).values()]
			.flat()
			.every(
				(wall) => keepsFrom(box, wall) >= Math.min(CONTAINER_INSET, keepsFrom(item.box, wall)),
			) &&
		within(box, extentOf(scene))
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
 * could not turn whole. The station above is tried first. A label whose line comes straight down
 * from a point of a decision it is held to (`points.ts`) stays on that point:
 * a step above it would run back under the diamond.
 * @param scene The scene.
 * @param nets Every net.
 */
function settleOnLanes(scene: Scene, nets: readonly Net[]): void {
	const lanes = lanesByBand(scene, nets);
	// In the board's order, so which of two neighbours moves first never depends on the document's.
	const ordered = nets.toSorted((one, other) => one.order - other.order);
	const [below, above] = [
		ordered.map((net) => [net.top, net.bottom] as const),
		ordered.map((net) => [net.bottom, net.top] as const),
	];
	const pairs = [...above, ...below].filter(
		([label, other]) => label.kind === "label" && other.kind !== "label",
	);
	const settled = new Set<Item>(
		nets
			.filter(({ top, bottom }) => top.at !== undefined && bottom.kind === "label")
			.map(({ bottom }) => bottom.item!),
	);
	for (const [label, other] of pairs) {
		const item = label.item!;
		const shift = meetingX(other, item) - centreX(item);
		const box = { ...item.box, x: item.box.x + shift };
		const clear = clearOnBand(scene, item, box, lanes[item.band]!);
		if (settled.has(item) || Math.abs(shift) >= 2 * LANE || !clear) continue;
		item.box = box;
		settled.add(item);
	}
}

/**
 * Move a label box so its centre stands at an x, when it stays clear of
 * everything else on its band.
 * @param scene The scene.
 * @param nets Every net.
 * @param item The label box.
 * @param x Where its centre goes.
 * @returns Whether it moved.
 */
function nudgeLabel(scene: Scene, nets: readonly Net[], item: Item, x: number): boolean {
	const box = { ...item.box, x: x - item.box.width / 2 };
	if (!clearOnBand(scene, item, box, lanesByBand(scene, nets)[item.band]!)) return false;
	item.box = box;
	return true;
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

export { extentOf, nudgeLabel, settleLabels, slideLabels };
