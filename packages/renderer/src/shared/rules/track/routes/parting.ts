// Two lines that read as one, parted (visual polish). A line that comes down
// onto its track and turns within a lane of where another line turns off a
// lower track and goes on down draws one line with a kink, however their
// tracks are ordered. One end of the pair moves a lane aside, or onto its own
// line's column, by the moves that close jogs (jogs.ts), when that parts more
// such pairs than it makes and crosses nothing. A pair no such move parts
// is tried again moving only the piece of a run of lanes on the stretch, so a
// line whose run steps elsewhere, as round a label, parts where it meets the
// other without that step having to move too. Two lines that end at one
// point, as at a block's one-point port, are drawn joined there and are never
// parted.
import { LANE, type Chain } from "#shared/rules/track/routes/chains.ts";
import type { Net } from "#shared/rules/track/channels/channels.ts";
import {
	PASSES,
	STRAIGHT,
	moveStretch,
	notched,
	stretchBeyond,
	xAt,
	type Place,
} from "#shared/rules/track/routes/jogs.ts";
import type { Scene } from "#shared/rules/track/scene/scene.ts";

/**
 * Whether two nets belong to one line or one trunk.
 * @param one A net.
 * @param other Another.
 * @returns True when they are drawn together.
 */
function related(one: Net, other: Net): boolean {
	return one.edge === other.edge || (one.trunk !== undefined && one.trunk === other.trunk);
}

/**
 * Whether a line leaving a station into a channel and another line entering
 * the station below from the same channel stand within a lane of each other:
 * one comes down onto its track and turns where the other turns off its track
 * and goes on down, and the two read as one line.
 * @param leaving The net that leaves the upper station.
 * @param entering The net that enters the lower station.
 * @returns True when they read as one.
 */
function collinear(leaving: Net, entering: Net): boolean {
	// The cheap tests first: a search over pairs asks this of every pair in a
	// channel for every move it tries, and few pairs stand within a lane.
	const within = Math.abs(leaving.topX - entering.bottomX) < LANE;
	if (leaving.channel !== entering.channel || !within) return false;
	if (related(leaving, entering) || leaving.wall === "top" || entering.wall === "bottom")
		return false;
	return !meetAtOnePoint(leaving, entering);
}

/**
 * Whether two nets end at one point of one station, as two lines into a
 * block's one-point port do: they are drawn joined there already, and
 * parting them only steps one aside twice.
 * @param one A net.
 * @param other Another in the same channel.
 * @returns True when they share an end.
 */
function meetAtOnePoint(one: Net, other: Net): boolean {
	return (["top", "bottom"] as const).some(
		(end) =>
			one[end].item !== undefined &&
			one[end].item === other[end].item &&
			Math.abs(xAt(one, end) - xAt(other, end)) <= STRAIGHT,
	);
}

/**
 * How many pairs of lines read as one.
 * @param nets Every net.
 * @returns The count.
 */
function collinearPairs(nets: readonly Net[]): number {
	let count = 0;
	for (const channel of byChannel(nets, (net) => net).values())
		for (const leaving of channel)
			for (const entering of channel) if (collinear(leaving, entering)) count += 1;
	return count;
}

/**
 * Items by the channel their net runs in, each in the order given: only nets
 * of one channel can read as one or swap sides, so a search over pairs need
 * not weigh nets of two channels. On the Archboard server board, weighing
 * every pair made parting a quarter of its layout (TASK-367.27).
 * @param items The items.
 * @param netOf Each item's net.
 * @returns Each channel's items, by channel.
 */
function byChannel<Item>(items: readonly Item[], netOf: (item: Item) => Net): Map<number, Item[]> {
	const channels = new Map<number, Item[]>();
	for (const item of items) {
		const { channel } = netOf(item);
		const held = channels.get(channel);
		if (held === undefined) channels.set(channel, [item]);
		else held.push(item);
	}
	return channels;
}

/**
 * How many pairs of lines swap sides across a channel, which no order of
 * tracks keeps from crossing.
 * @param nets Every net.
 * @returns The count.
 */
function swapped(nets: readonly Net[]): number {
	let count = 0;
	for (const channel of byChannel(nets, (net) => net).values())
		for (const one of channel)
			for (const other of channel)
				if ((one.topX - other.topX) * (one.bottomX - other.bottomX) < 0) count += 1;
	return count;
}

