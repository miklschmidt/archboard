// Small jogs closed (visual polish). A line whose neighbouring stations stand
// a few points apart is drawn with a sideways step too short for its two
// bends: a notch in a line that should run straight. A step of up to two
// lanes still reads as a kink in one line rather than a route, with no
// straight between its bends, and is closed the same way. Each such step is
// closed by moving one of its ends onto the other's column where that end can move
// without crowding anything: a card's own port along its face, a run of lanes
// onto a free column, or a label box clear of the rest of its band. A move
// that would bend a line that ran straight on the moved station's other side is not made.
//
// Drawn as blocks, a step at a label of any width that turns its line back
// against its last step is closed the same way.
//
// A card a line enters on top and another leaves at the bottom a few points
// over is such a step too: the two read as one line through the card with a
// notch in it, and one end moves onto the other's column.
//
// A step no move can close, since whatever stands beside its ends holds them,
// is opened instead to the shortest step its two bends turn whole. The same
// moves part two lines that read as one (parting.ts).
import { BEND_RADIUS } from "#shared/constants/spacing.ts";
import {
	LANE,
	moveRun,
	runOf,
	type Chain,
	type Station,
} from "#shared/rules/track/routes/chains.ts";
import type { Net } from "#shared/rules/track/channels/channels.ts";
import { nudgeLabel } from "#shared/rules/track/labels/labels.ts";
import { centreX, cardFace, type Scene } from "#shared/rules/track/scene/scene.ts";
import { CARD_RADIUS } from "#shared/constants/design.ts";

/** Under this, two stations stand in one column. */
const STRAIGHT = 0.5;
/** How near its card's corner a port may come to let its line run straight. */
const CORNER_ROOM = 12;
/** How many passes close jogs that one move opens elsewhere. */
const PASSES = 3;

/** Which end of a net a station stands at. */
type End = "top" | "bottom";

/** Where a net stands: its line, top to bottom, and its place in it. */
interface Place {
	readonly route: readonly Net[];
	readonly index: number;
}

/**
 * How far a net steps sideways.
 * @param net The net.
 * @returns The step.
 */
function step(net: Net): number {
	return Math.abs(net.topX - net.bottomX);
}

/**
 * Whether a net steps sideways by less than its two bends need.
 * @param net The net.
 * @returns True for a step too short to turn.
 */
function notched(net: Net): boolean {
	return step(net) > STRAIGHT && step(net) < 2 * BEND_RADIUS;
}

/** Up to this, a sideways step reads as a kink in one line, not a route: two bends and at most a lane between. */
const KINK = 2 * LANE;

/**
 * Whether a net steps sideways by no more than a kink.
 * @param net The net.
 * @returns True for a kink.
 */
function kinked(net: Net): boolean {
	return step(net) > STRAIGHT && step(net) <= KINK + STRAIGHT;
}

/**
 * Whether a net from or to a label steps back against the line's last step
 * before it: the line runs out one way to its label and back the other.
 * @param route The line's nets, top to bottom.
 * @param index The net's place in it.
 * @returns True when it does.
 */
function turnsBack(route: readonly Net[], index: number): boolean {
	const net = route[index]!;
	if (net.top.kind !== "label" && net.bottom.kind !== "label") return false;
	const before = route.slice(0, index).findLast((one) => step(one) > STRAIGHT);
	if (before === undefined || step(net) <= STRAIGHT) return false;
	return Math.sign(net.bottomX - net.topX) !== Math.sign(before.bottomX - before.topX);
}

/**
 * Where a net meets one of its stations.
 * @param net The net.
 * @param end Which end.
 * @returns The x.
 */
function xAt(net: Net, end: End): number {
	return end === "top" ? net.topX : net.bottomX;
}

/**
 * Stand a net's end at an x.
 * @param net The net.
 * @param end Which end.
 * @param x The x.
 */
function setX(net: Net, end: End, x: number): void {
	if (end === "top") net.topX = x;
	else net.bottomX = x;
}

/**
 * Whether a net's end at a card is a trunk's shared port.
 * @param net The net.
 * @param end Which end.
 * @returns True when a trunk owns it.
 */
