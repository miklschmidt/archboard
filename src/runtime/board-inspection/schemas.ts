import { z } from "zod";

import {
	BridgeIncompleteIssueSchema,
	BridgeStaleIssueSchema,
	COLLISION_PASSES,
	ElementRefSchema,
	FontFamilySchema,
	IntendedRoleSchema,
	LibraryAttributionSchema,
	NodeRefSchema,
	ObstacleRefSchema,
	SceneBBoxSchema,
	ScenePointSchema,
	nonnegative,
	type BridgeIncompleteIssue,
	type BridgeStaleIssue,
} from "@/runtime/board-inspection/lib/reference-schemas";
import {
	InspectionFindingSchema,
	type InspectionFinding,
} from "@/runtime/board-inspection/lib/finding-variants";

const InspectionPolicyInputSchema = z.strictObject({
	allowedFontFamilies: z.union([z.literal("any"), z.array(FontFamilySchema)]).optional(),
	dimensionTolerance: nonnegative.optional(),
	intersectionTolerance: nonnegative.optional(),
	overlapTolerance: nonnegative.optional(),
});
const InspectionPolicySchema = z.strictObject({
	allowedFontFamilies: z.union([z.literal("any"), z.array(FontFamilySchema)]),
	dimensionTolerance: nonnegative,
	intersectionTolerance: nonnegative,
	overlapTolerance: nonnegative,
});
const FindingCodeSchema = z.enum([
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
	"CONNECTOR_PENETRATES_TEXT",
	"CONNECTOR_INTERSECTION_UNMARKED",
	"NODE_OVERLAP",
	"LABEL_OVERLAP",
	"BRIDGE_PROVENANCE_INVALID",
]);
const InspectionReportSchema = z.strictObject({
	schemaVersion: z.literal(3),
	success: z.literal(true),
	policy: InspectionPolicySchema,
	limits: z.strictObject({
		inputComplexityUnits: z.literal(1_000_000),
		broadPhaseComparisons: z.literal(2_000_000),
	}),
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
type ScenePoint = z.infer<typeof ScenePointSchema>;
type SceneBBox = z.infer<typeof SceneBBoxSchema>;
type ElementRef = z.infer<typeof ElementRefSchema>;
type NodeRef = z.infer<typeof NodeRefSchema>;
type ObstacleRef = z.infer<typeof ObstacleRefSchema>;
type InspectionPolicyInput = z.input<typeof InspectionPolicyInputSchema>;
type InspectionPolicy = z.infer<typeof InspectionPolicySchema>;
type InspectionReport = z.infer<typeof InspectionReportSchema>;

const CheckResultSchema = InspectionReportSchema.extend({ board: z.string().min(1) });
type CheckResult = z.infer<typeof CheckResultSchema>;

export {
	BridgeIncompleteIssueSchema,
	BridgeStaleIssueSchema,
	type BridgeIncompleteIssue,
	type BridgeStaleIssue,
	COLLISION_PASSES,
	ScenePointSchema,
	SceneBBoxSchema,
	ElementRefSchema,
	NodeRefSchema,
	LibraryAttributionSchema,
	ObstacleRefSchema,
	IntendedRoleSchema,
	InspectionFindingSchema,
	type InspectionFinding,
	FontFamilySchema,
	InspectionPolicyInputSchema,
	InspectionPolicySchema,
	FindingCodeSchema,
	InspectionReportSchema,
	type ScenePoint,
	type SceneBBox,
	type ElementRef,
	type NodeRef,
	type ObstacleRef,
	type InspectionPolicyInput,
	type InspectionPolicy,
	type InspectionReport,
	CheckResultSchema,
	type CheckResult,
};
