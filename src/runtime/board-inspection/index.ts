import {
	FindingCodeSchema,
	InspectionPolicyInputSchema,
	InspectionPolicySchema,
	InspectionFindingSchema,
	InspectionReportSchema,
	type InspectionPolicy,
	type InspectionPolicyInput,
	type InspectionFinding,
	type InspectionReport,
} from "@/runtime/board-inspection/schemas";
import { decodeRecords } from "@/runtime/board-inspection/lib/decode";
import {
	BROAD_PHASE_COMPARISON_LIMIT,
	detectBoard,
} from "@/runtime/board-inspection/lib/detectors";
import { box, finite, focusBox, point } from "@/runtime/board-inspection/lib/geometry";
import {
	INSPECTION_INPUT_COMPLEXITY_LIMIT,
	snapshotInspectionInput,
	type SnapshotIssue,
	type SnapshotRecord,
} from "@/runtime/board-inspection/lib/input-snapshot";
import { compareIdentity } from "@/runtime/board-inspection/lib/ordering";
import {
	validateBridgeDecorations,
	type InvalidBridgeDecoration,
} from "@/runtime/board-inspection/bridge";
import type { ServerElement } from "@/runtime/engine/types";

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
} from "@/runtime/board-inspection/schemas";
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
} from "@/runtime/board-inspection/schemas";
export { formatInspectionText } from "@/runtime/board-inspection/lib/format-text";
export { BROAD_PHASE_COMPARISON_LIMIT } from "@/runtime/board-inspection/lib/detectors";
export { INSPECTION_INPUT_COMPLEXITY_LIMIT } from "@/runtime/board-inspection/lib/input-snapshot";
export {
	BridgeIncompleteIssueSchema,
	BridgeMetadataSchema,
	BridgeRoleSchema,
	BridgeStaleIssueSchema,
	planBridgeCreate,
	planBridgeRemoval,
	validateBridgeDecorations,
} from "@/runtime/board-inspection/bridge";

/** The one font family a board is expected to use unless a policy widens it. */
const DEFAULT_FONT_FAMILIES: [5] = [5];

export const DEFAULT_INSPECTION_POLICY: InspectionPolicy = Object.freeze({
	allowedFontFamilies: DEFAULT_FONT_FAMILIES,
	dimensionTolerance: 0.5,
	intersectionTolerance: 0.5,
	overlapTolerance: 0.5,
});

/**
 * The font families a policy allows: every configured family once, in order, or the word that
 * says the board may use any of them.
 * @param configured what the caller asked for, when anything
 * @returns the allowed families
 */
function allowedFontFamilies(
	configured: InspectionPolicyInput["allowedFontFamilies"],
): InspectionPolicy["allowedFontFamilies"] {
	if (configured === "any") {
		return "any";
	}
	return [...new Set(configured ?? DEFAULT_FONT_FAMILIES)].toSorted((a, b) => a - b);
}

/**
 * Normalize a caller's policy against the defaults, so every run is judged by a complete one.
 * @param input the policy the caller supplied, when any
 * @returns the parsed policy
 */
function normalizedPolicy(input?: InspectionPolicyInput): InspectionPolicy {
	const parsed = InspectionPolicyInputSchema.parse(input ?? {});
	return InspectionPolicySchema.parse({
		allowedFontFamilies: allowedFontFamilies(parsed.allowedFontFamilies),
		dimensionTolerance: parsed.dimensionTolerance ?? DEFAULT_INSPECTION_POLICY.dimensionTolerance,
		intersectionTolerance:
			parsed.intersectionTolerance ?? DEFAULT_INSPECTION_POLICY.intersectionTolerance,
		overlapTolerance: parsed.overlapTolerance ?? DEFAULT_INSPECTION_POLICY.overlapTolerance,
	});
}

