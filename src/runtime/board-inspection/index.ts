import {
	FindingCodeSchema,
	InspectionPolicyInputSchema,
	InspectionPolicySchema,
	InspectionReportSchema,
	type InspectionPolicy,
	type InspectionPolicyInput,
	type InspectionFinding,
	type InspectionReport,
} from "./schemas.js";
import { decodeRecords } from "./lib/decode.js";
import { BROAD_PHASE_COMPARISON_LIMIT, detectBoard } from "./lib/detectors.js";
import { box, finite, focusBox, point } from "./lib/geometry.js";
import {
	INSPECTION_ANALYSIS_WORK_LIMIT,
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
	InspectionBudget,
} from "./lib/inspection-budget.js";
import {
	snapshotInspectionInput,
	type SnapshotIssue,
	type SnapshotRecord,
} from "./lib/input-snapshot.js";
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
export {
	INSPECTION_ANALYSIS_WORK_LIMIT,
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
} from "./lib/inspection-budget.js";

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

const snapshotIdentity = (record: SnapshotRecord | null, sourceIndex: number) => ({
	id: typeof record?.id === "string" && record.id.length > 0 ? record.id : null,
	type: typeof record?.type === "string" ? record.type : null,
	sourceIndex,
});

const snapshotEvidence = (record: SnapshotRecord | null) => {
	if (!record || !finite(record.x) || !finite(record.y)) return null;
	if (
		finite(record.width) &&
		finite(record.height) &&
		finite(record.x + Math.max(0, record.width)) &&
		finite(record.y + Math.max(0, record.height))
	)
		return box({
			x: record.x,
			y: record.y,
			width: Math.max(0, record.width),
			height: Math.max(0, record.height),
		});
	return box({ x: record.x, y: record.y, width: 0, height: 0 });
};

const pathText = (path: readonly (string | number)[]): string => {
	const visible = path.slice(0, 12);
	const rendered = visible
		.map((token) => (typeof token === "number" ? `[${token}]` : `.${token}`))
		.join("");
	return `$${rendered}${path.length > visible.length ? ".…" : ""}`;
};

function unsafeInputFinding(issue: SnapshotIssue): InspectionFinding {
	const affectedBBox = snapshotEvidence(issue.admittedRecord);
	const focus = focusBox(affectedBBox);
	const source =
		issue.sourceIndex === null ? "the input root" : `source index ${issue.sourceIndex}`;
	return {
		code: "INVALID_RENDER_GEOMETRY",
		reason: "non-data-input",
		severity: "error",
		affectsCoverage: true,
		details: { sourceIndex: issue.sourceIndex, path: [...issue.path], issue: issue.issue },
		message: `Inspection found non-data input at ${source} ${pathText(issue.path)} (${issue.issue}).`,
		elements:
			issue.sourceIndex === null ? [] : [snapshotIdentity(issue.admittedRecord, issue.sourceIndex)],
		nodes: [],
		obstacles: [],
		points:
			issue.admittedRecord && finite(issue.admittedRecord.x) && finite(issue.admittedRecord.y)
				? [point({ x: issue.admittedRecord.x, y: issue.admittedRecord.y })]
				: [],
		affectedBBox,
		focusBBox: focus.kind === "representable" ? focus.box : null,
	};
}

function inputLimitFinding(
	limit: NonNullable<ReturnType<typeof snapshotInspectionInput>["limit"]>,
	record: SnapshotRecord | null,
): InspectionFinding {
	const affectedBBox = snapshotEvidence(record);
	const focus = focusBox(affectedBBox);
	const { context } = limit;
	return {
		code: "INSPECTION_LIMIT_EXCEEDED",
		reason: "input-complexity-ceiling",
		severity: "warning",
		affectsCoverage: true,
		details: {
			limit: INSPECTION_INPUT_COMPLEXITY_LIMIT,
			attempted: limit.attempted,
			pass: "input-scan",
			phase: "snapshot-input",
			completedRecordCount: context.completedRecordCount,
			sourceIndex: context.sourceIndex,
			path: [...context.path],
			unitKind: context.unitKind,
		},
		message: `Inspection stopped while snapshotting input at ${pathText(context.path)}.`,
		elements: context.sourceIndex === null ? [] : [snapshotIdentity(record, context.sourceIndex)],
		nodes: [],
		obstacles: [],
		points: [],
		affectedBBox,
		focusBBox: focus.kind === "representable" ? focus.box : null,
	};
}

function assembleReport(input: {
	policy: InspectionPolicy;
	findings: readonly InspectionFinding[];
	totalElementCount: number;
	liveElementCount: number;
	locatableElementCount: number;
	broadPhaseComparisons: number;
}): InspectionReport {
	const byCode = Object.fromEntries(FindingCodeSchema.options.map((code) => [code, 0])) as Record<
		string,
		number
	>;
	let errors = 0;
	let warnings = 0;
	for (const finding of input.findings) {
		byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
		if (finding.severity === "error") errors += 1;
		else warnings += 1;
	}
	const coverageReasons = [
		...new Set(
			input.findings
				.filter((finding) => finding.affectsCoverage)
				.map((finding) => `${finding.code}/${finding.reason}`),
		),
	].toSorted(compareIdentity);
	const coverage = coverageReasons.length > 0 ? ("indeterminate" as const) : ("complete" as const);
	return InspectionReportSchema.parse({
		schemaVersion: 1,
		success: true,
		policy: input.policy,
		limits: {
			inputComplexityUnits: INSPECTION_INPUT_COMPLEXITY_LIMIT,
			analysisWorkItems: INSPECTION_ANALYSIS_WORK_LIMIT,
			broadPhaseComparisons: BROAD_PHASE_COMPARISON_LIMIT,
		},
		totalElementCount: input.totalElementCount,
		liveElementCount: input.liveElementCount,
		locatableElementCount: input.locatableElementCount,
		broadPhaseComparisons: input.broadPhaseComparisons,
		coverage,
		clean: coverage === "complete" && input.findings.length === 0,
		maxSeverity: errors > 0 ? "error" : warnings > 0 ? "warning" : "none",
		counts: { bySeverity: { error: errors, warning: warnings }, byCode },
		coverageReasons,
		findings: input.findings,
	});
}

/** Inspect a persisted board as raw records. This function has no side effects. */
export function inspectBoard(
	records: readonly unknown[],
	policyInput?: InspectionPolicyInput,
): InspectionReport {
	const budget = new InspectionBudget();
	const snapshot = snapshotInspectionInput(records, budget);
	const policy = normalizedPolicy(policyInput);
	const inputFindings = snapshot.issues.map(unsafeInputFinding);
	if (snapshot.limit) {
		const sourceIndex = snapshot.limit.context.sourceIndex;
		const current = sourceIndex === null ? null : (snapshot.records[sourceIndex] ?? null);
		return assembleReport({
			policy,
			findings: [...inputFindings, inputLimitFinding(snapshot.limit, current)],
			totalElementCount: snapshot.totalRecordCount,
			liveElementCount: 0,
			locatableElementCount: 0,
			broadPhaseComparisons: 0,
		});
	}
	const decoded = decodeRecords(snapshot.records, snapshot.blockedSourceIndexes, budget);
	const detection = detectBoard(decoded, policy, budget, inputFindings);
	return assembleReport({
		policy,
		findings: detection.findings,
		totalElementCount: snapshot.totalRecordCount,
		liveElementCount: decoded.filter((record) => record.live).length,
		locatableElementCount: decoded.filter((record) => record.live && record.box).length,
		broadPhaseComparisons: detection.broadPhaseComparisons,
	});
}
