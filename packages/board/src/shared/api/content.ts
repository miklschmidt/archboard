// What a variant draws: nodes, edges, drill-downs, walkthroughs, and the reading of its groups.
export { groupsUsed, inspectGroup, isMemberOf } from "#shared/rules/inspect/groups.ts";
export {
	DEFAULT_TRAFFIC_SPEED,
	EdgeTrafficSchema,
	effectiveTraffic,
	emptyContent,
	VariantContentSchema,
} from "#shared/schemas/content.ts";
export type { SemanticEdge, SemanticNode, VariantContent } from "#shared/schemas/content.ts";
export type { EdgeEmphasis } from "#shared/schemas/vocabulary.ts";
export { WalkthroughBeatSchema } from "#shared/schemas/walkthrough.ts";

export {
	modelContent,
	projectModel,
	type Model,
	type ModelFlow,
	type ModelFilters,
} from "#shared/rules/model-projection.ts";
export { moduleForest } from "#shared/rules/module-fold.ts";
export { projectFlow } from "#shared/rules/model-flow-projection.ts";
export { doorEndpoints } from "#shared/rules/door-endpoints.ts";

export { subjectsOf } from "#shared/schemas/content.ts";