function trunkAt(net: Net, end: End): boolean {
	const trunk = net.trunk;
	return trunk !== undefined && (trunk.side === end || trunk.whole);
}

/**
 * Whether an x stands on a card's face, clear of its corners: a corner's
 * room in from its box, and on the card itself clear of its rounded corner,
 * for a card laid out as the region round it (`cardFace`).
 * @param station The card.
 * @param x The x.
 * @returns True when a port may stand there.
 */
function onFace(station: Station, x: number): boolean {
	const { x: left, width } = station.item!.box;
	const room = Math.min(CORNER_ROOM, width / 2);
	const face = cardFace(station.item!);
	return (
		x >= left + room &&
		x <= left + width - room &&
		x >= face.x + CARD_RADIUS &&
		x <= face.x + face.width - CARD_RADIUS
	);
}

/**
 * Move a card's own port along its face to an x, when the port is no trunk's, held to no point
 * (`points.ts`), and clear of the face's corners and its other ports.
 * @param nets Every net.
 * @param net The net whose port moves.
 * @param end Which of its ends is the card.
 * @param x The x.
 * @returns Whether it moved.
 */
function movePort(nets: readonly Net[], net: Net, end: End, x: number): boolean {
	if (trunkAt(net, end) || net[end].at !== undefined || !onFace(net[end], x)) return false;
	const others = nets.filter((other) => other !== net && other[end].item === net[end].item);
	if (others.some((other) => Math.abs(xAt(other, end) - x) < LANE)) return false;
	setX(net, end, x);
	return true;
}

/**
 * The stretch of a line beyond one end of a net: that end's station, and every
 * station after it the line reaches straight, each with the net that reaches it.
 * @param route The line's nets, top to bottom.
 * @param index The net's place in it.
 * @param end Which end the stretch starts at.
 * @returns The stations, nearest first, each with the net arriving at it from the net's side.
 */
function stretchBeyond(
	route: readonly Net[],
	index: number,
	end: End,
): { station: Station; net: Net; end: End }[] {
	const stretch = [{ station: route[index]![end], net: route[index]!, end }];
	const onward = end === "bottom" ? 1 : -1;
	for (let at = index + onward; at >= 0 && at < route.length; at += onward) {
		const next = route[at]!;
		if (step(next) > STRAIGHT) break;
		stretch.push({ station: next[end], net: next, end });
	}
	return stretch;
}

/** What a stretch's move changes, to put back when part of it cannot move. */
interface Saved {
	readonly lanes: Map<Station, number>;
	readonly boxes: Map<Station, Station["item"]>;
	readonly ends: Map<Net, [number, number]>;
}

/**
 * Keep what moving some stations could change.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param stations The stations.
 * @returns The saved state.
 */
function save(chains: readonly Chain[], nets: readonly Net[], stations: readonly Station[]): Saved {
	const lanes = new Map<Station, number>();
	for (const station of stations)
		for (const lane of runOf(chains, station)?.lanes ?? []) lanes.set(lane, lane.x);
	const boxes = new Map(
		stations
			.filter(({ kind }) => kind === "label")
			.map((station) => [station, { ...station.item! }] as const),
	);
	return { lanes, boxes, ends: new Map(nets.map((net) => [net, [net.topX, net.bottomX]])) };
}

/**
 * Put back what a failed stretch moved.
 * @param saved The saved state.
 */
function restore(saved: Saved): void {
	for (const [lane, x] of saved.lanes) lane.x = x;
	for (const [station, item] of saved.boxes) station.item!.box = item!.box;
	for (const [net, [top, bottom]] of saved.ends) {
		net.topX = top;
		net.bottomX = bottom;
	}
}

/**
 * Stand every net's end at its station where the station is a lane or a label.
 * @param nets Every net.
 */
function follow(nets: readonly Net[]): void {
	for (const net of nets)
		for (const end of ["top", "bottom"] as const) {
			const station = net[end];
			if (station.kind === "lane") setX(net, end, station.x);
			if (station.kind === "label") setX(net, end, centreX(station.item!));
		}
}