/**
 * The identity a finding points at: whatever the record itself claims, plus where it sat in
 * the input, which is the one thing a refused record still has.
 * @param record the snapshot record, when one was admitted
 * @param sourceIndex the record's position in the input
 * @returns the element reference
 */
const snapshotIdentity = (record: SnapshotRecord | null, sourceIndex: number) => ({
	id: typeof record?.id === "string" && record.id.length > 0 ? record.id : null,
	type: typeof record?.type === "string" ? record.type : null,
	sourceIndex,
});

/**
 * The box a finding points at for one record: its full span when that is representable, and
 * otherwise the point it sits at, which is still evidence of where the fault is.
 * @param record the snapshot record, when one was admitted
 * @returns the evidence box, or null when the record has no finite origin
 */
const snapshotEvidence = (record: SnapshotRecord | null) => {
	if (!record || !finite(record.x) || !finite(record.y)) {
		return null;
	}
	const origin = { x: record.x, y: record.y };
	const extent = finiteExtent(record, origin);
	return box(extent === null ? { ...origin, width: 0, height: 0 } : { ...origin, ...extent });
};

/** The finite origin a record was found to have. */
interface FiniteOrigin {
	readonly x: number;
	readonly y: number;
}

/**
 * The width and height a record spans, when both they and its far edges are finite.
 * @param record the snapshot record, already known to have a finite origin
 * @param origin that finite origin
 * @returns the extent, or null when the record has no representable span
 */
const finiteExtent = (
	record: SnapshotRecord,
	origin: FiniteOrigin,
): { readonly width: number; readonly height: number } | null => {
	if (!finite(record.width) || !finite(record.height)) {
		return null;
	}
	const width = Math.max(0, record.width);
	const height = Math.max(0, record.height);
	if (!finite(origin.x + width) || !finite(origin.y + height)) {
		return null;
	}
	return { width, height };
};

/**
 * Render an input path for a message, bounded so a deep path cannot fill the report.
 * @param path the field and index path inside the record
 * @returns the rendered path
 */
const pathText = (path: readonly (string | number)[]): string => {
	const visible = path.slice(0, 12);
	const rendered = visible
		.map((token) => (typeof token === "number" ? `[${token}]` : `.${token}`))
		.join("");
	return `$${rendered}${path.length > visible.length ? ".…" : ""}`;
};

/**
 * The point a finding marks on a record that has a finite origin.
 * @param record the admitted record, when there is one
 * @returns the origin point, or no points at all
 */
function originPoints(record: SnapshotRecord | null): ReturnType<typeof point>[] {
	if (!record || !finite(record.x) || !finite(record.y)) {
		return [];
	}
	return [point({ x: record.x, y: record.y })];
}

/**
 * The finding for one piece of input the snapshot refused to carry.
 * @param issue what the snapshot refused, and where
 * @returns the finding
 */
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
		points: originPoints(issue.admittedRecord),
		affectedBBox,
		focusBBox: focus.kind === "representable" ? focus.box : null,
	};
}

/**
 * The finding for a run the input-complexity ceiling stopped, naming the exact unit it
 * stopped on so the report says where the board became too large to read.
 * @param limit what the snapshot reported when it stopped
 * @param record the record it stopped inside, when there is one
 * @returns the finding
 */
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

/** What a report is assembled from. */
interface ReportInput {
	policy: InspectionPolicy;
	findings: readonly InspectionFinding[];
	totalElementCount: number;
	liveElementCount: number;
	locatableElementCount: number;
	broadPhaseComparisons: number;
}

/**
 * Count the findings by code and severity, which is what the report's summary reports.
 * @param findings the run's findings
 * @returns the per-code counts and the error and warning totals
 */
function countFindings(findings: readonly InspectionFinding[]): {
	byCode: Record<string, number>;
	errors: number;
	warnings: number;
} {
	const byCode: Record<string, number> = Object.fromEntries(
		FindingCodeSchema.options.map((code) => [code, 0]),
	);
	let errors = 0;
	let warnings = 0;
	for (const finding of findings) {
		byCode[finding.code] = (byCode[finding.code] ?? 0) + 1;
		if (finding.severity === "error") {
			errors += 1;
		} else {
			warnings += 1;
		}
	}
	return { byCode, errors, warnings };
}