/**
 * The stretches of a line a part may move beyond one end of a net: the whole
 * straight stretch, and, drawn inline, when that runs on through lanes into a
 * label or a card, its lanes alone. Moving only the lanes leaves the line's
 * step at that label or card, away from where the two lines meet, when the
 * label or card has no room to follow. The Blocks engine packs a block among
 * others after it is routed, and there the step it moves costs bends elsewhere.
 * @param scene The scene.
 * @param place The net.
 * @param end Which end the stretch starts at.
 * @returns The stretches, the whole one first.
 */
function stretchesBeyond(
	scene: Scene,
	place: Place,
	end: "top" | "bottom",
): ReturnType<typeof stretchBeyond>[] {
	const whole = stretchBeyond(place.route, place.index, end);
	const cut = whole.findIndex(({ station }) => station.kind !== "lane");
	return scene.inline && cut > 0 ? [whole, whole.slice(0, cut)] : [whole];
}

/**
 * Part one pair of lines that read as one: move the leaving line's upper
 * stretch, or the entering line's lower stretch, a lane aside from the other
 * or onto its own line's column, the nearest move that parts more pairs than
 * it makes and makes no two lines cross.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param routes Every line's nets, top to bottom.
 * @param leaving Where the leaving net is.
 * @param leaving.route Its line.
 * @param leaving.index Its place in it.
 * @param entering Where the entering net is.
 * @param entering.route Its line.
 * @param entering.index Its place in it.
 * @param piece Whether a run of lanes moves only the piece of it on the stretch.
 * @returns Whether they parted.
 */
function part(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly (readonly Net[])[],
	leaving: Place,
	entering: Place,
	piece: boolean,
): boolean {
	const nets = routes.flat();
	const [up, down] = [leaving.route[leaving.index]!, entering.route[entering.index]!];
	const [count, crossing] = [collinearPairs(nets), swapped(nets)];
	// A stretch moved onto its own line's column straightens that line as it
	// parts the pair, so those moves come before a lane aside.
	const own = new Set([up.bottomX, down.topX]);
	const moves = [
		...[down.bottomX - LANE, down.bottomX + LANE, up.bottomX].flatMap((x) =>
			stretchesBeyond(scene, leaving, "top").map((stretch) => ({ x, from: up.topX, stretch })),
		),
		...[up.topX - LANE, up.topX + LANE, down.topX].flatMap((x) =>
			stretchesBeyond(scene, entering, "bottom").map((stretch) => ({
				x,
				from: down.bottomX,
				stretch,
			})),
		),
	].toSorted(
		(one, other) =>
			Number(!own.has(one.x)) - Number(!own.has(other.x)) ||
			Math.abs(one.x - one.from) - Math.abs(other.x - other.from),
	);
	return moves.some(
		({ x, from, stretch }) =>
			Math.abs(x - from) > STRAIGHT &&
			moveStretch(
				scene,
				chains,
				nets,
				stretch,
				x,
				// A lane aside opens a 16 px step on purpose: only a notch is new.
				notched,
				piece,
				() => collinearPairs(nets) < count && swapped(nets) <= crossing,
			),
	);
}

/**
 * Part every pair of lines that read as one where a move can: moving whole
 * runs of lanes first, then, for the pairs still reading as one, only the
 * pieces of runs a stretch stands on.
 * @param scene The scene, its ports and labels placed.
 * @param chains Every relationship's chain.
 * @param routes Every line's nets, top to bottom.
 */
function partCollinear(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly (readonly Net[])[],
): void {
	const places = routes.flatMap((route) => route.map((net, index) => ({ net, route, index })));
	const channels = byChannel(places, ({ net }) => net);
	for (const piece of [false, true])
		for (let pass = 0; pass < PASSES; pass += 1) {
			const parted = places.flatMap((leaving) =>
				channels
					.get(leaving.net.channel)!
					.filter((entering) => collinear(leaving.net, entering.net))
					.map((entering) => part(scene, chains, routes, leaving, entering, piece)),
			);
			if (!parted.some(Boolean)) break;
		}
}

export { collinearPairs, partCollinear };