/**
 * What a move must not do, read before it: notch a line that ran clear, or
 * step a line through a card that ran through it straight, which trades one
 * jog for another.
 * @param nets Every net.
 * @param guard Which steps count as new ones: notches, or for a pass that
 * closes kinks, kinks too, so closing one never opens another.
 * @returns Whether the nets, once moved, still keep clear of new steps.
 */
function keepsClean(nets: readonly Net[], guard: (net: Net) => boolean): () => boolean {
	const notches = new Set(nets.filter(guard));
	const steps = new Set(cardStepKeys(nets));
	return () =>
		nets.every((net) => notches.has(net) || !guard(net)) &&
		cardStepKeys(nets).every((key) => steps.has(key));
}

/**
 * Move one station onto a column: a run of lanes onto it where it is free, a
 * label box where it stays clear, and a card by its own port.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param one The station, with the net arriving at it.
 * @param one.station The station.
 * @param one.net The net.
 * @param one.end Which end of the net it stands at.
 * @param x The column.
 * @param piece Whether a run of lanes moves only the piece of it the station stands in.
 * @returns Whether it moved.
 */
function moveStation(
	scene: Scene,
	chains: readonly Chain[],
	nets: readonly Net[],
	{ station, net, end }: { station: Station; net: Net; end: End },
	x: number,
	piece: boolean,
): boolean {
	if (station.kind === "lane") return station.x === x || moveRun(scene, chains, station, x, piece);
	if (station.kind === "label") return nudgeLabel(scene, nets, station.item!, x);
	return movePort(nets, net, end, x);
}

/**
 * Move a stretch of stations onto one column: each run of lanes onto a free
 * column, each label box where it stays clear, and a card at its far end by
 * its own port. All of it moves, or none, and none when the move would notch
 * another line.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param stretch The stations, each with the net arriving at it.
 * @param x The column.
 * @param guard Which steps the move must not open on another line.
 * @param piece Whether each run of lanes moves only the piece of it on the stretch.
 * @param better Whether the drawing is better for the move, asked once it is made.
 * @returns Whether it moved.
 */
function moveStretch(
	scene: Scene,
	chains: readonly Chain[],
	nets: readonly Net[],
	stretch: readonly { station: Station; net: Net; end: End }[],
	x: number,
	guard: (net: Net) => boolean,
	piece: boolean,
	better: () => boolean = () => true,
): boolean {
	const saved = save(
		chains,
		nets,
		stretch.map(({ station }) => station),
	);
	const kept = keepsClean(nets, guard);
	const moved = stretch.every((one) => moveStation(scene, chains, nets, one, x, piece));
	if (moved) follow(nets);
	const done = moved && kept() && better();
	if (!done) restore(saved);
	return done;
}

/** What a pass keeps from growing: a count over every net, never more after a move than before it. */
type Kept = (nets: readonly Net[]) => number;

/**
 * What a pass that runs first keeps: nothing.
 * @returns None.
 */
function nothing(): number {
	return 0;
}

/**
 * Whether a move leaves no more of what a pass keeps than there was before it.
 * @param nets Every net.
 * @param kept What the pass keeps from growing.
 * @returns The test, asked once the move is made.
 */
function noMore(nets: readonly Net[], kept: Kept): () => boolean {
	const before = kept(nets);
	return () => kept(nets) <= before;
}

/**
 * Close one net's short step by moving the stretch beyond one of its ends
 * onto the other end's column, with the lines that run straight on through
 * the card it ends on ({@link throughCard}) when it cannot move alone.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param lines Every line's nets, top to bottom, and every net.
 * @param lines.routes Every line's nets, top to bottom.
 * @param lines.nets Every net.
 * @param place The net and its line.
 * @param place.route The net's line, top to bottom.
 * @param place.index The net's place in it.
 * @param kept What the move must not add to.
 * @returns Whether it closed.
 */
