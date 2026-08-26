import {
	FindingCodeSchema,
	InspectionPolicyInputSchema,
	InspectionPolicySchema,
	InspectionReportSchema,
	type InspectionPolicy,
	type InspectionPolicyInput,
	type InspectionReport,
} from "./schemas.js";
import { decodeRecords } from "./lib/decode.js";
import { BROAD_PHASE_COMPARISON_LIMIT, detectBoard } from "./lib/detectors.js";
import { BROAD_PHASE_PREPROCESSING_LIMIT } from "./lib/preprocessing-budget.js";
import { compareIdentity } from "./lib/ordering.js";

export {
	CheckResultSchema,
	ElementRefSchema,
	FindingCodeSchema,
	FontFamilySchema,
	InspectionFindingSchema,
	InspectionPolicyInputSchema,
	InspectionPolicySchema,
	InspectionReportSchema,
	IntendedRoleSchema,
	LibraryAttributionSchema,
	NodeRefSchema,
	ObstacleRefSchema,
	SceneBBoxSchema,
	ScenePointSchema,
} from "./schemas.js";
export type {
	CheckResult,
	ElementRef,
	InspectionFinding,
	InspectionPolicy,
	InspectionPolicyInput,
	InspectionReport,
	NodeRef,
	ObstacleRef,
	SceneBBox,
	ScenePoint,
} from "./schemas.js";
export { formatInspectionText } from "./lib/format-text.js";
export { BROAD_PHASE_COMPARISON_LIMIT } from "./lib/detectors.js";
export { BROAD_PHASE_PREPROCESSING_LIMIT } from "./lib/preprocessing-budget.js";

export const DEFAULT_INSPECTION_POLICY: InspectionPolicy = Object.freeze({
	allowedFontFamilies: Object.freeze([5]) as unknown as [5],
	dimensionTolerance: 0.5,
	intersectionTolerance: 0.5,
	overlapTolerance: 0.5,
});

function normalizedPolicy(input?: InspectionPolicyInput): InspectionPolicy {
	const parsed = InspectionPolicyInputSchema.parse(input ?? {});
	const configured = parsed.allowedFontFamilies;
	const allowedFontFamilies =
		configured === "any"
			? ("any" as const)
			: [...new Set(configured ?? ([5] as const))].toSorted((a, b) => a - b);
	return InspectionPolicySchema.parse({
		allowedFontFamilies,
		dimensionTolerance: parsed.dimensionTolerance ?? DEFAULT_INSPECTION_POLICY.dimensionTolerance,
		intersectionTolerance:
			parsed.intersectionTolerance ?? DEFAULT_INSPECTION_POLICY.intersectionTolerance,
		overlapTolerance: parsed.overlapTolerance ?? DEFAULT_INSPECTION_POLICY.overlapTolerance,
	});
}

/** Inspect a persisted board as raw records. This function has no side effects. */
export function inspectBoard(
	records: readonly unknown[],
	policyInput?: InspectionPolicyInput,
): InspectionReport {
	const policy = normalizedPolicy(policyInput);
	const decoded = decodeRecords(records);
	const detection = detectBoard(decoded, policy);
	const byCode = Object.fromEntries(FindingCodeSchema.options.map((code) => [code, 0])) as Record<
		string,
		number
	>;
	let errors = 0,
		warnings = 0;
	for (const finding of detection.findings) {
		byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
		if (finding.severity === "error") errors += 1;
		else warnings += 1;
	}
	const coverageReasons = [
		...new Set(
			detection.findings
				.filter((finding) => finding.affectsCoverage)
				.map((finding) => `${finding.code}/${finding.reason}`),
		),
	].toSorted(compareIdentity);
	const coverage = coverageReasons.length > 0 ? ("indeterminate" as const) : ("complete" as const);
	return InspectionReportSchema.parse({
		schemaVersion: 1,
		success: true,
		policy,
		limits: {
			broadPhaseComparisons: BROAD_PHASE_COMPARISON_LIMIT,
			broadPhasePreprocessingSteps: BROAD_PHASE_PREPROCESSING_LIMIT,
		},
		totalElementCount: records.length,
		liveElementCount: decoded.filter((record) => record.live).length,
		locatableElementCount: decoded.filter((record) => record.live && record.box).length,
		broadPhaseComparisons: detection.broadPhaseComparisons,
		coverage,
		clean: coverage === "complete" && detection.findings.length === 0,
		maxSeverity: errors > 0 ? "error" : warnings > 0 ? "warning" : "none",
		counts: { bySeverity: { error: errors, warning: warnings }, byCode },
		coverageReasons,
		findings: detection.findings,
	});
}
