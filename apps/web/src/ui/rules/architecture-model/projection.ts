import type { ArchitectureModelRead } from "@archboard/board/model";
import type { VariantContent } from "@archboard/board/content";
import { overviewLines } from "@archboard/board/views";

type Model = Extract<ArchitectureModelRead, { success: true }>;

/**
 * Adapt canonical meaning to the existing renderer content contract.
 * @param model The coherent read from the public runtime.
 * @returns Complete semantic content without a board or variant document.
 */
function modelContent(model: Model): VariantContent {
	return { nodes: model.modules, edges: model.relationships, flows: [], walkthroughs: [] };
}

/**
 * Draw root modules closed, with separate connections for each relationship kind.
 * @param model The complete model.
 * @returns The projected content and every relationship behind each line.
 */
function projectModel(model: Model) {
	const complete = modelContent(model);
	const kinds = new Set(complete.edges.map((edge) => edge.kind));
	const connections = [...kinds]
		.flatMap((kind) =>
			overviewLines({ ...complete, edges: complete.edges.filter((edge) => edge.kind === kind) }),
		)
		.toSorted((one, other) => one.line.order - other.line.order);
	return {
		complete,
		connections,
		content: {
			nodes: complete.nodes.filter((node) => node.parent === undefined),
			edges: connections.map(({ line }) => line),
			flows: [],
			walkthroughs: [],
		},
	};
}

export { projectModel, type Model };