/**
 * Assemble the schema-v3 report from what the run found and how much of the board it could
 * account for.
 * @param input the policy, the findings, the element counts and the comparisons made
 * @returns the parsed report
 */
function assembleReport(input: ReportInput): InspectionReport {
	const { byCode, errors, warnings } = countFindings(input.findings);
	const coverageReasons = [
		...new Set(
			input.findings
				.filter((finding) => finding.affectsCoverage)
				.map((finding) => `${finding.code}/${finding.reason}`),
		),
	].toSorted(compareIdentity);
	const coverage = coverageReasons.length > 0 ? ("indeterminate" as const) : ("complete" as const);
	return InspectionReportSchema.parse({
		schemaVersion: 3,
		success: true,
		policy: input.policy,
		limits: {
			inputComplexityUnits: INSPECTION_INPUT_COMPLEXITY_LIMIT,
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

/**
 * A field a finding reports only when it says something: an empty string names nothing.
 * @param value the field
 * @returns the value, or null when it is empty
 */
function nonEmpty(value: string): string | null {
	return value.length > 0 ? value : null;
}

/**
 * Whether an evidence box was produced at all.
 * @param evidence the candidate evidence box
 * @returns true when there is a box to point at
 */
function isEvidence(evidence: ReturnType<typeof snapshotEvidence>): boolean {
	return evidence !== null;
}

/**
 * The evidence box of a candidate element, read the way a snapshot record is read.
 * @param element the candidate element
 * @returns the evidence box, or null when the element has no finite origin
 */
function elementEvidence(element: ServerElement): ReturnType<typeof snapshotEvidence> {
	return snapshotEvidence(element);
}

/**
 * The report for a run the input ceiling stopped before any semantic analysis.
 * @param snapshot the stopped snapshot
 * @param policy the normalized policy
 * @param inputFindings the findings the snapshot itself produced
 * @returns the report
 */
function limitedReport(
	snapshot: ReturnType<typeof snapshotInspectionInput>,
	policy: InspectionPolicy,
	inputFindings: readonly InspectionFinding[],
): InspectionReport {
	const limit = snapshot.limit!;
	const sourceIndex = limit.context.sourceIndex;
	const current = sourceIndex === null ? null : (snapshot.records[sourceIndex] ?? null);
	return assembleReport({
		policy,
		findings: [...inputFindings, inputLimitFinding(limit, current)],
		totalElementCount: snapshot.totalRecordCount,
		liveElementCount: 0,
		locatableElementCount: 0,
		broadPhaseComparisons: 0,
	});
}

/**
 * The admitted records, projected as elements for the bridge validator, with where each one
 * sat in the input.
 * @param snapshot the input snapshot
 * @returns the candidates and their source indexes
 */
function admittedCandidates(snapshot: ReturnType<typeof snapshotInspectionInput>): {
	candidates: ServerElement[];
	sourceIndexOf: Map<ServerElement, number>;
} {
	const candidates: ServerElement[] = [];
	const sourceIndexOf = new Map<ServerElement, number>();
	for (const [sourceIndex, record] of snapshot.records.entries()) {
		if (!record || snapshot.blockedSourceIndexes.has(sourceIndex)) {
			continue;
		}
		// The snapshot admitted this record, so it carries the inspection vocabulary the bridge
		// validator reads; nothing here invokes caller-owned code.
		// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- an admitted record read as the element it depicts
		const element = record as unknown as ServerElement;
		candidates.push(element);
		sourceIndexOf.set(element, sourceIndex);
	}
	return { candidates, sourceIndexOf };
}

/**
 * The input slots that carry a valid bridge decoration, which the detectors read through the
 * bridge instead of as elements of their own.
 * @param snapshot the input snapshot
 * @param valid the valid bridge pairs
 * @param sourceIndexOf where each candidate element sat in the input
 * @returns the blocked slots together with the decoration slots
 */
function bridgeDecorationIndexes(
	snapshot: ReturnType<typeof snapshotInspectionInput>,
	valid: ReturnType<typeof validateBridgeDecorations>["valid"],
	sourceIndexOf: ReadonlyMap<ServerElement, number>,
): Set<number> {
	const decorationIndexes = new Set(snapshot.blockedSourceIndexes);
	for (const pair of valid) {
		for (const part of [pair.mask.element, pair.redraw.element]) {
			const sourceIndex = sourceIndexOf.get(part);
			if (sourceIndex !== undefined) {
				decorationIndexes.add(sourceIndex);
			}
		}
	}
	return decorationIndexes;
}

/**
 * The finding for a bridge decoration that does not read as one, which is a fault in the
 * decoration itself rather than in what the board depicts.
 * @param invalid the invalid decoration
 * @param sourceIndexOf where each candidate element sat in the input
 * @returns the finding
 */
function bridgeInvalidFinding(
	invalid: InvalidBridgeDecoration,
	sourceIndexOf: ReadonlyMap<ServerElement, number>,
): InspectionFinding {
	const elements = invalid.elements.map((element) => ({
		id: nonEmpty(element.id),
		type: nonEmpty(element.type),
		sourceIndex: sourceIndexOf.get(element) ?? 0,
	}));
	const evidence = invalid.elements.map(elementEvidence).find(isEvidence) ?? null;
	const focus = focusBox(evidence);
	const shared = {
		message: `Bridge ${invalid.bridgeId ?? "candidate"} has ${invalid.reason.replace("-", " ")} (${invalid.issue}).`,
		elements,
		nodes: [],
		obstacles: [],
		points: [],
		affectedBBox: evidence,
		focusBBox: focus.kind === "representable" ? focus.box : null,
	};
	return InspectionFindingSchema.parse({
		code: "BRIDGE_PROVENANCE_INVALID",
		reason: invalid.reason,
		severity: "error",
		affectsCoverage: false,
		details: { bridgeId: invalid.bridgeId, issue: invalid.issue },
		...shared,
	});
}

/**
 * Inspect a persisted board as raw records. This function has no side effects.
 * @param records the caller-owned input records
 * @param policyInput the inspection policy, when the caller supplies one
 * @returns the schema-v3 report
 */
export function inspectBoard(
	records: readonly unknown[],
	policyInput?: InspectionPolicyInput,
): InspectionReport {
	const snapshot = snapshotInspectionInput(records);
	const policy = normalizedPolicy(policyInput);
	const inputFindings = snapshot.issues.map(unsafeInputFinding);
	if (snapshot.limit) {
		return limitedReport(snapshot, policy, inputFindings);
	}
	const { candidates, sourceIndexOf } = admittedCandidates(snapshot);
	const bridges = validateBridgeDecorations(candidates);
	const decorationIndexes = bridgeDecorationIndexes(snapshot, bridges.valid, sourceIndexOf);
	const bridgeFindings = bridges.invalid.map((invalid) =>
		bridgeInvalidFinding(invalid, sourceIndexOf),
	);
	const decoded = decodeRecords(snapshot.records, decorationIndexes);
	const detection = detectBoard(
		decoded,
		policy,
		[...inputFindings, ...bridgeFindings],
		bridges.valid,
	);
	return assembleReport({
		policy,
		findings: detection.findings,
		totalElementCount: snapshot.totalRecordCount,
		liveElementCount: decoded.filter((record) => record.live).length,
		locatableElementCount: decoded.filter((record) => record.live && record.box).length,
		broadPhaseComparisons: detection.broadPhaseComparisons,
	});
}
