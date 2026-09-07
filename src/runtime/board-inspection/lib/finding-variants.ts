import { z } from "zod";

import {
	BridgeIncompleteIssueSchema,
	BridgeStaleIssueSchema,
	COLLISION_PASSES,
	ElementRefSchema,
	IntendedRoleSchema,
	NodeRefSchema,
	ObstacleRefSchema,
	SceneBBoxSchema,
	ScenePointSchema,
	finite,
	nonnegative,
} from "@/runtime/board-inspection/lib/reference-schemas";

const common = {
	message: z.string().min(1),
	elements: z.array(ElementRefSchema),
	nodes: z.array(NodeRefSchema),
	obstacles: z.array(ObstacleRefSchema),
	points: z.array(ScenePointSchema),
	affectedBBox: SceneBBoxSchema.nullable(),
	focusBBox: SceneBBoxSchema.nullable(),
};

const severityByCode = {
	INVALID_RENDER_GEOMETRY: "error",
	STALE_LINEAR_DIMENSIONS: "error",
	BROKEN_REFERENCE: "error",
	LABEL_CORRUPTION: "error",
	FONT_POLICY_VIOLATION: "warning",
	UNSUPPORTED_GEOMETRY: "warning",
	AMBIGUOUS_GEOMETRY: "warning",
	INSPECTION_LIMIT_EXCEEDED: "warning",
	CONNECTOR_PENETRATES_NODE: "error",
	CONNECTOR_PENETRATES_OBSTACLE: "error",
	CONNECTOR_PENETRATES_TEXT: "error",
	CONNECTOR_INTERSECTION_UNMARKED: "error",
	NODE_OVERLAP: "error",
	LABEL_OVERLAP: "error",
	BRIDGE_PROVENANCE_INVALID: "error",
} as const;

/**
 * One closed finding variant: a code, reason and coverage flag with exact details.
 * @param code the finding code, which fixes the severity
 * @param reason the reason literal under that code
 * @param affectsCoverage whether the finding makes coverage indeterminate
 * @param details the strict shape of the variant's details
 * @returns the strict object schema for that variant
 */
const variant = <
	Code extends keyof typeof severityByCode,
	Reason extends string,
	Coverage extends boolean,
	Shape extends z.ZodRawShape,
>(
	code: Code,
	reason: Reason,
	affectsCoverage: Coverage,
	details: Shape,
) =>
	z.strictObject({
		code: z.literal(code),
		reason: z.literal(reason),
		severity: z.literal(severityByCode[code]),
		affectsCoverage: z.literal(affectsCoverage),
		...common,
		details: z.strictObject(details),
	});

const idType = z.enum([
	"missing",
	"undefined",
	"null",
	"string",
	"number",
	"boolean",
	"bigint",
	"symbol",
	"function",
	"array",
	"object",
]);

const invalidRender = [
	variant("INVALID_RENDER_GEOMETRY", "non-data-input", true, {
		sourceIndex: z.number().int().nonnegative().nullable(),
		path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
		issue: z.enum([
			"proxy",
			"accessor",
			"active-path-cycle",
			"function",
			"symbol",
			"bigint",
			"non-plain-object",
			"non-array-root",
		]),
	}),
	variant("INVALID_RENDER_GEOMETRY", "invalid-render-fields", true, {
		invalidFields: z.array(z.enum(["x", "y", "width", "height"])).min(1),
		valueKinds: z.partialRecord(z.enum(["x", "y", "width", "height"]), z.string()),
	}),
	variant("INVALID_RENDER_GEOMETRY", "unlocatable-record", true, {
		recordKind: z.string(),
		invalidFields: z.array(z.enum(["x", "y", "width", "height"])).min(1),
		sourceIndex: z.number().int().nonnegative(),
	}),
] as const;

const staleLinear = (["width", "height", "width-and-height"] as const).map((reason) =>
	variant("STALE_LINEAR_DIMENSIONS", reason, false, {
		storedWidth: finite,
		storedHeight: finite,
		measuredWidth: nonnegative,
		measuredHeight: nonnegative,
		widthDelta: finite,
		heightDelta: finite,
	}),
);

