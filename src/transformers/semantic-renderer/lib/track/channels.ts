// Ports and tracks (TASK-349). A net is one relationship's run between two
// stations on neighbouring bands: it leaves the upper station straight down,
// crosses the channel on a track, and enters the lower station straight down.
// Cards spread their ports along a face, each as close to the other end as
// spacing allows; each channel's turning nets get tracks in the order that
// crosses least, every net on the highest track below the overlapping nets
// above it.
import type { Box } from "@/transformers/semantic-renderer/lib/geometry";
import { LANE, type Station } from "@/transformers/semantic-renderer/lib/track/chains";
import type { Item } from "@/transformers/semantic-renderer/lib/track/scene";

/** How far a port keeps from a card's corner. */
const PORT_MARGIN = 20;

/** One relationship's run between two stations on neighbouring bands. */
interface Net {
	readonly edge: string;
	readonly order: number;
	readonly channel: number;
	readonly top: Station;
	readonly bottom: Station;
	/** Where it leaves the upper station and enters the lower one. */
	topX: number;
	bottomX: number;
	track: number;
}

/** One side of a net that ends on a card, and where it would like its port. */
interface PortRequest {
	readonly net: Net;
	readonly side: "top" | "bottom";
	readonly wanted: number;
}

/**
 * Spread the ports on one face, each as close to its other end as spacing allows.
 * @param face The face's box.
 * @param wanted Each net's preferred x, in the order the ports must keep.
 * @returns The ports' x, in the same order.
 */
function spreadPorts(face: Box, wanted: readonly number[]): number[] {
	const low = face.x + Math.min(PORT_MARGIN, face.width / 2);
	const high = face.x + face.width - Math.min(PORT_MARGIN, face.width / 2);
	const count = wanted.length;
	const gap = count > 1 ? Math.min(LANE, (high - low) / (count - 1)) : 0;
	const ports = wanted.map((x) => Math.min(high, Math.max(low, x)));
	for (let index = 1; index < count; index += 1)
		ports[index] = Math.max(ports[index]!, ports[index - 1]! + gap);
	if (count > 0 && ports[count - 1]! > high) {
		ports[count - 1] = high;
		for (let index = count - 2; index >= 0; index -= 1)
			ports[index] = Math.min(ports[index]!, ports[index + 1]! - gap);
	}
	return ports;
}

/**
 * Every port request, by the card and face it is made on.
 * @param nets Every net.
 * @returns The requests, keyed by card, then face.
 */
function portRequests(nets: readonly Net[]): Map<Item, PortRequest[]> {
	const faces = new Map<Item, PortRequest[]>();
	for (const net of nets) {
		for (const side of ["top", "bottom"] as const) {
			const station = net[side];
			if (station.kind !== "card") continue;
			const wanted = side === "top" ? net.bottomX : net.topX;
			faces.set(station.item!, [...(faces.get(station.item!) ?? []), { net, side, wanted }]);
		}
	}
	return faces;
}

/**
 * Give the nets on one face their ports.
 * @param item The card.
 * @param requests Its requests on that face.
 */
function placePorts(item: Item, requests: readonly PortRequest[]): void {
	const ordered = requests.toSorted(
		(one, other) => one.wanted - other.wanted || one.net.order - other.net.order,
	);
	const ports = spreadPorts(
		item.box,
		ordered.map(({ wanted }) => wanted),
	);
	ordered.forEach(({ net, side }, index) => {
		if (side === "top") net.topX = ports[index]!;
		else net.bottomX = ports[index]!;
	});
}

/**
 * Give every net its x at both ends: cards spread their ports, labels and lanes
 * keep their x. Twice, so a port can follow the other end's port.
 * @param nets Every net.
 */
function assignPorts(nets: readonly Net[]): void {
	for (let pass = 0; pass < 2; pass += 1) {
		for (const [item, requests] of portRequests(nets)) {
			placePorts(
				item,
				requests.filter(({ side }) => side === "top"),
			);
			placePorts(
				item,
				requests.filter(({ side }) => side === "bottom"),
			);
		}
	}
}

/**
 * The horizontal interval a turning net takes on its track.
 * @param net The net.
 * @returns Its low and high x, widened by half a lane.
 */
function spanOf(net: Net): [number, number] {
	return [Math.min(net.topX, net.bottomX) - LANE / 2, Math.max(net.topX, net.bottomX) + LANE / 2];
}

/**
 * Whether an x falls strictly inside a net's run.
 * @param x The x.
 * @param net The net.
 * @returns True when a vertical at x would cross its track.
 */
function within(x: number, net: Net): boolean {
	return x > Math.min(net.topX, net.bottomX) && x < Math.max(net.topX, net.bottomX);
}

/**
 * Whether two nets' runs overlap, so they cannot share a track.
 * @param one A net.
 * @param other Another net.
 * @returns True when they overlap.
 */
function overlap(one: Net, other: Net): boolean {
	const [a, b] = spanOf(one);
	const [c, d] = spanOf(other);
	return a < d && c < b;
}

/**
 * How many crossings one net above another costs; a lower pin under an upper
 * one would run two lines down one column, which is never allowed.
 * @param above The net on the higher track.
 * @param below The net on the lower track.
 * @returns The cost.
 */
function costAbove(above: Net, below: Net): number {
	if (Math.abs(below.topX - above.bottomX) < LANE / 2) return 100;
	return Number(within(below.topX, above)) + Number(within(above.bottomX, below));
}

/**
 * How much a net would rather be above the nets it overlaps than below them.
 * @param net The net.
 * @param nets Every turning net in its channel.
 * @returns The balance of its preferences.
 */
function preferenceOf(net: Net, nets: readonly Net[]): number {
	return nets.reduce(
		(sum, other) =>
			other === net || !overlap(net, other)
				? sum
				: sum + Math.sign(costAbove(other, net) - costAbove(net, other)),
		0,
	);
}

/**
 * Assign the tracks of one channel: the order that crosses least, each run on
 * the highest track below every overlapping run above it.
 * @param nets The channel's nets that turn.
 * @returns How many tracks the channel holds.
 */
function assignTracks(nets: readonly Net[]): number {
	const preference = new Map(nets.map((net) => [net, preferenceOf(net, nets)]));
	const ordered = nets.toSorted(
		(one, other) =>
			preference.get(other)! - preference.get(one)! ||
			spanOf(one)[0] - spanOf(other)[0] ||
			one.order - other.order,
	);
	const placed: Net[] = [];
	for (const net of ordered) {
		const above = placed.filter((other) => overlap(net, other));
		net.track = above.length === 0 ? 0 : Math.max(...above.map(({ track }) => track)) + 1;
		placed.push(net);
	}
	return placed.length === 0 ? 0 : Math.max(...placed.map(({ track }) => track)) + 1;
}

export { assignPorts, assignTracks, type Net };
