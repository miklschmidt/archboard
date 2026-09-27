// How tall each band's channel is: room for the tracks its lines turn on,
// for an arrowhead's approach, for the containers that end over it, and, at
// a block's own edge rows, for the block's inset.
import {
	APPROACH_STRAIGHT,
	BEND_RADIUS,
	CONTAINER_INSET,
} from "@/transformers/semantic-renderer/config";
import { LANE } from "@/transformers/semantic-renderer/lib/track/chains";
import { assignTracks, type Net } from "@/transformers/semantic-renderer/lib/track/channels";
import type { Item, Scene } from "@/transformers/semantic-renderer/lib/track/scene";

/** How far apart two ends may be and still be drawn as one straight drop. */
const STRAIGHT = 0.5;
/** From the band above to the first track: room for the bend off a face. */
const TRACK_TOP = 2 * BEND_RADIUS;
/**
 * From the band above to the first track when a line on that track rises
 * into it: room for the bend and an arrowhead's straight approach.
 */
const TRACK_TOP_RISING = BEND_RADIUS + APPROACH_STRAIGHT;
/** From the last track to the band below: room for the bend and a straight arrow approach. */
const TRACK_BOTTOM = APPROACH_STRAIGHT + 2 * BEND_RADIUS;
/** The height of a channel no line turns in: room for an arrowhead's straight approach and air. */
const EMPTY_CHANNEL = 24;
/** Room between a container's bottom edge and the band below it. */
const BELOW_CONTAINER = 12;

/**
 * The room a block that draws its own edge keeps where no line turns: under
 * its header row, which Graphviz ranks alone first, and above its bottom
 * ports, which it ranks alone last.
 */
interface Rim {
	/** From the header row to the first thing the block holds. */
	readonly head: number;
	/** From the lowest thing it holds to its bottom edge, when its bottom ports stand there. */
	readonly foot?: number;
}

/**
 * How far below its band a channel's first track runs: below the containers
 * that end on the band, and far enough for an arrowhead's approach when a
 * line on it rises into the band.
 * @param closing How far below the band the containers ending there reach.
 * @param rising Whether a line on the first track turns and rises into the band.
 * @returns The distance.
 */
function firstTrack(closing: number, rising: boolean): number {
	return Math.max(closing + TRACK_TOP, rising ? TRACK_TOP_RISING : 0);
}

/**
 * How tall a channel is for the tracks it holds, below the containers that
 * end above it.
 * @param tracks Its track count.
 * @param closing How far below its band the containers ending there reach.
 * @param rising Whether a line on its first track turns and rises into the band above.
 * @param facing Whether a container ending above it stands over one opening below it.
 * @returns Its height.
 */
function channelHeight(tracks: number, closing = 0, rising = false, facing = false): number {
	return tracks === 0
		? Math.max(EMPTY_CHANNEL, closing + (facing ? CONTAINER_INSET : BELOW_CONTAINER))
		: firstTrack(closing, rising) + (tracks - 1) * LANE + TRACK_BOTTOM;
}

/**
 * Whether a line on a channel's first track turns there and rises into the
 * band above, so its arrowhead lands on that band's face.
 * @param crossing The channel's nets, their tracks assigned.
 * @param rising The first net of every upward line: the one that ends on its target.
 * @returns True when the first track needs an arrowhead's room above it.
 */
function risesOnFirstTrack(crossing: readonly Net[], rising: ReadonlySet<Net>): boolean {
	return crossing.some(
		(net) => net.track === 0 && rising.has(net) && Math.abs(net.topX - net.bottomX) > STRAIGHT,
	);
}

/**
 * The height of a channel no line turns in at a block's edge rows: under its
 * header, or over its bottom ports, which stand on its edge.
 * @param scene The scene.
 * @param index The band the channel is under.
 * @param closing How far below that band the containers ending there reach.
 * @param rim The room the block keeps there, when it draws its own edge.
 * @returns The height, or nothing when the channel is not at an edge row.
 */
function rimOf(
	scene: Scene,
	index: number,
	closing: number,
	rim: Rim | undefined,
): number | undefined {
	if (rim === undefined) return undefined;
	if (index === 0) return rim.head;
	const ports = scene.bands.at(-1)!;
	return rim.foot !== undefined && index === scene.bands.length - 2
		? closing + rim.foot - (ports.bottom - ports.top)
		: undefined;
}