const malformedBoundIssue = z.enum([
	"not-array",
	"entry-not-object",
	"missing-id",
	"empty-id",
	"non-string-id",
	"missing-type",
	"invalid-type",
]);
const invalidIdentityDetails = {
	identityIssue: z.enum(["missing-id", "empty-string-id", "non-string-id"]),
	rawIdType: idType,
	rawIdDescription: z.string(),
	sourceIndex: z.number().int().nonnegative(),
	availableElementType: z.string().nullable(),
};
const invalidIdentity = [
	variant("BROKEN_REFERENCE", "invalid-element-identity", false, {
		...invalidIdentityDetails,
		intendedRoles: z.tuple([]),
	}),
	variant("BROKEN_REFERENCE", "invalid-element-identity", true, {
		...invalidIdentityDetails,
		intendedRoles: z.array(IntendedRoleSchema).min(1),
	}),
] as const;
const malformedBindingDetails = {
	connectorId: z.string().min(1).nullable(),
	sourceIndex: z.number().int().nonnegative(),
	rawKind: z.string(),
	readableTargetId: z.string().min(1).nullable(),
};
const blockedBindingIssue = z.enum([
	"not-object",
	"array",
	"missing-element-id",
	"empty-element-id",
	"non-string-element-id",
]);
const readableBindingIssue = z.enum([
	"missing-focus",
	"nonfinite-focus",
	"missing-gap",
	"nonfinite-gap",
	"invalid-fixed-point",
]);
const malformedBindings = (["malformed-start-binding", "malformed-end-binding"] as const).flatMap(
	(reason) => [
		variant("BROKEN_REFERENCE", reason, true, {
			...malformedBindingDetails,
			issue: blockedBindingIssue,
			classificationBlocked: z.literal(true),
		}),
		variant("BROKEN_REFERENCE", reason, false, {
			...malformedBindingDetails,
			issue: readableBindingIssue,
			classificationBlocked: z.literal(false),
		}),
	],
);
const invalidLibraryAttribution = [
	variant("BROKEN_REFERENCE", "invalid-library-attribution", true, {
		elementId: z.string().min(1),
		issues: z.array(z.string()).min(1),
		rescuedByGroup: z.literal(false),
	}),
	variant("BROKEN_REFERENCE", "invalid-library-attribution", false, {
		elementId: z.string().min(1),
		issues: z.array(z.string()).min(1),
		rescuedByGroup: z.literal(true),
	}),
] as const;

const brokenReference = [
	...invalidIdentity,
	variant("BROKEN_REFERENCE", "duplicate-element-id", true, {
		duplicateId: z.string().min(1),
		sourceIndexes: z.array(z.number().int().nonnegative()).min(2),
	}),
	variant("BROKEN_REFERENCE", "missing-binding-target", true, {
		connectorId: z.string().min(1),
		end: z.enum(["start", "end"]),
		targetId: z.string().min(1),
	}),
	variant("BROKEN_REFERENCE", "invalid-binding-target-type", true, {
		connectorId: z.string().min(1),
		end: z.enum(["start", "end"]),
		targetId: z.string().min(1),
		targetType: z.string(),
	}),
	variant("BROKEN_REFERENCE", "missing-binding-reciprocal", false, {
		connectorId: z.string().min(1),
		end: z.enum(["start", "end"]),
		targetId: z.string().min(1),
	}),
	...malformedBindings,
	variant("BROKEN_REFERENCE", "malformed-bound-elements", true, {
		ownerId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		rawKind: z.string(),
		entryIndex: z.number().int().nonnegative().nullable(),
		issue: malformedBoundIssue,
		readableEntries: z.array(
			z.strictObject({ id: z.string().min(1), type: z.enum(["text", "arrow"]) }),
		),
		classificationBlocked: z.literal(true),
	}),
	variant("BROKEN_REFERENCE", "malformed-container-id", true, {
		textId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		rawKind: z.string(),
		rawDescription: z.string(),
		issue: z.enum(["empty-container-id", "non-string-container-id"]),
		ownerClassificationBlocked: z.literal(true),
	}),
	...(["dangling-bound-text", "dangling-bound-arrow"] as const).map((reason) =>
		variant("BROKEN_REFERENCE", reason, false, {
			ownerId: z.string().min(1),
			targetId: z.string().min(1),
		}),
	),
	variant("BROKEN_REFERENCE", "bound-element-target-type-mismatch", true, {
		ownerId: z.string().min(1),
		targetId: z.string().min(1),
		declaredType: z.enum(["text", "arrow"]),
		actualType: z.string().min(1),
	}),
	variant("BROKEN_REFERENCE", "conflicting-bound-label-owner", true, {
		textId: z.string().min(1),
		forwardContainerId: z.string().min(1),
		reverseContainerIds: z.array(z.string().min(1)),
	}),
	variant("BROKEN_REFERENCE", "persisted-agent-endpoint", true, {
		connectorId: z.string().min(1),
		end: z.enum(["start", "end"]),
		inputTargetId: z.string().min(1),
		bindingTargetId: z.string().min(1).nullable(),
	}),
	variant("BROKEN_REFERENCE", "invalid-node-metadata", true, {
		elementId: z.string().min(1),
		valueKind: z.string(),
	}),
	variant("BROKEN_REFERENCE", "invalid-code-binding", false, {
		elementId: z.string().min(1),
		issues: z.array(z.string()).min(1),
	}),
	variant("BROKEN_REFERENCE", "derived-link-persisted", false, {
		elementId: z.string().min(1),
		link: z.string(),
	}),
	...invalidLibraryAttribution,
] as const;

