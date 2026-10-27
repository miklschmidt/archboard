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
		// A tray paints its header slab below the route layer. Its first rounded
		// card rectangle includes the base where a line meets that header.
		const slab =
			/<rect x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="8"/u.exec(chunk);
		if (id !== undefined && slab !== null)
			headers.set(id, {
				x: Number(slab[1]) + shift.x,
				y: Number(slab[2]) + shift.y,
				width: Number(slab[3]),
				height: Number(slab[4]),
			});
	}
	return headers;
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
	return content.edges.flatMap((edge) => {
		const points = routes.get(edge.id);
		if (points === undefined) return [];
		const ends = [
			[edge.from, points[0]!],
			[edge.to, points.at(-1)!],
		] as const;
		return ends.flatMap(([id, point], index) => {
			const header = headers.get(id);
			const box = index === 1 && header !== undefined ? header : drawing.atlas.nodes[id];
			return box !== undefined &&
				!onBoundary(point, box) &&
				!(header !== undefined && onBoundary(point, header))
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