function close(
	scene: Scene,
	chains: readonly Chain[],
	{ routes, nets }: { routes: readonly (readonly Net[])[]; nets: readonly Net[] },
	{ route, index }: Place,
	kept: Kept,
): boolean {
	const net = route[index]!;
	/**
	 * Move some stations onto a column, where nothing the pass keeps grows.
	 * @param x The column.
	 * @param moved The stations, each with the net arriving at it.
	 * @returns Whether they moved.
	 */
	const move = (x: number, moved: readonly { station: Station; net: Net; end: End }[]): boolean =>
		moveStretch(scene, chains, nets, moved, x, kinked, false, noMore(nets, kept));
	return (["top", "bottom"] as const).some((end) => {
		const x = xAt(net, end === "top" ? "bottom" : "top");
		const stretch = stretchBeyond(route, index, end);
		if (move(x, stretch)) return true;
		const through = throughCard(routes, stretch.at(-1)!);
		return through.length > 0 && move(x, [...stretch, ...through]);
	});
}

/**
 * The lines that run straight on through a card laid out as the region
 * round it from where a stretch ends on it: each line that leaves its other
 * face at the same x, and the straight stretch beyond. Moving the stretch's
 * end alone would step the two through the card, so they move with it: in
 * Reading a board (Track), the line out of Pane session kept a step of 16 px
 * under its region, since its port could not move without notching the line
 * into Pane session.
 * @param routes Every line's nets, top to bottom.
 * @param last The stretch's last station, with the net arriving at it.
 * @param last.station The station.
 * @param last.net The net.
 * @param last.end Which end of the net it stands at.
 * @returns The stations to move with it; none when it ends on no such card.
 */
function throughCard(
	routes: readonly (readonly Net[])[],
	{ station, net, end }: { station: Station; net: Net; end: End },
): { station: Station; net: Net; end: End }[] {
	if (station.kind !== "card" || station.item!.inset === undefined) return [];
	const beyond = end === "top" ? "bottom" : "top";
	const x = xAt(net, end);
	return routes.flatMap((route) =>
		route.flatMap((other, index) =>
			other[beyond].item === station.item &&
			other.wall === undefined &&
			Math.abs(xAt(other, beyond) - x) <= STRAIGHT
				? cardSide({ route, index }, beyond)
				: [],
		),
	);
}

/**
 * Whether two x stand closer than a line's two bends can turn between, yet apart.
 * @param one An x.
 * @param other Another.
 * @returns True for such a step.
 */
function tooShort(one: number, other: number): boolean {
	const gap = Math.abs(one - other);
	return gap > STRAIGHT && gap < 2 * BEND_RADIUS;
}

/**
 * Every card a line enters on top and another leaves at the bottom, their
 * two ends a step too short to turn apart: the two read as one line through
 * the card with a notch in it.
 * @param routes Every line's nets, top to bottom.
 * @returns Each step, the line in and the line out.
 */
function cardSteps(routes: readonly (readonly Net[])[]): { into: Place; outOf: Place }[] {
	const places = routes.flatMap((route) =>
		route.flatMap((net, index) => (net.wall === undefined ? [{ route, index, net }] : [])),
	);
	const into = places.filter(({ net }) => net.bottom.kind === "card");
	const outOf = places.filter(({ net }) => net.top.kind === "card");
	return into.flatMap((one) =>
		outOf
			.filter(({ net }) => net.top.item === one.net.bottom.item)
			.filter(({ net }) => tooShort(net.topX, one.net.bottomX))
			.map((other) => ({ into: one, outOf: other })),
	);
}

/**
 * A key for every card step among some nets, to tell a new one from an old one.
 * @param nets Every net.
 * @returns The keys.
 */
function cardStepKeys(nets: readonly Net[]): string[] {
	const into = new Map<Station["item"], Net[]>();
	for (const net of nets.filter(({ wall, bottom }) => wall === undefined && bottom.kind === "card"))
		into.set(net.bottom.item, [...(into.get(net.bottom.item) ?? []), net]);
	return nets.flatMap((net) =>
		net.wall === undefined && net.top.kind === "card"
			? (into.get(net.top.item) ?? [])
					.filter(({ bottomX }) => tooShort(bottomX, net.topX))
					.map(({ bottomX }) => `${net.edge}|${net.channel}|${bottomX.toFixed(2)}`)
			: [],
	);
}