const labelCorruption = [
	variant("LABEL_CORRUPTION", "orphan", true, {
		textId: z.string().min(1),
		containerId: z.string().min(1),
	}),
	variant("LABEL_CORRUPTION", "duplicate", false, {
		containerId: z.string().min(1),
		keeperId: z.string().min(1),
		duplicateIds: z.array(z.string().min(1)).min(1),
	}),
	variant("LABEL_CORRUPTION", "missing-reciprocal", false, {
		textId: z.string().min(1),
		containerId: z.string().min(1),
		missingSide: z.enum(["text", "container"]),
	}),
	variant("LABEL_CORRUPTION", "conflicting-owner", true, {
		textId: z.string().min(1),
		containerId: z.string().min(1),
		otherContainerIds: z.array(z.string().min(1)),
	}),
	variant("LABEL_CORRUPTION", "drift", false, {
		textId: z.string().min(1),
		containerId: z.string().min(1),
		distance: nonnegative,
		allowed: nonnegative,
	}),
	variant("LABEL_CORRUPTION", "persisted-seed", false, {
		elementId: z.string().min(1),
		seedField: z.enum(["label", "text"]),
	}),
] as const;

const fontPolicy = [
	variant("FONT_POLICY_VIOLATION", "missing-font-family", false, {
		effectiveFamily: z.literal(1),
		allowedFamilies: z.union([z.literal("any"), z.array(z.number().int())]),
	}),
	variant("FONT_POLICY_VIOLATION", "disallowed-font-family", false, {
		rawFamily: z.number().int(),
		effectiveFamily: z.number().int(),
		allowedFamilies: z.union([z.literal("any"), z.array(z.number().int())]),
	}),
	variant("FONT_POLICY_VIOLATION", "invalid-font-family", false, {
		rawType: z.string(),
		rawDescription: z.string(),
		allowedFamilies: z.union([z.literal("any"), z.array(z.number().int())]),
	}),
] as const;

const unsupported = [
	variant("UNSUPPORTED_GEOMETRY", "unsupported-type", true, { rawType: z.string() }),
	variant("UNSUPPORTED_GEOMETRY", "rotation", true, {
		angle: z.union([finite, z.string()]),
	}),
	variant("UNSUPPORTED_GEOMETRY", "curve", true, { curveKind: z.string() }),
	variant("UNSUPPORTED_GEOMETRY", "rounded-or-elbowed", true, {
		roundness: z.string().nullable(),
		elbowed: z.boolean(),
		fixedSegments: z.boolean(),
	}),
] as const;

const ambiguous = [
	variant("AMBIGUOUS_GEOMETRY", "points-missing", true, {
		connectorId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		rawPointsKind: z.literal("missing"),
		rawPointsDescription: z.string(),
		pointCount: z.null(),
		minimumRequired: z.literal(2),
		issue: z.literal("missing"),
	}),
	variant("AMBIGUOUS_GEOMETRY", "points-not-array", true, {
		connectorId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		rawPointsKind: z.string(),
		rawPointsDescription: z.string(),
		pointCount: z.null(),
		minimumRequired: z.literal(2),
		issue: z.literal("non-array"),
	}),
	variant("AMBIGUOUS_GEOMETRY", "points-empty", true, {
		connectorId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		rawPointsKind: z.literal("array"),
		rawPointsDescription: z.string(),
		pointCount: z.literal(0),
		minimumRequired: z.literal(2),
		issue: z.literal("empty"),
	}),
	variant("AMBIGUOUS_GEOMETRY", "points-one-point", true, {
		connectorId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		rawPointsKind: z.literal("array"),
		rawPointsDescription: z.string(),
		pointCount: z.literal(1),
		minimumRequired: z.literal(2),
		issue: z.literal("insufficient-cardinality"),
	}),
	variant("AMBIGUOUS_GEOMETRY", "malformed-point", true, {
		connectorId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		pointIndex: z.number().int().nonnegative(),
		issue: z.string(),
	}),
	variant("AMBIGUOUS_GEOMETRY", "absolute-point-overflow", true, {
		connectorId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		pointIndex: z.number().int().nonnegative(),
		issue: z.string(),
	}),
	variant("AMBIGUOUS_GEOMETRY", "unrepresentable-coordinate-span", true, {
		scope: z.enum([
			"record-extent",
			"semantic-node-body",
			"semantic-node-aggregate",
			"obstacle-component",
			"finding-affected-union",
		]),
		subjectId: z.string().min(1).nullable(),
		sourceIndexes: z.array(z.number().int().nonnegative()).min(1),
		issue: z.literal("finite-constituents-have-no-finite-union"),
	}),
	variant("AMBIGUOUS_GEOMETRY", "unrepresentable-focus-padding", true, {
		padding: z.literal(16),
		failedDeltas: z
			.array(z.enum(["x-minus-16", "y-minus-16", "width-plus-32", "height-plus-32"]))
			.min(1),
		issue: z.literal("exact-16px-padding-is-not-finite-and-representable"),
	}),
	variant("AMBIGUOUS_GEOMETRY", "zero-length", true, {
		connectorId: z.string().min(1).nullable(),
		sourceIndex: z.number().int().nonnegative(),
		segmentIndex: z.number().int().nonnegative(),
	}),
	variant("AMBIGUOUS_GEOMETRY", "collinear-overlap", true, {
		firstConnectorId: z.string().min(1),
		firstSegmentIndex: z.number().int().nonnegative(),
		secondConnectorId: z.string().min(1),
		secondSegmentIndex: z.number().int().nonnegative(),
	}),
] as const;

