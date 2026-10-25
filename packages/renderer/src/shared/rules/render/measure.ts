// A board's words, measured by the renderer core before the layout places
// anything (ADR 0057): the core shapes and breaks every run in the faces it
// carries, so every place measures a word to the same width. This host only
// says which words a board shows and gives the measures back their nodes.

import { gatheringGroups, type SemanticNode, type VariantContent } from "@archboard/board/content";
import { DEFAULT_SEMANTIC_POLICY, type SemanticPolicy } from "@archboard/board/policy";
import type * as Core from "#shared/protocol/generated/core/types.ts";
import type { MeasuredArchitecture, MeasuredNode } from "#shared/rules/render/drawing.ts";
import { rendererHost } from "#shared/rules/render/host.ts";
import { lineLooks } from "#shared/rules/render/semantic-appearance.ts";

/**
 * A node's measure, given back the node it was measured for, and each of its
 * headers with it.
 * @param measured The core's measure, which names no node.
 * @param node The node.
 * @returns The measure of the node.
 */
function withNode(measured: Core.MeasuredNode<null>, node: SemanticNode): MeasuredNode {
	const { headers, ...measure } = measured;
	return {
		...measure,
		node,
		...(headers === undefined ? {} : { headers: headers.map((header) => withNode(header, node)) }),
	};
}

/**
 * Measure every architectural subject before placement or SVG emission.
 * @param content The already validated semantic content.
 * @param policy The vault's groups, in order, when groups gather and colour cards, and its
 * relationship kinds, which say how each line is drawn.
 * @param steps The lines that are flow steps drawn on the board.
 * @returns Text, card minima, container headers, relationship labels, how each line is
 * drawn, and group captions.
 */
function measureArchitecture(
	content: VariantContent,
	policy: Pick<SemanticPolicy, "groups" | "relationshipKinds"> = DEFAULT_SEMANTIC_POLICY,
	steps: ReadonlySet<string> = new Set(),
): MeasuredArchitecture {
	const containers = new Set(content.nodes.flatMap((node) => (node.parent ? [node.parent] : [])));
	const placing = gatheringGroups(content.nodes, policy);
	const labelled = content.edges.flatMap((edge) =>
		edge.label ? [{ id: edge.id, words: edge.label }] : [],
	);
	const captioned = [...new Set(placing.values())];
	const words: Core.BoardWords = {
		nodes: content.nodes.map((node) => ({
			name: node.name,
			responsibility: node.responsibility,
			drills: node.drillDown !== undefined,
			container: containers.has(node.id),
		})),
		labels: labelled.map(({ words: label }) => label),
		captions: captioned.map((id) => policy.groups[id]!.name),
	};
	// The core writes what its Rust `MeasuredWords` type says, and the type
	// here is generated from it.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the core's own output, typed from its Rust source
	const measured = JSON.parse(
		rendererHost().core().measureBoard(JSON.stringify(words)),
	) as Core.MeasuredWords;
	return {
		nodes: new Map(content.nodes.map((node, at) => [node.id, withNode(measured.nodes[at]!, node)])),
		labels: new Map(labelled.map(({ id }, at) => [id, measured.labels[at]!])),
		lines: lineLooks(content.edges, policy, steps),
		...(placing.size === 0
			? {}
			: {
					groups: {
						placing,
						captions: new Map(captioned.map((id, at) => [id, measured.captions[at]!])),
					},
				}),
	};
}

export { measureArchitecture };
