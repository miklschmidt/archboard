// What a variant draws: nodes, edges, drill-downs, walkthroughs, and the reading of its groups.
export {
	gatheringGroups,
	groupsUsed,
	inspectGroup,
	isMemberOf,
	placingGroups,
} from "#shared/rules/inspect/groups.ts";
export type { GroupInspection } from "#shared/rules/inspect/groups.ts";
export {
	DEFAULT_TRAFFIC_SPEED,
	EdgeTrafficSchema,
	effectiveTraffic,
	emptyContent,
	subjectsOf,
	VariantContentSchema,
} from "#shared/schemas/content.ts";
export type {
	DrillDown,
	SemanticEdge,
	SemanticNode,
	SubjectKind,
	VariantContent,
} from "#shared/schemas/content.ts";
export type { EdgeEmphasis } from "#shared/schemas/vocabulary.ts";
export { WalkthroughBeatSchema } from "#shared/schemas/walkthrough.ts";
export type { SemanticWalkthrough, WalkthroughBeat } from "#shared/schemas/walkthrough.ts";
