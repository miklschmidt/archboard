import type { DiagramBox } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";
import { headerCards } from "#tests/runtime/support/drawn-parents.ts";
import { routePoints, type DrawnPoint } from "#tests/runtime/support/drawn-routes.ts";

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
 * @returns Each card and pair of relationships within three units of one line.
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
						Math.abs(one.at - other.at) <= 3,
				)
				.map((other) => `${node}: ${one.edge} / ${other.edge}`),
		),
	);
}
