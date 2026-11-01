import type { DiagramBox } from "@archboard/board/render-reply";
import {
	bodyShift,
	routePoints,
	routeCrosses,
	type DrawnPoint,
} from "#tests/runtime/support/drawn-routes.ts";
import type { VariantContent } from "@archboard/board/content";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";

/**
 * Parents with an absent or covered frame, even when their atlas retains a box.
 * @param drawing The rendered architecture.
 * @param content Its drawn parts and containment.
 * @returns Each hidden parent and the container that covers it.
 */
export function hiddenParentFrames(drawing: RenderedDiagram, content: VariantContent): string[] {
	const frames = new Map(
		[...drawing.svg.matchAll(/<g\b[^>]*data-semantic-kind="region"[^>]*>/gu)]
			.filter(([tag]) => !tag.includes("data-semantic-part="))
			.map(([tag], index) => [/data-semantic-id="([^"]+)"/u.exec(tag)![1]!, index]),
	);
	const nodes = new Map(content.nodes.map((node) => [node.id, node]));
	const parents = new Set(content.nodes.map((node) => node.parent).filter(Boolean));
	return content.nodes.flatMap((node) => {
		if (!parents.has(node.id) || drawing.atlas.nodes[node.id] === undefined) return [];
		const painted = frames.get(node.id);
		if (painted === undefined) return [`${node.id}: parent has no visible frame`];
		const hidden: string[] = [];
		let parent = node.parent;
		while (parent !== undefined) {
			if ((frames.get(parent) ?? -1) > painted)
				hidden.push(`${node.id}: frame covered by ${parent}, line ends have no visible boundary`);
			parent = nodes.get(parent)?.parent;
		}
		return hidden;
	});
}

/** A frame's seat: an unpainted rectangle that takes the pointer. */
const SEAT =
	/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="10" pointer-events="all"/gu;

/**
 * The box of a seat, in page coordinates.
 * @param seat The seat's match.
 * @param shift What the body moves by.
 * @returns Its box.
 */
function seatBox(seat: RegExpMatchArray, shift: DrawnPoint): DiagramBox {
	return {
		x: Number(seat[1]) + shift.x,
		y: Number(seat[2]) + shift.y,
		width: Number(seat[3]),
		height: Number(seat[4]),
	};
}

/**
 * Whether a point meets a rectangle's boundary within one unit.
 * @param point The route end.
 * @param box The visible card or header.
 * @returns Whether the line meets that box.
 */
function onBoundary(point: DrawnPoint, box: DiagramBox): boolean {
	const right = box.x + box.width,
		bottom = box.y + box.height;
	const horizontal = point.x >= box.x - 1 && point.x <= right + 1;
	const vertical = point.y >= box.y - 1 && point.y <= bottom + 1;
	return (
		(horizontal && Math.min(Math.abs(point.y - box.y), Math.abs(point.y - bottom)) <= 1) ||
		(vertical && Math.min(Math.abs(point.x - box.x), Math.abs(point.x - right)) <= 1)
	);
}

/**
 * The painted header cards of semantic containers, in page coordinates.
 * @param drawing The rendered architecture.
 * @returns Their visible faces, including the base where lines attach.
 */
export function headerCards(drawing: RenderedDiagram): Map<string, DiagramBox> {
	const shift = bodyShift(drawing.svg);
	const headers = new Map<string, DiagramBox>();
	for (const chunk of drawing.svg.split(/(?=<g data-semantic-kind=)/u)) {
		const tag = /^<g[^>]*>/u.exec(chunk)?.[0];
		if (
			tag === undefined ||
			!tag.includes('data-semantic-kind="region"') ||
			tag.includes("data-semantic-part=")
		)
			continue;
		const id = /data-semantic-id="([^"]+)"/u.exec(tag)?.[1];
		// A frame seats its body first and its edge tab second.
		const tab = [...chunk.matchAll(SEAT)][1];
		if (id !== undefined && tab !== undefined) headers.set(id, seatBox(tab, shift));
	}
	return headers;
}

/**
 * The bodies of semantic containers, in page coordinates: the frame below its tab.
 * @param drawing The rendered architecture.
 * @returns Their boxes, by container.
 */
function frameBodies(drawing: RenderedDiagram): Map<string, DiagramBox> {
	const shift = bodyShift(drawing.svg);
	const bodies = new Map<string, DiagramBox>();
	for (const chunk of drawing.svg.split(/(?=<g data-semantic-kind=)/u)) {
		const id = /^<g data-semantic-kind="region" data-semantic-id="([^"]+)"/u.exec(chunk)?.[1];
		const body = [...chunk.matchAll(SEAT)][0];
		if (id !== undefined && body !== undefined && !chunk.startsWith("<g data-semantic-part"))
			bodies.set(id, seatBox(body, shift));
	}
	return bodies;
}

/**
 * Line ends that miss the boundary of their semantic card or parent frame.
 * @param drawing The rendered architecture.
 * @param content The relationships and their intended ends.
 * @returns Each detached source or arrowhead with its intended card.
 */
export function endsOffCards(drawing: RenderedDiagram, content: VariantContent): string[] {
	const routes = routePoints(drawing.svg);
	const headers = headerCards(drawing);
	const bodies = frameBodies(drawing);
	return content.edges.flatMap((edge) => {
		const points = routes.get(edge.id);
		if (points === undefined) return [];
		const ends = [
			[edge.from, points[0]!],
			[edge.to, points.at(-1)!],
		] as const;
		return ends.flatMap(([id, point]) => {
			const faces = [drawing.atlas.nodes[id], headers.get(id), bodies.get(id)].filter(
				(face) => face !== undefined,
			);
			return faces.length > 0 && !faces.some((face) => onBoundary(point, face))
				? [`${edge.id}: line end misses ${id}`]
				: [];
		});
	});
}

/**
 * Routes that pass through a parent header's face, even beside its words.
 * @param drawing The rendered architecture.
 * @returns Each route and the header card that it crosses.
 */
export function routesThroughParentHeaders(drawing: RenderedDiagram): string[] {
	const routes = routePoints(drawing.svg);
	return [...headerCards(drawing)].flatMap(([parent, box]) =>
		[...routes]
			.filter(([, points]) => routeCrosses(points, box))
			.map(([id]) => `${id}: route crosses ${parent} header card`),
	);
}