const layoutFindings = [
	variant("BRIDGE_PROVENANCE_INVALID", "incomplete-decoration", false, {
		bridgeId: z.string().min(1).nullable(),
		issue: BridgeIncompleteIssueSchema,
	}),
	variant("BRIDGE_PROVENANCE_INVALID", "stale-decoration", false, {
		bridgeId: z.string().min(1),
		issue: BridgeStaleIssueSchema,
	}),
	variant("INSPECTION_LIMIT_EXCEEDED", "broad-phase-comparison-ceiling", true, {
		limit: z.literal(2_000_000),
		attempted: z.literal(2_000_001),
		pass: z.enum(COLLISION_PASSES),
		segmentCount: z.number().int().nonnegative(),
		nodeCount: z.number().int().nonnegative(),
		obstacleCount: z.number().int().nonnegative(),
		labelCount: z.number().int().nonnegative(),
		textCount: z.number().int().nonnegative(),
	}),
	variant("INSPECTION_LIMIT_EXCEEDED", "input-complexity-ceiling", true, {
		limit: z.literal(1_000_000),
		attempted: z.literal(1_000_001),
		pass: z.literal("input-scan"),
		phase: z.literal("snapshot-input"),
		completedRecordCount: z.number().int().nonnegative(),
		sourceIndex: z.number().int().nonnegative().nullable(),
		path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
		unitKind: z.enum(["record", "field", "array-entry", "string-code-unit"]),
	}),
	variant("CONNECTOR_PENETRATES_NODE", "leaf-footprint-interior", false, {
		connectorId: z.string().min(1),
		segmentIndex: z.number().int().nonnegative(),
		nodeId: z.string().min(1),
		entry: ScenePointSchema,
		exit: ScenePointSchema,
	}),
	variant("CONNECTOR_PENETRATES_OBSTACLE", "obstacle-footprint-interior", false, {
		connectorId: z.string().min(1),
		segmentIndex: z.number().int().nonnegative(),
		obstacleId: z.string().min(1),
		entry: ScenePointSchema,
		exit: ScenePointSchema,
	}),
	variant("CONNECTOR_PENETRATES_TEXT", "text-interior", false, {
		connectorId: z.string().min(1),
		segmentIndex: z.number().int().nonnegative(),
		textId: z.string().min(1),
		entry: ScenePointSchema,
		exit: ScenePointSchema,
	}),
	variant("CONNECTOR_INTERSECTION_UNMARKED", "proper-interior-crossing", false, {
		firstConnectorId: z.string().min(1),
		firstSegmentIndex: z.number().int().nonnegative(),
		secondConnectorId: z.string().min(1),
		secondSegmentIndex: z.number().int().nonnegative(),
		point: ScenePointSchema,
	}),
	variant("NODE_OVERLAP", "leaf-footprint-overlap", false, {
		firstNodeId: z.string().min(1),
		secondNodeId: z.string().min(1),
		overlapWidth: nonnegative,
		overlapHeight: nonnegative,
	}),
	variant("LABEL_OVERLAP", "label-node-overlap", false, {
		labelId: z.string().min(1),
		nodeId: z.string().min(1),
		overlapWidth: nonnegative,
		overlapHeight: nonnegative,
	}),
	variant("LABEL_OVERLAP", "label-label-overlap", false, {
		firstLabelId: z.string().min(1),
		secondLabelId: z.string().min(1),
		overlapWidth: nonnegative,
		overlapHeight: nonnegative,
	}),
] as const;

const InspectionFindingSchema = z.union([
	...invalidRender,
	...staleLinear,
	...brokenReference,
	...labelCorruption,
	...fontPolicy,
	...unsupported,
	...ambiguous,
	...layoutFindings,
]);
type InspectionFinding = z.infer<typeof InspectionFindingSchema>;

export { InspectionFindingSchema, type InspectionFinding };
