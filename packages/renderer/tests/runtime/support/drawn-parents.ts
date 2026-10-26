import type { VariantContent } from "@archboard/board/content";
import type { RenderedDiagram } from "#shared/protocol/render-request.ts";

/**
 * Parents whose frame is absent or covered by an enclosing container.
 * Their atlas still contains a box, so endpoint geometry alone cannot detect
 * the lines that end in blank space beside their title.
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