/**
 * Lay out every band and channel again, from the tracks each channel needs.
 * A channel no line crosses below a band of titles alone keeps the room a
 * container keeps around its cards: no frame ends there, so a container's
 * cards stand as far below its title as in from its sides. A channel below
 * containers that end on its band starts its tracks below their edges, and
 * keeps a container's inset between a container ending on its band and one
 * opening under it.
 * @param scene The scene, whose bands get their new tops.
 * @param nets Every net, given its track in its channel.
 * @param ends Where containers end: how far below each band those ending on
 * it reach, and the bands where one stands over another.
 * @param ends.closings The reach below each band.
 * @param ends.facing The bands where one container stands over another.
 * @param rising The first net of every upward line.
 * @param margin Where the first band starts.
 * @param rim The room the block keeps under its header and over its bottom
 * ports where no line turns, when it draws its own edge.
 */
function spaceBands(
	scene: Scene,
	nets: readonly Net[],
	ends: { readonly closings: readonly number[]; readonly facing: ReadonlySet<number> },
	rising: ReadonlySet<Net>,
	margin: number,
	rim?: Rim,
): void {
	const held = new Set([...scene.cards.values(), ...scene.labels.values()].map(({ band }) => band));
	let top = margin;
	scene.bands.forEach((band, index) => {
		band.newTop = top;
		const crossing = nets.filter((net) => net.channel === index);
		const tracks = assignTracks(crossing);
		const closing = ends.closings[index]!;
		const rises = risesOnFirstTrack(crossing, rising);
		band.firstTrack = firstTrack(closing, rises);
		const titled = crossing.length === 0 && !held.has(index);
		const faces = ends.facing.has(index);
		const rimmed = tracks === 0 ? rimOf(scene, index, closing, rim) : undefined;
		const channel =
			rimmed ?? (titled ? CONTAINER_INSET : channelHeight(tracks, closing, rises, faces));
		top += band.bottom - band.top + channel;
	});
	centreLabelBands(scene, nets, ends.closings);
}

/**
 * Whether a net leaves a label room: it runs clear of the label's lane-wide
 * reach, or it is the label's own straight line.
 * @param net The net.
 * @param item The label.
 * @returns True when it does.
 */
function leavesRoom(net: Net, item: Item): boolean {
	const [low, high] = [item.box.x - LANE, item.box.x + item.box.width + LANE];
	if (Math.max(net.topX, net.bottomX) <= low || Math.min(net.topX, net.bottomX) >= high)
		return true;
	const own = net.top.item === item || net.bottom.item === item;
	return own && net.wall === undefined && Math.abs(net.topX - net.bottomX) <= STRAIGHT;
}

/**
 * Whether a row of labels may move into a channel: every net in it leaves
 * each of them room.
 * @param labels The row.
 * @param nets Every net.
 * @param channel The channel.
 * @returns True when it may.
 */
function clearFor(labels: readonly Item[], nets: readonly Net[], channel: number): boolean {
	const crossing = nets.filter((net) => net.channel === channel);
	return labels.every((item) => crossing.every((net) => leavesRoom(net, item)));
}

/**
 * The labels a band holds alone, between two bands, or nothing when it holds
 * a card, a title or a caption too, or stands at an end.
 * @param scene The scene.
 * @param index The band.
 * @returns Its labels, or nothing.
 */
function labelRow(scene: Scene, index: number): Item[] | undefined {
	if (index === 0 || index === scene.bands.length - 1) return undefined;
	const others = [...scene.cards.values(), ...scene.titles.values()];
	const captions = scene.regions.map(({ caption }) => caption);
	if ([...others, ...captions].some(({ band }) => band === index)) return undefined;
	const labels = [...scene.labels.values()].filter((item) => item.band === index);
	return labels.length > 0 ? labels : undefined;
}

/**
 * Stand each band that holds labels alone in the middle of the room between
 * the bands either side of it, as far as the channel it moves into is clear
 * of it: a channel grows for a track that turns in it anywhere across the
 * block, and would otherwise push a label far from it off its gap's middle.
 * The row moves together, so it stays a row.
 * @param scene The spaced scene; its label boxes move.
 * @param nets Every net, on its track.
 * @param closings How far below each band the containers ending there reach.
 */
function centreLabelBands(scene: Scene, nets: readonly Net[], closings: readonly number[]): void {
	scene.bands.forEach((band, index) => {
		const labels = labelRow(scene, index);
		if (labels === undefined) return;
		const [upper, lower] = [scene.bands[index - 1]!, scene.bands[index + 1]!];
		const above = band.newTop - (upper.newTop + upper.bottom - upper.top);
		const below = lower.newTop - (band.newTop + band.bottom - band.top);
		const up = clearFor(labels, nets, index - 1)
			? above - channelHeight(0, closings[index - 1])
			: 0;
		const down = clearFor(labels, nets, index) ? below - EMPTY_CHANNEL : 0;
		const shift = Math.min(down, Math.max(-up, (below - above) / 2));
		for (const item of labels) item.box = { ...item.box, y: item.box.y + shift };
	});
}

export { EMPTY_CHANNEL, TRACK_TOP, channelHeight, spaceBands, type Rim };
