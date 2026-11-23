import type { DiagramBox } from "@archboard/model/render-reply";
import type { VariantContent } from "@archboard/model/content";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { headerCards } from "#tests/runtime/support/drawn-parents.ts";
import { routePoints, type DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";

/**
 * How far apart two lines at opposite walls of one card must stand to read as
 * two lines, not as one line behind the card: one lane, the gap the layout
 * keeps between two parallel lines.
 */
const APART = 16;

/** Each contact holds a perpendicular run at one card wall. */
interface Contact {
	readonly edge: string;
	readonly axis: "x" | "y";
	readonly side: number;
	readonly at: number;
}

/**
 * Read the outward run at a card with tolerance for painted endpoint rounding.
 * @param edge The relationship.
 * @param point Its contact.
 * @param next The adjacent point away from the card.
 * @param box The visible card.
 * @returns Its wall and line, or nothing for a non-card contact.
 */
function contact(
	edge: string,
	point: DrawnPoint,
	next: DrawnPoint,
	box: DiagramBox,
): Contact | undefined {
	for (const axis of ["x", "y"] as const) {
		const along = axis === "x" ? "y" : "x";
		const size = axis === "x" ? box.width : box.height;
		const span = axis === "x" ? box.height : box.width;
		if (
			Math.abs(point[along] - next[along]) > 0.1 ||
			point[along] < box[along] ||
			point[along] > box[along] + span
		)
			continue;
		for (const side of [-1, 1]) {
			const wall = box[axis] + (side === 1 ? size : 0);
			if (Math.abs(point[axis] - wall) <= 2 && side * (next[axis] - point[axis]) > 0.1)
				return { edge, axis, side, at: point[along] };
		}
	}
	return undefined;
}

/**
 * Find distinct routes that read as one line through opposite card walls.
 * @param drawing The painted architecture.
 * @param content The relationships and their intended cards.
 * @returns Each card and pair of relationships nearer one line than {@link APART}.
 */
export function collinearPorts(drawing: RenderedDiagram, content: VariantContent): string[] {
	const routes = routePoints(drawing.svg);
	const headers = headerCards(drawing);
	const contacts = new Map<string, Contact[]>();
	for (const edge of content.edges) {
		const points = routes.get(edge.id);
		if (points === undefined || points.length < 2) continue;
		for (const [node, point, next] of [
			[edge.from, points[0]!, points[1]!],
			[edge.to, points.at(-1)!, points.at(-2)!],
		] as const) {
			const box = headers.get(node) ?? drawing.atlas.nodes[node];
			const port = box === undefined ? undefined : contact(edge.id, point, next, box);
			if (port === undefined) continue;
			const list = contacts.get(node) ?? [];
			list.push(port);
			contacts.set(node, list);
		}
	}
	return [...contacts].flatMap(([node, ports]) =>
		ports.flatMap((one, index) =>
			ports
				.slice(index + 1)
				.filter(
					(other) =>
						one.edge !== other.edge &&
						one.axis === other.axis &&
						one.side !== other.side &&
						// Decimal SVG coordinates can subtract a few binary rounding units below a lane.
						Math.abs(one.at - other.at) < APART - 1e-7,
				)
				.map((other) => `${node}: ${one.edge} / ${other.edge}`),
		),
	);
}

/** How far a line's end may stand off its wall and still end on it: a painted rounding. */
const ON_WALL = 2;

/** How far a group's middle may stand from its wall's middle and still be centred. */
const CENTRED = 1;

/** How far a door keeps its ports from its rounded corners, the least a wall keeps. */
const CORNER = 12;

/** One end of a line on a card's wall. */
interface End {
	readonly edge: string;
	/** The wall: which axis it lies across, and which side of the box. */
	readonly wall: string;
	readonly at: number;
	/** Where the wall starts and ends along it. */
	readonly from: number;
	readonly to: number;
}

/**
 * Where one end of a line meets its card: the wall it leaves from, toward its next point, or
 * nothing when it ends on no wall of the box.
 * @param edge The relationship.
 * @param point Its end.
 * @param next The next point, away from the card.
 * @param box The card.
 * @returns The end on its wall.
 */
function endOn(
	edge: string,
	point: DrawnPoint,
	next: DrawnPoint,
	box: DiagramBox,
): End | undefined {
	for (const axis of ["x", "y"] as const) {
		const along = axis === "x" ? "y" : "x";
		const size = axis === "x" ? box.width : box.height;
		const span = axis === "x" ? box.height : box.width;
		if (Math.abs(point[along] - next[along]) > 0.1) continue;
		for (const side of [-1, 1]) {
			const wall = box[axis] + (side === 1 ? size : 0);
			if (Math.abs(point[axis] - wall) <= ON_WALL && side * (next[axis] - point[axis]) > 0.1)
				return {
					edge,
					wall: `${axis}${side}`,
					at: point[along],
					from: box[along],
					to: box[along] + span,
				};
		}
	}
	return undefined;
}

/**
 * Every line's end on each card, by card and wall.
 * @param drawing The painted architecture.
 * @param content The relationships and the cards they name.
 * @returns The ends, by card and wall.
 */
function endsByWall(drawing: RenderedDiagram, content: VariantContent): Map<string, End[]> {
	const routes = routePoints(drawing.svg);
	const headers = headerCards(drawing);
	const walls = new Map<string, End[]>();
	for (const edge of content.edges) {
		const points = routes.get(edge.id);
		if (points === undefined || points.length < 2) continue;
		for (const [node, point, next] of [
			[edge.from, points[0]!, points[1]!],
			[edge.to, points.at(-1)!, points.at(-2)!],
		] as const) {
			const box = headers.get(node) ?? drawing.atlas.nodes[node];
			const end = box === undefined ? undefined : endOn(edge.id, point, next, box);
			if (end === undefined) continue;
			const key = `${node} ${end.wall}`;
			walls.set(key, [...(walls.get(key) ?? []), end]);
		}
	}
	return walls;
}

/**
 * Every line's end that stands past the ends of the wall it meets, where its mark points at the
 * space beside the card rather than at the card.
 * @param drawing The painted architecture.
 * @param content The relationships and the cards they name.
 * @returns Each such end, named by card, wall and relationship.
 */
export function endsOffWalls(drawing: RenderedDiagram, content: VariantContent): string[] {
	return [...endsByWall(drawing, content)].flatMap(([wall, ends]) =>
		ends
			.filter((end) => end.at < end.from - 0.05 || end.at > end.to + 0.05)
			.map((end) => `${wall}: ${end.edge}`),
	);
}

/**
 * Every wall of a card whose ends do not stand as one group in its middle, where the wall has
 * room for the group: a port leaves the middle only to make room.
 * @param drawing The painted architecture.
 * @param content The relationships and the cards they name.
 * @returns Each such wall, named by card and wall, with how far its group stands off.
 */
export function wallsOffCentre(drawing: RenderedDiagram, content: VariantContent): string[] {
	const containers = headerCards(drawing);
	return [...endsByWall(drawing, content)].flatMap(([wall, ends]) => {
		if (containers.has(wall.split(" ")[0]!)) return [];
		const ats = ends.map((end) => end.at);
		const [low, high] = [Math.min(...ats), Math.max(...ats)];
		const { from, to } = ends[0]!;
		const roomy = high - low + 2 * CORNER <= to - from;
		const off = (low + high) / 2 - (from + to) / 2;
		return roomy && Math.abs(off) > CENTRED ? [`${wall}: ${off.toFixed(1)} off`] : [];
	});
}