/**
 * The end of a net at a card, and the straight stretch beyond it when the
 * net runs straight from the card.
 * @param place The net.
 * @param end Which end is the card.
 * @returns The stations to move together.
 */
function cardSide(place: Place, end: End): { station: Station; net: Net; end: End }[] {
	const net = place.route[place.index]!;
	const beyond = end === "top" ? "bottom" : "top";
	const straight = step(net) <= STRAIGHT;
	return [
		{ station: net[end], net, end },
		...(straight ? stretchBeyond(place.route, place.index, beyond) : []),
	];
}

/**
 * Close one card step: move the line out of the card, and the straight stretch
 * below it, onto the line in's column; else the line in onto the line out's.
 * @param scene The scene.
 * @param chains Every relationship's chain.
 * @param nets Every net.
 * @param steps The card step.
 * @param steps.into The line into the card.
 * @param steps.outOf The line out of it.
 * @param kept What the move must not add to.
 * @returns Whether it closed.
 */
function closeCardStep(
	scene: Scene,
	chains: readonly Chain[],
	nets: readonly Net[],
	{ into, outOf }: { into: Place; outOf: Place },
	kept: Kept,
): boolean {
	const [inNet, outNet] = [into.route[into.index]!, outOf.route[outOf.index]!];
	if (!tooShort(inNet.bottomX, outNet.topX)) return false;
	const [out, inward] = [cardSide(outOf, "top"), cardSide(into, "bottom")];
	return (
		moveStretch(scene, chains, nets, out, inNet.bottomX, kinked, false, noMore(nets, kept)) ||
		moveStretch(scene, chains, nets, inward, outNet.topX, kinked, false, noMore(nets, kept))
	);
}

/**
 * Close every step too short for its two bends that a move can close, and,
 * in the first pass, every step back at a label ({@link turnsBack}): most
 * such steps run round something, which tried in every pass cost time.
 * @param scene The scene, its ports placed.
 * @param chains Every relationship's chain.
 * @param routes Every line's nets, top to bottom.
 * @param kept What no move may add to, so a pass after another keeps what
 * the earlier one did: none when nothing ran before it.
 */
function closeJogs(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly (readonly Net[])[],
	kept: Kept = nothing,
): void {
	const nets = routes.flat();
	for (let pass = 0; pass < PASSES; pass += 1) {
		const closed = routes.flatMap((route) =>
			route.map((net, index) =>
				(kinked(net) || (pass === 0 && turnsBack(route, index))) && net.wall === undefined
					? close(scene, chains, { routes, nets }, { route, index }, kept)
					: false,
			),
		);
		for (const one of cardSteps(routes)) closed.push(closeCardStep(scene, chains, nets, one, kept));
		if (!closed.some(Boolean)) return;
	}
}

/**
 * Open every step still too short for its two bends, one no move could close,
 * to the shortest step they turn whole: the stretch beyond one end moves out
 * to two bend radii from the other end, where it may move without notching
 * another line or stepping one through a card.
 * @param scene The scene, its ports and labels placed.
 * @param chains Every relationship's chain.
 * @param routes Every line's nets, top to bottom.
 */
function openNotches(
	scene: Scene,
	chains: readonly Chain[],
	routes: readonly (readonly Net[])[],
): void {
	const nets = routes.flat();
	for (const route of routes)
		route.forEach((net, index) => {
			if (!notched(net) || net.wall !== undefined) return;
			(["top", "bottom"] as const).some((end) => {
				const other = xAt(net, end === "top" ? "bottom" : "top");
				const x = other + Math.sign(xAt(net, end) - other) * 2 * BEND_RADIUS;
				return moveStretch(
					scene,
					chains,
					nets,
					stretchBeyond(route, index, end),
					x,
					notched,
					false,
				);
			});
		});
}

export {
	PASSES,
	STRAIGHT,
	closeJogs,
	moveStretch,
	notched,
	openNotches,
	stretchBeyond,
	xAt,
	type Place,
};
