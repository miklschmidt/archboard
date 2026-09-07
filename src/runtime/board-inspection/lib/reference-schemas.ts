import { z } from "zod";

import { compareIdentity, obstacleIdentity } from "@/runtime/board-inspection/lib/ordering";

const BridgeIncompleteIssueSchema = z.enum([
	"malformed-metadata",
	"missing-mask",
	"missing-redraw",
	"duplicate-mask",
	"duplicate-redraw",
	"conflicting-facts",
	"mask-id-mismatch",
	"non-line-part",
]);
const BridgeStaleIssueSchema = z.enum([
	"missing-source",
	"unsupported-source",
	"crossing-moved",
	"style-mismatch",
	"geometry-mismatch",
	"z-order-invalid",
]);
type BridgeIncompleteIssue = z.infer<typeof BridgeIncompleteIssueSchema>;
type BridgeStaleIssue = z.infer<typeof BridgeStaleIssueSchema>;

const COLLISION_PASSES = [
	"connector-node",
	"connector-obstacle",
	"connector-text",
	"connector-intersection",
	"node-overlap",
	"label-node-overlap",
	"label-label-overlap",
] as const;

const finite = z.number().finite();
const nonnegative = finite.nonnegative();

const ScenePointSchema = z.strictObject({ x: finite, y: finite });
const SceneBBoxSchema = z.strictObject({
	x: finite,
	y: finite,
	width: nonnegative,
	height: nonnegative,
});
const ElementRefSchema = z.strictObject({
	id: z.string().nullable(),
	type: z.string().nullable(),
	sourceIndex: z.number().int().nonnegative(),
});
const NodeRefSchema = z.strictObject({
	id: z.string().min(1),
	elementIds: z.array(z.string().min(1)),
	labelElementIds: z.array(z.string().min(1)),
});
const LibraryAttributionSchema = z.strictObject({
	elementId: z.string().min(1),
	item: z.string().min(1),
	source: z.string().min(1).optional(),
});

/**
 * Whether identities are unique and in exact UTF-16 order.
 * @param values the identities
 * @returns true when each identity sorts strictly after its predecessor
 */
const canonicalIdentities = (values: readonly string[]): boolean =>
	values.every((value, index) => index === 0 || compareIdentity(values[index - 1]!, value) < 0);

const ObstacleRefShape = z.strictObject({
	id: z.string().startsWith("obstacle:"),
	kind: z.enum(["library-component", "grouped-component"]),
	elementIds: z.array(z.string().min(1)).min(1),
	groupIds: z.array(z.string().min(1)),
	library: z.array(LibraryAttributionSchema),
});
type ObstacleRefShape = z.infer<typeof ObstacleRefShape>;
type RefinementContext = z.RefinementCtx<ObstacleRefShape>;

/**
 * Add a custom issue at a path.
 * @param context the refinement context
 * @param path the issue path
 * @param message the issue message
 */
function issue(context: RefinementContext, path: (string | number)[], message: string): void {
	context.addIssue({ code: "custom", path, message });
}

/**
 * Refine the ordering invariants of an obstacle reference's id lists.
 * @param obstacle the parsed shape
 * @param context the refinement context
 */
function refineObstacleOrdering(obstacle: ObstacleRefShape, context: RefinementContext): void {
	if (!canonicalIdentities(obstacle.elementIds)) {
		issue(context, ["elementIds"], "Obstacle elementIds must be unique and in exact UTF-16 order.");
	}
	if (!canonicalIdentities(obstacle.groupIds)) {
		issue(context, ["groupIds"], "Obstacle groupIds must be unique and in exact UTF-16 order.");
	}
	if (!canonicalIdentities(obstacle.library.map(({ elementId }) => elementId))) {
		issue(
			context,
			["library"],
			"Obstacle library entries must have unique elementIds in exact UTF-16 order.",
		);
	}
}

/**
 * Refine that library attribution names constituents and matches the obstacle kind.
 * @param obstacle the parsed shape
 * @param context the refinement context
 */
function refineObstacleLibrary(obstacle: ObstacleRefShape, context: RefinementContext): void {
	const elementIds = new Set(obstacle.elementIds);
	for (const [index, attribution] of obstacle.library.entries()) {
		if (!elementIds.has(attribution.elementId)) {
			issue(
				context,
				["library", index, "elementId"],
				"Obstacle library attribution must name a constituent elementId.",
			);
		}
	}
	refineLibraryPresence(obstacle, context);
}

/**
 * Refine that library attribution is present exactly for the obstacle kinds that carry it.
 * @param obstacle the parsed shape
 * @param context the refinement context
 */
function refineLibraryPresence(obstacle: ObstacleRefShape, context: RefinementContext): void {
	if (obstacle.kind === "library-component" && obstacle.library.length === 0) {
		issue(context, ["library"], "Library-component obstacles require library attribution.");
	}
	if (obstacle.kind === "grouped-component" && obstacle.library.length > 0) {
		issue(context, ["library"], "Grouped-component obstacles cannot carry library attribution.");
	}
}

/**
 * Whether a grouped obstacle carries the evidence its kind requires: more than one element,
 * and the group that binds them.
 * @param obstacle the parsed shape
 * @returns true when the evidence is present
 */
function hasGroupEvidence(obstacle: ObstacleRefShape): boolean {
	return obstacle.elementIds.length >= 2 && obstacle.groupIds.length > 0;
}

/**
 * Refine group evidence and the deterministic obstacle id.
 * @param obstacle the parsed shape
 * @param context the refinement context
 */
function refineObstacleIdentity(obstacle: ObstacleRefShape, context: RefinementContext): void {
	if (obstacle.kind === "grouped-component" && !hasGroupEvidence(obstacle)) {
		issue(
			context,
			["kind"],
			"Grouped-component obstacles require multiple elements and group evidence.",
		);
	}
	if (obstacle.elementIds.length > 1 && obstacle.groupIds.length === 0) {
		issue(context, ["groupIds"], "Multi-element obstacles require qualifying group evidence.");
	}
	if (obstacle.id !== obstacleIdentity(obstacle.elementIds)) {
		issue(context, ["id"], "Obstacle id must be the deterministic encoding of elementIds.");
	}
}

const ObstacleRefSchema = ObstacleRefShape.superRefine((obstacle, context) => {
	refineObstacleOrdering(obstacle, context);
	refineObstacleLibrary(obstacle, context);
	refineObstacleIdentity(obstacle, context);
});

const IntendedRoleSchema = z.enum([
	"connector",
	"semantic-node-member",
	"valid-library-body",
	"qualifying-group-body",
	"bound-label",
	"label-container",
	"closed-boundary",
	"font-policy-text",
	"node-overlap-body",
	"label-overlap-body",
]);

const FontFamilySchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(5),
	z.literal(6),
	z.literal(7),
	z.literal(8),
]);

export {
	BridgeIncompleteIssueSchema,
	BridgeStaleIssueSchema,
	type BridgeIncompleteIssue,
	type BridgeStaleIssue,
	COLLISION_PASSES,
	finite,
	nonnegative,
	ScenePointSchema,
	SceneBBoxSchema,
	ElementRefSchema,
	NodeRefSchema,
	LibraryAttributionSchema,
	ObstacleRefSchema,
	IntendedRoleSchema,
	FontFamilySchema,
};
