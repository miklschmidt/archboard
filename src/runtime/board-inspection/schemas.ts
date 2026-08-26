import { z } from "zod";

const finite = z.number().finite();
const nonnegative = finite.nonnegative();

export const ScenePointSchema = z.strictObject({ x: finite, y: finite });
export const SceneBBoxSchema = z.strictObject({
	x: finite,
	y: finite,
	width: nonnegative,
	height: nonnegative,
});
export const ElementRefSchema = z.strictObject({
	id: z.string().nullable(),
	type: z.string().nullable(),
	sourceIndex: z.number().int().nonnegative(),
});
export const NodeRefSchema = z.strictObject({
	id: z.string().min(1),
	elementIds: z.array(z.string().min(1)),
	labelElementIds: z.array(z.string().min(1)),
});
export const LibraryAttributionSchema = z.strictObject({
	elementId: z.string().min(1),
	item: z.string().min(1),
	source: z.string().optional(),
});
export const ObstacleRefSchema = z.strictObject({
	id: z.string().startsWith("obstacle:"),
	kind: z.enum(["library-component", "grouped-component"]),
	elementIds: z.array(z.string().min(1)),
	groupIds: z.array(z.string().min(1)),
	library: z.array(LibraryAttributionSchema),
});

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
	CONNECTOR_INTERSECTION_UNMARKED: "error",
	NODE_OVERLAP: "error",
	LABEL_OVERLAP: "error",
} as const;

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
export const IntendedRoleSchema = z.enum([
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

const invalidRender = [
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
	variant("INSPECTION_LIMIT_EXCEEDED", "broad-phase-comparison-ceiling", true, {
		limit: z.number().int().positive(),
		attempted: z.number().int().positive(),
		pass: z.string(),
		segmentCount: z.number().int().nonnegative(),
		nodeCount: z.number().int().nonnegative(),
		obstacleCount: z.number().int().nonnegative(),
		labelCount: z.number().int().nonnegative(),
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

export const InspectionFindingSchema = z.union([
	...invalidRender,
	...staleLinear,
	...brokenReference,
	...labelCorruption,
	...fontPolicy,
	...unsupported,
	...ambiguous,
	...layoutFindings,
]);
export type InspectionFinding = z.infer<typeof InspectionFindingSchema>;

export const FontFamilySchema = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(5),
	z.literal(6),
	z.literal(7),
	z.literal(8),
]);
export const InspectionPolicyInputSchema = z.strictObject({
	allowedFontFamilies: z.union([z.literal("any"), z.array(FontFamilySchema)]).optional(),
	dimensionTolerance: nonnegative.optional(),
	intersectionTolerance: nonnegative.optional(),
	overlapTolerance: nonnegative.optional(),
});
export const InspectionPolicySchema = z.strictObject({
	allowedFontFamilies: z.union([z.literal("any"), z.array(FontFamilySchema)]),
	dimensionTolerance: nonnegative,
	intersectionTolerance: nonnegative,
	overlapTolerance: nonnegative,
});
export const FindingCodeSchema = z.enum([
	"INVALID_RENDER_GEOMETRY",
	"STALE_LINEAR_DIMENSIONS",
	"BROKEN_REFERENCE",
	"LABEL_CORRUPTION",
	"FONT_POLICY_VIOLATION",
	"UNSUPPORTED_GEOMETRY",
	"AMBIGUOUS_GEOMETRY",
	"INSPECTION_LIMIT_EXCEEDED",
	"CONNECTOR_PENETRATES_NODE",
	"CONNECTOR_PENETRATES_OBSTACLE",
	"CONNECTOR_INTERSECTION_UNMARKED",
	"NODE_OVERLAP",
	"LABEL_OVERLAP",
]);
export const InspectionReportSchema = z.strictObject({
	schemaVersion: z.literal(1),
	success: z.literal(true),
	policy: InspectionPolicySchema,
	limits: z.strictObject({ broadPhaseComparisons: z.literal(2_000_000) }),
	totalElementCount: z.number().int().nonnegative(),
	liveElementCount: z.number().int().nonnegative(),
	locatableElementCount: z.number().int().nonnegative(),
	broadPhaseComparisons: z.number().int().nonnegative(),
	coverage: z.enum(["complete", "indeterminate"]),
	clean: z.boolean(),
	maxSeverity: z.enum(["none", "warning", "error"]),
	counts: z.strictObject({
		bySeverity: z.strictObject({
			error: z.number().int().nonnegative(),
			warning: z.number().int().nonnegative(),
		}),
		byCode: z.record(FindingCodeSchema, z.number().int().nonnegative()),
	}),
	coverageReasons: z.array(z.string()),
	findings: z.array(InspectionFindingSchema),
});
export type ScenePoint = z.infer<typeof ScenePointSchema>;
export type SceneBBox = z.infer<typeof SceneBBoxSchema>;
export type ElementRef = z.infer<typeof ElementRefSchema>;
export type NodeRef = z.infer<typeof NodeRefSchema>;
export type ObstacleRef = z.infer<typeof ObstacleRefSchema>;
export type InspectionPolicyInput = z.input<typeof InspectionPolicyInputSchema>;
export type InspectionPolicy = z.infer<typeof InspectionPolicySchema>;
export type InspectionReport = z.infer<typeof InspectionReportSchema>;

export const CheckResultSchema = InspectionReportSchema.extend({ board: z.string().min(1) });
export type CheckResult = z.infer<typeof CheckResultSchema>;
