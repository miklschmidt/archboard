import { boundTextDrift, labelAnchorOf, planLabelRepair } from "../../engine/labels.js";
import { measureLinear } from "../../engine/geometry.js";
import type {
	ElementRef,
	InspectionFinding,
	InspectionPolicy,
	NodeRef,
	ObstacleRef,
	ScenePoint,
} from "../schemas.js";
import { InspectionFindingSchema } from "../schemas.js";
import { decodePath, kindOf, stableDescription, type DecodedRecord } from "./decode.js";
import {
	box,
	aggregateBoxes,
	finite,
	focusBox,
	intersectSegments,
	overlap,
	point,
	pointBox,
	segmentInsideBox,
	type ExactBox,
	type ExactPoint,
	type Segment,
} from "./geometry.js";
import {
	archboardMetadata,
	boundElementTargetCompatible,
	buildInspectionModel,
	classifyBindingTarget,
	classifyBoundElements,
	groupIds,
	libraryAttribution,
	type BlockingBindingIssue,
	type InspectionModel,
	type InspectionNode,
	type InspectionObstacle,
} from "./model.js";
import {
	buildSweepHierarchy,
	sweepIntervalPairs,
	type SweepPartition,
	type SweepWork,
} from "./interval-sweep.js";
import { compareIdentity, compareIdentityLists } from "./ordering.js";
import {
	BROAD_PHASE_PREPROCESSING_LIMIT,
	PreprocessingBudget,
	PreprocessingCeilingReached,
	type PreprocessingPass,
} from "./preprocessing-budget.js";

export const BROAD_PHASE_COMPARISON_LIMIT = 2_000_000 as const;

interface DetectionResult {
	findings: InspectionFinding[];
	broadPhaseComparisons: number;
	preprocessingWork: {
		preprocessingSteps: number;
		broadPhaseEvents: number;
		broadPhaseActiveVisits: number;
		broadPhaseExpiryPops: number;
		broadPhasePartitionChecks: number;
		broadPhaseBucketScans: number;
		broadPhaseBucketIndexOperations: number;
		broadPhaseBucketLookups: number;
		broadPhaseBucketUpdates: number;
		broadPhaseBucketDeletes: number;
		broadPhaseCompatibilityIndexUpdates: number;
		broadPhaseCompatibilityProfiles: number;
		broadPhaseProfileSnapshotEntries: number;
		broadPhaseProfileSortComparisons: number;
		broadPhaseProfileTerminalLookups: number;
		broadPhaseProfileCreations: number;
		broadPhaseProfileTrieSteps: number;
		broadPhaseCompatibilityQueries: number;
		broadPhaseCompatibilityQuerySteps: number;
		broadPhaseExactIndexUpdates: number;
		broadPhaseExactQuerySteps: number;
		broadPhaseExactMembershipTests: number;
		broadPhaseIdentityIntersectionComparisons: number;
		broadPhaseSummaryMergeSteps: number;
		broadPhaseHierarchySummarySteps: number;
		broadPhaseCompatibilityTests: number;
		broadPhaseHierarchyMembershipTests: number;
		broadPhaseHierarchyPathQueries: number;
		broadPhaseHierarchyPathSteps: number;
		broadPhaseHierarchySubtreeQueries: number;
		broadPhaseHierarchySubtreeSteps: number;
		broadPhaseHierarchyIndexUpdateSteps: number;
		broadPhasePeakRetainedBuckets: number;
		broadPhasePeakRetainedProfiles: number;
		broadPhasePeakRetainedProfileTrieNodes: number;
		broadPhasePeakRetainedHierarchyIndexCells: number;
		broadPhasePeakRetainedExclusionRefs: number;
		broadPhasePeakRetainedIndexRefs: number;
		broadPhasePeakRetainedQueryRefs: number;
		broadPhasePeakRetainedExactIndexNodes: number;
		broadPhasePeakRetainedExactSummaryRefs: number;
		broadPhasePeakRetainedTotalStateRefs: number;
		hierarchyEvents: number;
		hierarchyCandidateVisits: number;
		hierarchyExpiryPops: number;
		hierarchyPartitionChecks: number;
		hierarchyBucketScans: number;
		hierarchyBucketIndexOperations: number;
		hierarchyCompatibilityProfiles: number;
		hierarchyPeakRetainedSelections: number;
		containerBoundaryEvents: number;
		containerBoundaryCandidateVisits: number;
		containerBoundaryBucketScans: number;
		containerBoundaryPeakRetainedBuckets: number;
		containerBoundaryPeakRetainedIndexRefs: number;
		pathSegmentChecks: number;
	};
}
interface CollisionResult {
	findings: InspectionFinding[];
	broadPhaseComparisons: number;
	preprocessingWork: SweepWork;
}

const emptySweepWork = (): SweepWork => ({
	events: 0,
	activeVisits: 0,
	expiryPops: 0,
	partitionChecks: 0,
	bucketScans: 0,
	bucketIndexOperations: 0,
	bucketLookups: 0,
	bucketUpdates: 0,
	bucketDeletes: 0,
	compatibilityIndexUpdates: 0,
	compatibilityProfiles: 0,
	profileSnapshotEntries: 0,
	profileSortComparisons: 0,
	profileTerminalLookups: 0,
	profileCreations: 0,
	profileTrieSteps: 0,
	compatibilityQueries: 0,
	compatibilityQuerySteps: 0,
	exactIndexUpdates: 0,
	exactQuerySteps: 0,
	exactMembershipTests: 0,
	identityIntersectionComparisons: 0,
	summaryMergeSteps: 0,
	hierarchySummarySteps: 0,
	compatibilityTests: 0,
	hierarchyMembershipTests: 0,
	hierarchyPathQueries: 0,
	hierarchyPathSteps: 0,
	hierarchySubtreeQueries: 0,
	hierarchySubtreeSteps: 0,
	hierarchyIndexUpdateSteps: 0,
	peakRetainedBuckets: 0,
	peakRetainedProfiles: 0,
	peakRetainedProfileTrieNodes: 1,
	peakRetainedHierarchyIndexCells: 0,
	peakRetainedExclusionRefs: 0,
	peakRetainedIndexRefs: 0,
	peakRetainedQueryRefs: 0,
	peakRetainedExactIndexNodes: 0,
	peakRetainedExactSummaryRefs: 0,
	peakRetainedTotalStateRefs: 0,
	peakRetainedSelections: 0,
});
type FindingInput = InspectionFinding extends infer Finding
	? Finding extends InspectionFinding
		? Omit<
				Finding,
				"elements" | "nodes" | "obstacles" | "points" | "affectedBBox" | "focusBBox"
			> & {
				elements?: readonly ElementRef[];
				nodes?: readonly NodeRef[];
				obstacles?: readonly ObstacleRef[];
				points?: readonly ExactPoint[];
				affected?: ExactBox | null;
			}
		: never
	: never;

const CODE_ORDER = [
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
];

const REASON_ORDER = [
	"invalid-render-fields",
	"unlocatable-record",
	"width",
	"height",
	"width-and-height",
	"invalid-element-identity",
	"duplicate-element-id",
	"missing-binding-target",
	"invalid-binding-target-type",
	"missing-binding-reciprocal",
	"malformed-start-binding",
	"malformed-end-binding",
	"malformed-bound-elements",
	"malformed-container-id",
	"dangling-bound-text",
	"dangling-bound-arrow",
	"bound-element-target-type-mismatch",
	"conflicting-bound-label-owner",
	"persisted-agent-endpoint",
	"invalid-node-metadata",
	"invalid-code-binding",
	"derived-link-persisted",
	"invalid-library-attribution",
	"orphan",
	"duplicate",
	"missing-reciprocal",
	"conflicting-owner",
	"drift",
	"persisted-seed",
	"missing-font-family",
	"disallowed-font-family",
	"invalid-font-family",
	"unsupported-type",
	"rotation",
	"curve",
	"rounded-or-elbowed",
	"points-missing",
	"points-not-array",
	"points-empty",
	"points-one-point",
	"malformed-point",
	"absolute-point-overflow",
	"unrepresentable-coordinate-span",
	"unrepresentable-focus-padding",
	"zero-length",
	"collinear-overlap",
	"broad-phase-comparison-ceiling",
	"broad-phase-preprocessing-ceiling",
	"leaf-footprint-interior",
	"obstacle-footprint-interior",
	"proper-interior-crossing",
	"leaf-footprint-overlap",
	"label-node-overlap",
	"label-label-overlap",
] as const;

function make(input: FindingInput): InspectionFinding {
	const affectedBBox =
		input.affected === null
			? null
			: box(input.affected ?? pointBox(input.points ?? []) ?? { x: 0, y: 0, width: 0, height: 0 });
	const focusResult = focusBox(affectedBBox);
	return InspectionFindingSchema.parse({
		code: input.code,
		reason: input.reason,
		severity: input.severity,
		affectsCoverage: input.affectsCoverage,
		message: input.message,
		elements: [...(input.elements ?? [])].toSorted(refOrder),
		nodes: [...(input.nodes ?? [])].toSorted((a, b) => compareIdentity(a.id, b.id)),
		obstacles: [...(input.obstacles ?? [])].toSorted((a, b) => compareIdentity(a.id, b.id)),
		points: [...(input.points ?? [])].map(point).toSorted(pointOrder),
		affectedBBox,
		focusBBox: focusResult.kind === "representable" ? focusResult.box : null,
		details: input.details,
	});
}

const refOrder = (a: ElementRef, b: ElementRef) =>
	compareIdentity(a.id ?? "", b.id ?? "") || a.sourceIndex - b.sourceIndex;
const pointOrder = (a: ScenePoint, b: ScenePoint) => a.x - b.x || a.y - b.y;
const numberListOrder = (a: readonly number[], b: readonly number[]): number => {
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		const difference = a[index]! - b[index]!;
		if (difference) return difference;
	}
	return a.length - b.length;
};
const uniqueRefs = (records: readonly DecodedRecord[]) => [
	...new Map(records.map((record) => [`${record.sourceIndex}`, record.ref])).values(),
];
const evidenceBoxesOf = (records: readonly DecodedRecord[]): ExactBox[] =>
	records.flatMap((record) => (record.evidenceBox ? [record.evidenceBox] : []));
const affectedOf = (records: readonly DecodedRecord[]): ExactBox | null => {
	const aggregate = aggregateBoxes(evidenceBoxesOf(records));
	return aggregate.kind === "representable"
		? aggregate.box
		: aggregate.kind === "unrepresentable"
			? aggregate.representative
			: null;
};

type IntendedRole = Extract<
	InspectionFinding,
	{ code: "BROKEN_REFERENCE"; reason: "invalid-element-identity" }
>["details"]["intendedRoles"][number];

function identityRoles(record: DecodedRecord): IntendedRole[] {
	const roles = new Set<IntendedRole>();
	const type = record.type;
	const metadata = archboardMetadata(record);
	if (type === "arrow" || type === "line") roles.add("connector");
	if (metadata && "node" in metadata) roles.add("semantic-node-member");
	if (type === "rectangle" || type === "ellipse" || type === "diamond") {
		if (libraryAttribution(record)?.valid) roles.add("valid-library-body");
		if (groupIds(record).length > 0) roles.add("qualifying-group-body");
		roles.add("node-overlap-body");
	}
	if (type === "text") {
		roles.add("font-policy-text");
		roles.add("label-overlap-body");
	}
	if (type === "text" && record.raw?.containerId !== undefined) roles.add("bound-label");
	if (record.raw?.boundElements !== undefined) roles.add("label-container");
	if (["rectangle", "ellipse", "diamond", "frame"].includes(type ?? ""))
		roles.add("closed-boundary");
	return [...roles].toSorted();
}

function identityFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const duplicate = new Map<string, DecodedRecord[]>();
	for (const record of records.filter((candidate) => candidate.live)) {
		const rawId = record.raw?.id;
		if (!record.id) {
			const roles = identityRoles(record);
			const missing = !record.raw || !("id" in record.raw) || rawId === undefined;
			const issue: "missing-id" | "empty-string-id" | "non-string-id" = missing
				? "missing-id"
				: rawId === ""
					? "empty-string-id"
					: "non-string-id";
			const rawIdType: ReturnType<typeof kindOf> | "missing" =
				!record.raw || !("id" in record.raw) ? "missing" : kindOf(rawId);
			const shared = {
				code: "BROKEN_REFERENCE",
				reason: "invalid-element-identity",
				severity: "error",
				message: `Element at source index ${record.sourceIndex} has ${issue}.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			} as const;
			const details = {
				identityIssue: issue,
				rawIdType,
				rawIdDescription: stableDescription(rawId),
				sourceIndex: record.sourceIndex,
				intendedRoles: roles,
				availableElementType: record.type,
			};
			findings.push(
				roles.length > 0
					? make({ ...shared, affectsCoverage: true, details })
					: make({ ...shared, affectsCoverage: false, details: { ...details, intendedRoles: [] } }),
			);
		} else {
			const list = duplicate.get(record.id) ?? [];
			list.push(record);
			duplicate.set(record.id, list);
		}
	}
	for (const [id, matches] of duplicate)
		if (matches.length > 1)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "duplicate-element-id",
					severity: "error",
					affectsCoverage: true,
					details: {
						duplicateId: id,
						sourceIndexes: matches.map((r) => r.sourceIndex).toSorted((a, b) => a - b),
					},
					message: `Element id ${id} occurs ${matches.length} times.`,
					elements: uniqueRefs(matches),
					affected: affectedOf(matches),
				}),
			);
	return findings;
}

function renderFindings(records: readonly DecodedRecord[]): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const record of records.filter((candidate) => candidate.live)) {
		const raw = record.raw;
		const fields = record.invalidRenderFields;
		if (fields.length === 0) continue;
		const locatable =
			typeof raw?.x === "number" &&
			Number.isFinite(raw.x) &&
			typeof raw?.y === "number" &&
			Number.isFinite(raw.y);
		if (!locatable)
			findings.push(
				make({
					code: "INVALID_RENDER_GEOMETRY",
					reason: "unlocatable-record",
					severity: "error",
					affectsCoverage: true,
					details: {
						recordKind: record.type ?? kindOf(record.raw),
						invalidFields: fields,
						sourceIndex: record.sourceIndex,
					},
					message: `Element at source index ${record.sourceIndex} cannot be located.`,
					elements: [record.ref],
					affected: null,
				}),
			);
		else
			findings.push(
				make({
					code: "INVALID_RENDER_GEOMETRY",
					reason: "invalid-render-fields",
					severity: "error",
					affectsCoverage: true,
					details: {
						invalidFields: fields,
						valueKinds: Object.fromEntries(fields.map((f) => [f, kindOf(raw?.[f])])),
					},
					message: `Element ${record.id ?? `at source index ${record.sourceIndex}`} has invalid render geometry.`,
					elements: [record.ref],
					points: [{ x: raw.x as number, y: raw.y as number }],
					affected: record.evidenceBox,
				}),
			);
	}
	return findings;
}

type CoordinateSpanScope = Extract<
	InspectionFinding,
	{ code: "AMBIGUOUS_GEOMETRY"; reason: "unrepresentable-coordinate-span" }
>["details"]["scope"];

function coordinateSpanFinding(
	scope: CoordinateSpanScope,
	subjectId: string | null,
	members: readonly DecodedRecord[],
): InspectionFinding {
	const sources = members.map((record) => record.sourceIndex).toSorted((a, b) => a - b);
	const aggregate = aggregateBoxes(evidenceBoxesOf(members));
	const originEvidence = members
		.filter((record) => record.raw && finite(record.raw.x) && finite(record.raw.y))
		.toSorted((a, b) => a.sourceIndex - b.sourceIndex)[0];
	const affected =
		aggregate.kind === "representable"
			? aggregate.box
			: aggregate.kind === "unrepresentable"
				? aggregate.representative
				: originEvidence?.raw
					? {
							x: originEvidence.raw.x as number,
							y: originEvidence.raw.y as number,
							width: 0,
							height: 0,
						}
					: null;
	return make({
		code: "AMBIGUOUS_GEOMETRY",
		reason: "unrepresentable-coordinate-span",
		severity: "warning",
		affectsCoverage: true,
		details: {
			scope,
			subjectId,
			sourceIndexes: sources,
			issue: "finite-constituents-have-no-finite-union",
		},
		message: `${scope} ${subjectId ?? sources.join(",")} has no finite aggregate coordinate span.`,
		elements: uniqueRefs(members),
		affected,
	});
}

function coordinateSpanFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	produced: readonly InspectionFinding[],
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const record of records)
		if (
			record.live &&
			record.raw &&
			record.invalidRenderFields.length === 0 &&
			!record.extentRepresentable
		)
			findings.push(coordinateSpanFinding("record-extent", record.id, [record]));
	for (const failure of model.aggregateFailures)
		findings.push(coordinateSpanFinding(failure.scope, failure.subjectId, failure.members));
	const bySource = new Map(records.map((record) => [record.sourceIndex, record]));
	const seen = new Set<string>();
	for (const finding of produced) {
		const members = finding.elements
			.map((reference) => bySource.get(reference.sourceIndex))
			.filter((record): record is DecodedRecord => !!record && !!record.evidenceBox);
		if (members.length < 2 || aggregateBoxes(evidenceBoxesOf(members)).kind !== "unrepresentable")
			continue;
		const key = members
			.map((record) => record.sourceIndex)
			.toSorted((a, b) => a - b)
			.join(",");
		if (seen.has(key)) continue;
		seen.add(key);
		findings.push(coordinateSpanFinding("finding-affected-union", null, members));
	}
	return findings;
}

function focusPaddingFindings(produced: readonly InspectionFinding[]): InspectionFinding[] {
	return produced.flatMap((finding) => {
		if (
			finding.affectedBBox === null ||
			finding.focusBBox !== null ||
			(finding.code === "AMBIGUOUS_GEOMETRY" && finding.reason === "unrepresentable-focus-padding")
		)
			return [];
		const focusResult = focusBox(finding.affectedBBox);
		if (focusResult.kind !== "unrepresentable") return [];
		return [
			make({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "unrepresentable-focus-padding",
				severity: "warning",
				affectsCoverage: true,
				details: {
					padding: 16,
					failedDeltas: focusResult.failedDeltas,
					issue: "exact-16px-padding-is-not-finite-and-representable",
				},
				message: `Finding ${finding.code}/${finding.reason} cannot represent exact 16px focus padding.`,
				elements: finding.elements,
				nodes: finding.nodes,
				obstacles: finding.obstacles,
				points: finding.points,
				affected: finding.affectedBBox,
			}),
		];
	});
}

type RecordMap = ReadonlyMap<string, DecodedRecord>;
type RawRecord = Readonly<Record<string, unknown>>;

const locatableOrigin = (raw: RawRecord): raw is RawRecord & { x: number; y: number } =>
	typeof raw.x === "number" &&
	Number.isFinite(raw.x) &&
	typeof raw.y === "number" &&
	Number.isFinite(raw.y);

const storedExtent = (record: DecodedRecord, raw: RawRecord): ExactBox | null =>
	record.evidenceBox ?? (locatableOrigin(raw) ? { x: raw.x, y: raw.y, width: 0, height: 0 } : null);

function decodedPathEvidence(
	record: DecodedRecord,
	raw: RawRecord,
	scenePoints: readonly ExactPoint[] | null | undefined,
): { points: readonly ExactPoint[]; affected: ExactBox | null } {
	if (scenePoints === null || (scenePoints === undefined && !locatableOrigin(raw)))
		return { points: [], affected: null };
	const points = scenePoints ?? [];
	const pathBox = points.length > 0 ? pointBox(points) : null;
	return {
		points,
		affected: pathBox ?? storedExtent(record, raw),
	};
}

function unusablePathFinding(record: DecodedRecord, raw: RawRecord): InspectionFinding {
	const decoded = decodePath(record);
	if (decoded.ok) throw new Error("usable connector path passed to unusablePathFinding");
	if (decoded.issue === "absolute-point-overflow") {
		const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
		return make({
			code: "AMBIGUOUS_GEOMETRY",
			reason: "absolute-point-overflow",
			severity: "warning",
			affectsCoverage: true,
			details: {
				connectorId: record.id,
				sourceIndex: record.sourceIndex,
				pointIndex: decoded.pointIndex,
				issue: "absolute path coordinate or segment arithmetic exceeded finite inspection range",
			},
			message: `Connector ${record.id ?? record.sourceIndex} overflows absolute path coordinates.`,
			elements: [record.ref],
			...evidence,
		});
	}
	if (decoded.issue === "malformed-point") {
		const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
		return make({
			code: "AMBIGUOUS_GEOMETRY",
			reason: "malformed-point",
			severity: "warning",
			affectsCoverage: true,
			details: {
				connectorId: record.id,
				sourceIndex: record.sourceIndex,
				pointIndex: decoded.pointIndex,
				issue: "point must contain two finite numbers",
			},
			message: `Connector ${record.id ?? record.sourceIndex} has a malformed point.`,
			elements: [record.ref],
			...evidence,
		});
	}
	const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
	const shared = {
		code: "AMBIGUOUS_GEOMETRY" as const,
		severity: "warning" as const,
		affectsCoverage: true as const,
		message: `Connector ${record.id ?? record.sourceIndex} has no usable path.`,
		elements: [record.ref],
		...evidence,
	};
	switch (decoded.issue) {
		case "missing":
			return make({
				...shared,
				reason: "points-missing",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: "missing",
					rawPointsDescription: "missing",
					pointCount: null,
					minimumRequired: 2,
					issue: "missing",
				},
			});
		case "non-array":
			return make({
				...shared,
				reason: "points-not-array",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: kindOf(raw.points),
					rawPointsDescription: stableDescription(raw.points),
					pointCount: null,
					minimumRequired: 2,
					issue: "non-array",
				},
			});
		case "empty":
			return make({
				...shared,
				reason: "points-empty",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: "array",
					rawPointsDescription: "array",
					pointCount: 0,
					minimumRequired: 2,
					issue: "empty",
				},
			});
		case "one-point":
			return make({
				...shared,
				reason: "points-one-point",
				details: {
					connectorId: record.id,
					sourceIndex: record.sourceIndex,
					rawPointsKind: "array",
					rawPointsDescription: "array",
					pointCount: 1,
					minimumRequired: 2,
					issue: "insufficient-cardinality",
				},
			});
	}
}

function connectorGeometryFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
	segments: Segment[],
	work: { pathSegmentChecks: number },
	budget: PreprocessingBudget,
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const refs = [record.ref];
	if (Array.isArray(raw.points))
		budget.charge("connector-intersection", "prepare-events", raw.points.length * 3);
	const decoded = decodePath(record);
	const pathEvidence = decodedPathEvidence(record, raw, decoded.scenePoints);
	const angle = raw.angle;
	const unsupportedRotation = angle !== undefined && angle !== 0;
	if (unsupportedRotation)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rotation",
				severity: "warning",
				affectsCoverage: true,
				details: {
					angle:
						typeof angle === "number" && Number.isFinite(angle) ? angle : stableDescription(angle),
				},
				message: `Connector ${record.id ?? record.sourceIndex} is rotated.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	const unsupportedCurve = raw.curve !== undefined || raw.curveKind !== undefined;
	if (unsupportedCurve)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "curve",
				severity: "warning",
				affectsCoverage: true,
				details: { curveKind: stableDescription(raw.curveKind ?? raw.curve) },
				message: `Connector ${record.id ?? record.sourceIndex} is curved.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	const unsupportedRounded =
		raw.roundness != null ||
		(raw.elbowed !== undefined && raw.elbowed !== null && raw.elbowed !== false) ||
		raw.fixedSegments != null;
	if (unsupportedRounded)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rounded-or-elbowed",
				severity: "warning",
				affectsCoverage: true,
				details: {
					roundness: raw.roundness == null ? null : stableDescription(raw.roundness),
					elbowed: raw.elbowed === true,
					fixedSegments: raw.fixedSegments != null,
				},
				message: `Connector ${record.id ?? record.sourceIndex} uses rounded or elbowed geometry.`,
				elements: refs,
				...pathEvidence,
			}),
		);
	if (!decoded.ok) return [...findings, unusablePathFinding(record, raw)];
	for (const segmentIndex of decoded.zeroSegments)
		findings.push(
			make({
				code: "AMBIGUOUS_GEOMETRY",
				reason: "zero-length",
				severity: "warning",
				affectsCoverage: true,
				details: { connectorId: record.id, sourceIndex: record.sourceIndex, segmentIndex },
				message: `Connector ${record.id ?? record.sourceIndex} has a zero-length segment.`,
				elements: refs,
				points: decoded.scenePoints ? [decoded.scenePoints[segmentIndex]!] : [],
				affected: decoded.scenePoints ? pointBox([decoded.scenePoints[segmentIndex]!]) : null,
			}),
		);
	const unsupported = unsupportedRotation || unsupportedCurve || unsupportedRounded;
	if (unsupported || !record.usableId || !record.id || !decoded.scenePoints) return findings;
	const zeroSegments = new Set(decoded.zeroSegments);
	for (let index = 0; index < decoded.scenePoints.length - 1; index += 1) {
		work.pathSegmentChecks += 1;
		if (zeroSegments.has(index)) continue;
		segments.push({
			connectorId: record.id,
			sourceIndex: record.sourceIndex,
			index,
			a: decoded.scenePoints[index]!,
			b: decoded.scenePoints[index + 1]!,
		});
	}
	const measured = measureLinear(raw.points);
	if (
		!measured ||
		typeof raw.width !== "number" ||
		!Number.isFinite(raw.width) ||
		typeof raw.height !== "number" ||
		!Number.isFinite(raw.height)
	)
		return findings;
	const widthDelta = Math.abs(raw.width - measured.width),
		heightDelta = Math.abs(raw.height - measured.height);
	const staleWidth = widthDelta >= policy.dimensionTolerance,
		staleHeight = heightDelta >= policy.dimensionTolerance;
	if (staleWidth || staleHeight)
		findings.push(
			make({
				code: "STALE_LINEAR_DIMENSIONS",
				reason: staleWidth && staleHeight ? "width-and-height" : staleWidth ? "width" : "height",
				severity: "error",
				affectsCoverage: false,
				details: {
					storedWidth: raw.width,
					storedHeight: raw.height,
					measuredWidth: measured.width,
					measuredHeight: measured.height,
					widthDelta,
					heightDelta,
				},
				message: `Connector ${record.id ?? record.sourceIndex} has stale stored dimensions.`,
				elements: refs,
				points: decoded.scenePoints,
				affected: pointBox(decoded.scenePoints),
			}),
		);
	return findings;
}

type BindingIssue =
	| BlockingBindingIssue
	| "missing-focus"
	| "nonfinite-focus"
	| "missing-gap"
	| "nonfinite-gap"
	| "invalid-fixed-point";
type BindingInspection =
	| {
			binding: Record<string, unknown> | null;
			issue: BlockingBindingIssue;
			readableTargetId: null;
			classificationBlocked: true;
	  }
	| {
			binding: Record<string, unknown>;
			issue: Exclude<BindingIssue, BlockingBindingIssue> | null;
			readableTargetId: string;
			classificationBlocked: false;
	  };

function bindingIssue(value: unknown): BindingInspection {
	const binding =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	const target = classifyBindingTarget(value);
	if (target.blockingIssue)
		return {
			binding,
			issue: target.blockingIssue,
			readableTargetId: null,
			classificationBlocked: true,
		};
	let issue: Exclude<BindingIssue, BlockingBindingIssue> | null = null;
	if (binding) {
		if (!("focus" in binding)) issue = "missing-focus";
		else if (typeof binding.focus !== "number" || !Number.isFinite(binding.focus))
			issue = "nonfinite-focus";
		else if (!("gap" in binding)) issue = "missing-gap";
		else if (typeof binding.gap !== "number" || !Number.isFinite(binding.gap))
			issue = "nonfinite-gap";
		else if (
			binding.fixedPoint != null &&
			(!Array.isArray(binding.fixedPoint) ||
				binding.fixedPoint.length !== 2 ||
				binding.fixedPoint.some((n) => typeof n !== "number" || !Number.isFinite(n)))
		)
			issue = "invalid-fixed-point";
	}
	return {
		binding: binding!,
		issue,
		readableTargetId: target.readableTargetId!,
		classificationBlocked: false,
	};
}

function connectorBindingFindings(
	record: DecodedRecord,
	raw: RawRecord,
	byId: RecordMap,
	duplicateIds: ReadonlySet<string>,
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	for (const end of ["start", "end"] as const) {
		const value = raw[`${end}Binding`];
		if (value == null) continue;
		const { issue, readableTargetId, classificationBlocked } = bindingIssue(value);
		if (issue) {
			const shared = {
				code: "BROKEN_REFERENCE",
				reason: `malformed-${end}-binding` as const,
				severity: "error",
				message: `Connector ${record.id ?? record.sourceIndex} has a malformed ${end} binding.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			} as const;
			if (classificationBlocked)
				findings.push(
					make({
						...shared,
						affectsCoverage: true,
						details: {
							connectorId: record.id,
							sourceIndex: record.sourceIndex,
							rawKind: kindOf(value),
							issue,
							readableTargetId,
							classificationBlocked: true,
						},
					}),
				);
			else
				findings.push(
					make({
						...shared,
						affectsCoverage: false,
						details: {
							connectorId: record.id,
							sourceIndex: record.sourceIndex,
							rawKind: kindOf(value),
							issue,
							readableTargetId,
							classificationBlocked: false,
						},
					}),
				);
		}
		if (!readableTargetId || !record.usableId || !record.id || duplicateIds.has(readableTargetId))
			continue;
		const target = byId.get(readableTargetId);
		if (!target)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "missing-binding-target",
					severity: "error",
					affectsCoverage: true,
					details: { connectorId: record.id!, end, targetId: readableTargetId },
					message: `Connector ${record.id} names missing target ${readableTargetId}.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		else if (target.type === "arrow" || target.type === "line")
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "invalid-binding-target-type",
					severity: "error",
					affectsCoverage: true,
					details: {
						connectorId: record.id!,
						end,
						targetId: readableTargetId,
						targetType: target.type ?? "unknown",
					},
					message: `Connector ${record.id} binds to another connector.`,
					elements: [record.ref, target.ref],
					affected: affectedOf([record, target]),
				}),
			);
		else if (
			!Array.isArray(target.raw?.boundElements) ||
			!target.raw.boundElements.some(
				(entry) =>
					entry &&
					typeof entry === "object" &&
					!Array.isArray(entry) &&
					(entry as Record<string, unknown>).id === record.id &&
					(entry as Record<string, unknown>).type === "arrow",
			)
		)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "missing-binding-reciprocal",
					severity: "error",
					affectsCoverage: false,
					details: { connectorId: record.id!, end, targetId: readableTargetId },
					message: `Target ${readableTargetId} does not name connector ${record.id}.`,
					elements: [record.ref, target.ref],
					affected: affectedOf([record, target]),
				}),
			);
	}
	return findings;
}

function persistedEndpointFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	if (!record.id) return [];
	const findings: InspectionFinding[] = [];
	for (const end of ["start", "end"] as const) {
		const input = raw[end];
		if (!input || typeof input !== "object" || Array.isArray(input)) continue;
		const inputId = (input as Record<string, unknown>).id;
		if (typeof inputId !== "string" || !inputId) continue;
		const binding = raw[`${end}Binding`];
		const bindingId =
			binding && typeof binding === "object" && !Array.isArray(binding)
				? (binding as Record<string, unknown>).elementId
				: null;
		if (bindingId !== inputId)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "persisted-agent-endpoint",
					severity: "error",
					affectsCoverage: true,
					details: {
						connectorId: record.id!,
						end,
						inputTargetId: inputId,
						bindingTargetId: typeof bindingId === "string" ? bindingId : null,
					},
					message: `Connector ${record.id} persists an input-only ${end} endpoint.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
	}
	return findings;
}

function boundElementFindings(
	record: DecodedRecord,
	raw: RawRecord,
	byId: RecordMap,
	duplicateIds: ReadonlySet<string>,
): InspectionFinding[] {
	const bounds = raw.boundElements;
	if (bounds == null) return [];
	const findings: InspectionFinding[] = [];
	const { readableEntries, problems } = classifyBoundElements(bounds);
	for (const problem of problems)
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "malformed-bound-elements",
				severity: "error",
				affectsCoverage: true,
				details: {
					ownerId: record.id,
					sourceIndex: record.sourceIndex,
					rawKind: kindOf(bounds),
					entryIndex: problem.entryIndex,
					issue: problem.issue,
					readableEntries,
					classificationBlocked: true,
				},
				message: `Element ${record.id ?? record.sourceIndex} has malformed boundElements.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	if (!record.usableId || !record.id) return findings;
	for (const entry of readableEntries) {
		if (duplicateIds.has(entry.id)) continue;
		const target = byId.get(entry.id);
		if (!target)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: entry.type === "text" ? "dangling-bound-text" : "dangling-bound-arrow",
					severity: "error",
					affectsCoverage: false,
					details: { ownerId: record.id!, targetId: entry.id },
					message: `Element ${record.id} names missing bound ${entry.type} ${entry.id}.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		else if (
			target.type !== null &&
			KNOWN_ELEMENT_TYPES.has(target.type) &&
			!boundElementTargetCompatible(entry.type, target.type)
		)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "bound-element-target-type-mismatch",
					severity: "error",
					affectsCoverage: true,
					details: {
						ownerId: record.id,
						targetId: entry.id,
						declaredType: entry.type,
						actualType: target.type,
					},
					message: `Element ${record.id} declares ${entry.id} as bound ${entry.type}, but it is ${target.type}.`,
					elements: [record.ref, target.ref],
					affected: affectedOf([record, target]),
				}),
			);
	}
	return findings;
}

function metadataFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const metadata = archboardMetadata(record);
	if (
		metadata &&
		"node" in metadata &&
		(typeof metadata.node !== "string" || metadata.node.length === 0) &&
		record.id
	)
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "invalid-node-metadata",
				severity: "error",
				affectsCoverage: true,
				details: { elementId: record.id, valueKind: kindOf(metadata.node) },
				message: `Element ${record.id} has invalid node metadata.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	const binding = metadata?.binding;
	if (binding === undefined || !record.id) return findings;
	const object =
		binding && typeof binding === "object" && !Array.isArray(binding)
			? (binding as Record<string, unknown>)
			: null;
	const issues: string[] = [];
	if (!object) issues.push("binding must be an object");
	else {
		if (typeof object.path !== "string" || !object.path)
			issues.push("path must be a nonempty string");
		if (
			typeof object.path === "string" &&
			(object.path.startsWith("/") || object.path.split("/").includes(".."))
		)
			issues.push("path must be repository-relative and usable");
		if (object.repo !== undefined && typeof object.repo !== "string")
			issues.push("repo must be a string");
	}
	if (issues.length)
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "invalid-code-binding",
				severity: "error",
				affectsCoverage: false,
				details: { elementId: record.id, issues },
				message: `Element ${record.id} has an invalid code binding.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	if (typeof raw.link === "string" && raw.link)
		findings.push(
			make({
				code: "BROKEN_REFERENCE",
				reason: "derived-link-persisted",
				severity: "error",
				affectsCoverage: false,
				details: { elementId: record.id, link: raw.link },
				message: `Element ${record.id} persists a derived binding link.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	return findings;
}

function fontFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
): InspectionFinding[] {
	if (record.type !== "text") return [];
	const allowed = policy.allowedFontFamilies;
	const points = record.box
		? [
				{
					x: record.box.x + record.box.width / 2,
					y: record.box.y + record.box.height / 2,
				},
			]
		: [];
	if (!("fontFamily" in raw) || raw.fontFamily === undefined)
		return allowed !== "any" && !allowed.includes(1)
			? [
					make({
						code: "FONT_POLICY_VIOLATION",
						reason: "missing-font-family",
						severity: "warning",
						affectsCoverage: false,
						details: { effectiveFamily: 1, allowedFamilies: allowed },
						message: `Text ${record.id ?? record.sourceIndex} uses legacy font family 1.`,
						elements: [record.ref],
						points,
						affected: record.evidenceBox,
					}),
				]
			: [];
	if (
		typeof raw.fontFamily !== "number" ||
		!Number.isInteger(raw.fontFamily) ||
		![1, 2, 3, 5, 6, 7, 8].includes(raw.fontFamily)
	)
		return [
			make({
				code: "FONT_POLICY_VIOLATION",
				reason: "invalid-font-family",
				severity: "warning",
				affectsCoverage: false,
				details: {
					rawType: kindOf(raw.fontFamily),
					rawDescription: stableDescription(raw.fontFamily),
					allowedFamilies: allowed,
				},
				message: `Text ${record.id ?? record.sourceIndex} has invalid persisted fontFamily.`,
				elements: [record.ref],
				points,
				affected: record.evidenceBox,
			}),
		];
	return allowed !== "any" && !allowed.includes(raw.fontFamily as 1 | 2 | 3 | 5 | 6 | 7 | 8)
		? [
				make({
					code: "FONT_POLICY_VIOLATION",
					reason: "disallowed-font-family",
					severity: "warning",
					affectsCoverage: false,
					details: {
						rawFamily: raw.fontFamily,
						effectiveFamily: raw.fontFamily,
						allowedFamilies: allowed,
					},
					message: `Text ${record.id ?? record.sourceIndex} uses disallowed font family ${raw.fontFamily}.`,
					elements: [record.ref],
					points,
					affected: record.evidenceBox,
				}),
			]
		: [];
}

function containerFindings(record: DecodedRecord, raw: RawRecord): InspectionFinding[] {
	if (
		record.type !== "text" ||
		raw.containerId == null ||
		(typeof raw.containerId === "string" && raw.containerId.length > 0)
	)
		return [];
	return [
		make({
			code: "BROKEN_REFERENCE",
			reason: "malformed-container-id",
			severity: "error",
			affectsCoverage: true,
			details: {
				textId: record.id,
				sourceIndex: record.sourceIndex,
				rawKind: kindOf(raw.containerId),
				rawDescription: stableDescription(raw.containerId),
				issue: raw.containerId === "" ? "empty-container-id" : "non-string-container-id",
				ownerClassificationBlocked: true,
			},
			message: `Text ${record.id ?? record.sourceIndex} has a malformed containerId.`,
			elements: [record.ref],
			affected: record.evidenceBox,
		}),
	];
}

function libraryFindings(record: DecodedRecord, model: InspectionModel): InspectionFinding[] {
	const library = libraryAttribution(record);
	if (!library || library.valid || !record.id) return [];
	const rescuedByGroup = model.qualifyingGroupedObstacleElementIds.has(record.id);
	const shared = {
		code: "BROKEN_REFERENCE",
		reason: "invalid-library-attribution",
		severity: "error",
		message: `Element ${record.id} has invalid library attribution.`,
		elements: [record.ref],
		affected: record.evidenceBox,
	} as const;
	return rescuedByGroup
		? [
				make({
					...shared,
					affectsCoverage: false,
					details: {
						elementId: record.id,
						issues: library.issues,
						rescuedByGroup: true,
					},
				}),
			]
		: [
				make({
					...shared,
					affectsCoverage: true,
					details: {
						elementId: record.id,
						issues: library.issues,
						rescuedByGroup: false,
					},
				}),
			];
}

const KNOWN_ELEMENT_TYPES = new Set([
	"rectangle",
	"ellipse",
	"diamond",
	"frame",
	"text",
	"arrow",
	"line",
	"image",
	"freedraw",
]);

function hasCoverageRoleEvidence(record: DecodedRecord, hasIncomingReference: boolean): boolean {
	const raw = record.raw;
	const metadata = archboardMetadata(record);
	const malformedClosedAngle =
		["rectangle", "ellipse", "diamond", "frame"].includes(record.type ?? "") &&
		raw?.angle !== undefined &&
		(typeof raw.angle !== "number" || !Number.isFinite(raw.angle));
	return (
		hasIncomingReference ||
		malformedClosedAngle ||
		record.type === "arrow" ||
		record.type === "line" ||
		record.type === "text" ||
		libraryAttribution(record) !== null ||
		groupIds(record).length > 0 ||
		(metadata !== null && "node" in metadata) ||
		raw?.boundElements !== undefined ||
		raw?.containerId !== undefined ||
		raw?.startBinding !== undefined ||
		raw?.endBinding !== undefined ||
		raw?.points !== undefined
	);
}

function unsupportedGeometryFindings(
	record: DecodedRecord,
	raw: RawRecord,
	hasIncomingReference: boolean,
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	if (
		record.type !== "arrow" &&
		record.type !== "line" &&
		raw.angle !== undefined &&
		raw.angle !== 0 &&
		hasCoverageRoleEvidence(record, hasIncomingReference)
	)
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "rotation",
				severity: "warning",
				affectsCoverage: true,
				details: {
					angle:
						typeof raw.angle === "number" && Number.isFinite(raw.angle)
							? raw.angle
							: stableDescription(raw.angle),
				},
				message: `Element ${record.id ?? record.sourceIndex} is rotated.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	const rawType = raw.type;
	const canonicalType = typeof rawType === "string" && rawType.length > 0;
	if (
		(!canonicalType || !KNOWN_ELEMENT_TYPES.has(typeof rawType === "string" ? rawType : "")) &&
		hasCoverageRoleEvidence(record, hasIncomingReference)
	) {
		const rawTypeDescription = typeof rawType === "string" ? rawType : stableDescription(rawType);
		findings.push(
			make({
				code: "UNSUPPORTED_GEOMETRY",
				reason: "unsupported-type",
				severity: "warning",
				affectsCoverage: true,
				details: { rawType: rawTypeDescription },
				message: `Element ${record.id ?? record.sourceIndex} has unsupported type ${rawTypeDescription}.`,
				elements: [record.ref],
				affected: record.evidenceBox,
			}),
		);
	}
	return findings;
}

function incomingReferenceIds(records: readonly DecodedRecord[]): ReadonlySet<string> {
	const ids = new Set<string>();
	const add = (value: unknown) => {
		if (typeof value === "string" && value.length > 0) ids.add(value);
	};
	for (const record of records.filter((candidate) => candidate.live && candidate.raw)) {
		const raw = record.raw!;
		add(raw.containerId);
		for (const end of ["start", "end"] as const) {
			const binding = raw[`${end}Binding`];
			if (binding && typeof binding === "object" && !Array.isArray(binding))
				add((binding as RawRecord).elementId);
		}
		if (!Array.isArray(raw.boundElements)) continue;
		for (const entry of raw.boundElements)
			if (entry && typeof entry === "object" && !Array.isArray(entry)) add((entry as RawRecord).id);
	}
	return ids;
}

function structuralFindings(
	records: readonly DecodedRecord[],
	policy: InspectionPolicy,
	model: InspectionModel,
	budget: PreprocessingBudget,
): {
	findings: InspectionFinding[];
	segments: Segment[];
	pathSegmentChecks: number;
	limit: PreprocessingCeilingReached | null;
} {
	const findings: InspectionFinding[] = [];
	const segments: Segment[] = [];
	const work = { pathSegmentChecks: 0 };
	const byId = model.byId;
	const incomingReferences = incomingReferenceIds(records);
	for (const record of records.filter((candidate) => candidate.live && candidate.raw)) {
		const raw = record.raw!;
		if (record.type === "arrow" || record.type === "line") {
			try {
				findings.push(...connectorGeometryFindings(record, raw, policy, segments, work, budget));
			} catch (error) {
				if (!(error instanceof PreprocessingCeilingReached)) throw error;
				return { findings, segments, pathSegmentChecks: work.pathSegmentChecks, limit: error };
			}
			findings.push(...connectorBindingFindings(record, raw, byId, model.duplicateIds));
			if (record.usableId) {
				findings.push(...persistedEndpointFindings(record, raw));
			}
		}
		findings.push(...boundElementFindings(record, raw, byId, model.duplicateIds));
		findings.push(...containerFindings(record, raw));
		findings.push(...metadataFindings(record, raw));
		if (record.usableId) findings.push(...libraryFindings(record, model));
		findings.push(...fontFindings(record, raw, policy));
		findings.push(
			...unsupportedGeometryFindings(
				record,
				raw,
				record.id !== null && incomingReferences.has(record.id),
			),
		);
	}
	return { findings, segments, pathSegmentChecks: work.pathSegmentChecks, limit: null };
}

function labelFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
): InspectionFinding[] {
	const valid = records
		.filter((r) => r.live && r.raw && r.usableId && r.id && r.type)
		.map((r) => r.raw!) as unknown as Array<Record<string, unknown>>;
	const findings: InspectionFinding[] = [];
	const byId = model.byId;
	const plan = planLabelRepair(valid as never);
	for (const duplicate of plan.duplicates) {
		const involved = [
			byId.get(duplicate.containerId),
			byId.get(duplicate.keep),
			...duplicate.remove.map((id) => byId.get(id)),
		].filter((r): r is DecodedRecord => !!r);
		findings.push(
			make({
				code: "LABEL_CORRUPTION",
				reason: "duplicate",
				severity: "error",
				affectsCoverage: false,
				details: {
					containerId: duplicate.containerId,
					keeperId: duplicate.keep,
					duplicateIds: duplicate.remove.toSorted(compareIdentity),
				},
				message: `Container ${duplicate.containerId} has duplicate labels.`,
				elements: uniqueRefs(involved),
				affected: affectedOf(involved),
			}),
		);
	}
	for (const textId of plan.orphanIds) {
		const text = byId.get(textId);
		const containerId =
			typeof text?.raw?.containerId === "string" ? text.raw.containerId : "unknown";
		if (text)
			findings.push(
				make({
					code: "LABEL_CORRUPTION",
					reason: "orphan",
					severity: "error",
					affectsCoverage: true,
					details: { textId, containerId },
					message: `Label ${textId} names missing container ${containerId}.`,
					elements: [text.ref],
					affected: text.evidenceBox,
				}),
			);
	}
	for (const drift of boundTextDrift(valid as never)) {
		const text = byId.get(drift.textId),
			container = byId.get(drift.containerId);
		if (!text || !container) continue;
		const anchor = labelAnchorOf(container.raw as never);
		const centre = text.box
			? { x: text.box.x + text.box.width / 2, y: text.box.y + text.box.height / 2 }
			: null;
		findings.push(
			make({
				code: "LABEL_CORRUPTION",
				reason: "drift",
				severity: "error",
				affectsCoverage: false,
				details: {
					textId: drift.textId,
					containerId: drift.containerId,
					distance: drift.distance,
					allowed: drift.allowed,
				},
				message: `Label ${drift.textId} has drifted from ${drift.containerId}.`,
				elements: [text.ref, container.ref],
				points: [anchor, centre].filter((p): p is ExactPoint => !!p),
				affected: affectedOf([text, container]),
			}),
		);
	}
	for (const record of records.filter((r) => r.live && r.raw && r.id)) {
		if (record.type !== "text" && record.raw?.label && typeof record.raw.label === "object")
			findings.push(
				make({
					code: "LABEL_CORRUPTION",
					reason: "persisted-seed",
					severity: "error",
					affectsCoverage: false,
					details: { elementId: record.id!, seedField: "label" },
					message: `Element ${record.id} persists an input-only label seed.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
		if (record.type !== "text" && typeof record.raw?.text === "string")
			findings.push(
				make({
					code: "LABEL_CORRUPTION",
					reason: "persisted-seed",
					severity: "error",
					affectsCoverage: false,
					details: { elementId: record.id!, seedField: "text" },
					message: `Element ${record.id} persists an input-only text seed.`,
					elements: [record.ref],
					affected: record.evidenceBox,
				}),
			);
	}
	for (const ownership of model.labelOwnership.values()) {
		const textId = ownership.labelId;
		const text = byId.get(textId);
		if (text?.type !== "text") continue;
		if (ownership.state === "forward-only" && ownership.forwardOwnerId) {
			const owner = byId.get(ownership.forwardOwnerId);
			if (owner)
				findings.push(
					make({
						code: "LABEL_CORRUPTION",
						reason: "missing-reciprocal",
						severity: "error",
						affectsCoverage: false,
						details: { textId, containerId: owner.id!, missingSide: "container" },
						message: `Label ${textId} is not named by container ${owner.id}.`,
						elements: [text.ref, owner.ref],
						affected: affectedOf([text, owner]),
					}),
				);
		}
		if (
			ownership.state === "reverse-only" ||
			(!ownership.forwardOwnerId && ownership.state === "conflicting")
		)
			for (const ownerId of ownership.reverseOwnerIds) {
				const owner = byId.get(ownerId);
				if (!owner) continue;
				findings.push(
					make({
						code: "LABEL_CORRUPTION",
						reason: "missing-reciprocal",
						severity: "error",
						affectsCoverage: false,
						details: { textId, containerId: ownerId, missingSide: "text" },
						message: `Container ${ownerId} names label ${textId}, but the label does not name it.`,
						elements: [text.ref, owner.ref],
						affected: affectedOf([text, owner]),
					}),
				);
			}
		if (ownership.state !== "conflicting") continue;
		const primaryOwnerId = ownership.forwardOwnerId ?? ownership.reverseOwnerIds[0];
		if (!primaryOwnerId) continue;
		const other = ownership.candidateOwnerIds.filter((owner) => owner !== primaryOwnerId);
		const involved = [text, ...ownership.candidateOwnerIds.map((id) => byId.get(id))].filter(
			(record): record is DecodedRecord => !!record,
		);
		if (ownership.forwardOwnerId)
			findings.push(
				make({
					code: "BROKEN_REFERENCE",
					reason: "conflicting-bound-label-owner",
					severity: "error",
					affectsCoverage: true,
					details: {
						textId,
						forwardContainerId: ownership.forwardOwnerId,
						reverseContainerIds: ownership.reverseOwnerIds,
					},
					message: `Label ${textId} has conflicting owners.`,
					elements: uniqueRefs(involved),
					affected: affectedOf(involved),
				}),
			);
		findings.push(
			make({
				code: "LABEL_CORRUPTION",
				reason: "conflicting-owner",
				severity: "error",
				affectsCoverage: true,
				details: { textId, containerId: primaryOwnerId, otherContainerIds: other },
				message: `Label ${textId} is bound to more than one container.`,
				elements: uniqueRefs(involved),
				affected: affectedOf(involved),
			}),
		);
	}
	return findings;
}

interface PairItem<T> {
	id: string;
	box: ExactBox;
	value: T;
	records: readonly DecodedRecord[];
	semantics: SweepPartition;
}

const partitioned = <T>(
	items: readonly PairItem<T>[],
	semantics: (value: T) => SweepPartition,
	budget: PreprocessingBudget,
	pass: PreprocessingPass,
): PairItem<T>[] => {
	budget.charge(pass, "prepare-events");
	const result: PairItem<T>[] = [];
	for (const item of items) {
		budget.charge(pass, "prepare-events", 2);
		result.push({ ...item, semantics: semantics(item.value) });
	}
	return result;
};

const NO_EXCLUSIONS: ReadonlySet<string> = new Set<string>();

const unrestrictedPartition = (partition: string): SweepPartition => ({
	partition,
	excludedPartitions: NO_EXCLUSIONS,
});

function pairSweep<A, B>(
	left: readonly PairItem<A>[],
	right: readonly PairItem<B>[],
	sameSet: boolean,
	visit: (a: A, b: B) => void,
	counter: { value: number; limited: boolean; pass: string },
	work: SweepWork,
	pass: PreprocessingPass,
	budget: PreprocessingBudget,
): void {
	const materialize = <T>(items: readonly PairItem<T>[]) => {
		budget.charge(pass, "prepare-events");
		const intervals: Array<{
			id: string;
			min: number;
			max: number;
			value: PairItem<T>;
			semantics: SweepPartition;
		}> = [];
		for (const item of items) {
			budget.charge(pass, "prepare-events", 2);
			intervals.push({
				id: item.id,
				min: item.box.x,
				max: item.box.x + item.box.width,
				value: item,
				semantics: item.semantics,
			});
		}
		return intervals;
	};
	const leftIntervals = materialize(left);
	const rightIntervals = materialize(right);
	let measured: SweepWork;
	try {
		measured = sweepIntervalPairs(
			leftIntervals,
			rightIntervals,
			sameSet,
			(aInterval, bInterval) => {
				const a = aInterval.value;
				const b = bInterval.value;
				counter.value += 1;
				budget.recordBroadPhaseComparisons(counter.value);
				if (counter.value > BROAD_PHASE_COMPARISON_LIMIT) {
					counter.limited = true;
					counter.pass = pass;
					return false;
				}
				if (b.box.y > a.box.y + a.box.height || b.box.y + b.box.height < a.box.y) return;
				visit(a.value, b.value);
			},
			{ budget, pass },
		);
	} catch (error) {
		measured = budget.diagnosticState as SweepWork;
		mergeSweepWork(work, measured);
		throw error;
	}
	mergeSweepWork(work, measured);
}

function mergeSweepWork(work: SweepWork, measured: SweepWork): void {
	work.events += measured.events;
	work.activeVisits += measured.activeVisits;
	work.expiryPops += measured.expiryPops;
	work.partitionChecks += measured.partitionChecks;
	work.bucketScans += measured.bucketScans;
	work.bucketIndexOperations += measured.bucketIndexOperations;
	work.bucketLookups += measured.bucketLookups;
	work.bucketUpdates += measured.bucketUpdates;
	work.bucketDeletes += measured.bucketDeletes;
	work.compatibilityIndexUpdates += measured.compatibilityIndexUpdates;
	work.compatibilityProfiles += measured.compatibilityProfiles;
	work.profileSnapshotEntries += measured.profileSnapshotEntries;
	work.profileSortComparisons += measured.profileSortComparisons;
	work.profileTerminalLookups += measured.profileTerminalLookups;
	work.profileCreations += measured.profileCreations;
	work.profileTrieSteps += measured.profileTrieSteps;
	work.compatibilityQueries += measured.compatibilityQueries;
	work.compatibilityQuerySteps += measured.compatibilityQuerySteps;
	work.exactIndexUpdates += measured.exactIndexUpdates;
	work.exactQuerySteps += measured.exactQuerySteps;
	work.exactMembershipTests += measured.exactMembershipTests;
	work.identityIntersectionComparisons += measured.identityIntersectionComparisons;
	work.summaryMergeSteps += measured.summaryMergeSteps;
	work.hierarchySummarySteps += measured.hierarchySummarySteps;
	work.compatibilityTests += measured.compatibilityTests;
	work.hierarchyMembershipTests += measured.hierarchyMembershipTests;
	work.hierarchyPathQueries += measured.hierarchyPathQueries;
	work.hierarchyPathSteps += measured.hierarchyPathSteps;
	work.hierarchySubtreeQueries += measured.hierarchySubtreeQueries;
	work.hierarchySubtreeSteps += measured.hierarchySubtreeSteps;
	work.hierarchyIndexUpdateSteps += measured.hierarchyIndexUpdateSteps;
	work.peakRetainedBuckets = Math.max(work.peakRetainedBuckets, measured.peakRetainedBuckets);
	work.peakRetainedProfiles = Math.max(work.peakRetainedProfiles, measured.peakRetainedProfiles);
	work.peakRetainedProfileTrieNodes = Math.max(
		work.peakRetainedProfileTrieNodes,
		measured.peakRetainedProfileTrieNodes,
	);
	work.peakRetainedHierarchyIndexCells = Math.max(
		work.peakRetainedHierarchyIndexCells,
		measured.peakRetainedHierarchyIndexCells,
	);
	work.peakRetainedExclusionRefs = Math.max(
		work.peakRetainedExclusionRefs,
		measured.peakRetainedExclusionRefs,
	);
	work.peakRetainedIndexRefs = Math.max(work.peakRetainedIndexRefs, measured.peakRetainedIndexRefs);
	work.peakRetainedQueryRefs = Math.max(work.peakRetainedQueryRefs, measured.peakRetainedQueryRefs);
	work.peakRetainedExactIndexNodes = Math.max(
		work.peakRetainedExactIndexNodes,
		measured.peakRetainedExactIndexNodes,
	);
	work.peakRetainedExactSummaryRefs = Math.max(
		work.peakRetainedExactSummaryRefs,
		measured.peakRetainedExactSummaryRefs,
	);
	work.peakRetainedTotalStateRefs = Math.max(
		work.peakRetainedTotalStateRefs,
		measured.peakRetainedTotalStateRefs,
	);
	work.peakRetainedSelections = Math.max(
		work.peakRetainedSelections,
		measured.peakRetainedSelections,
	);
}

function collisionFindings(
	records: readonly DecodedRecord[],
	model: InspectionModel,
	segments: readonly Segment[],
	policy: InspectionPolicy,
	budget: PreprocessingBudget,
	result: CollisionResult,
): CollisionResult {
	const findings = result.findings;
	const counter = { value: 0, limited: false, pass: "" };
	const sweepWork = result.preprocessingWork;
	const byId = model.byId;
	const countedMap = <T, U>(
		values: readonly T[],
		pass: PreprocessingPass,
		mapValue: (value: T) => U,
	): U[] => {
		budget.charge(pass, "prepare-events");
		const mapped: U[] = [];
		for (const value of values) {
			budget.charge(pass, "prepare-events", 2);
			mapped.push(mapValue(value));
		}
		return mapped;
	};
	const countedFilter = <T>(
		values: readonly T[],
		pass: PreprocessingPass,
		keep: (value: T) => boolean,
	): T[] => {
		budget.charge(pass, "prepare-events");
		const filtered: T[] = [];
		for (const value of values) {
			budget.charge(pass, "prepare-events");
			if (!keep(value)) continue;
			budget.charge(pass, "prepare-events");
			filtered.push(value);
		}
		return filtered;
	};
	const segmentItems = countedMap(segments, "connector-node", (segment) => {
		budget.charge("connector-node", "prepare-events", 2);
		const record = byId.get(segment.connectorId);
		return {
			id: `${segment.connectorId}:${segment.index}`,
			box: pointBox([segment.a, segment.b])!,
			value: segment,
			records: record ? [record] : [],
			semantics: unrestrictedPartition(segment.connectorId),
		};
	});
	const nodeValues = [...model.nodes.values()];
	budget.charge("connector-node", "prepare-events", 1 + nodeValues.length * 2);
	const leaves = countedFilter(nodeValues, "connector-node", (node) => node.children.length === 0);
	const leafNodeItems = countedMap(leaves, "connector-node", (node) => ({
		id: node.id,
		box: node.body,
		value: node,
		records: node.bodies,
		semantics: unrestrictedPartition(node.id),
	}));
	let allNodeItems: PairItem<InspectionNode>[] = [];
	let obstacleItems: PairItem<InspectionObstacle>[] = [];
	let labelNodeRecords: DecodedRecord[] = [];
	let labelNodeItems: PairItem<DecodedRecord>[] = [];
	let labelLabelItems: PairItem<DecodedRecord>[] = [];
	const connectorEnds = (segment: Segment) => {
		return (
			model.connectorEndpoints.get(segment.connectorId) ?? {
				nodeAnalysisEligible: false,
				startNode: undefined,
				endNode: undefined,
			}
		);
	};
	budget.charge("connector-node", "prepare-events");
	const hierarchyParents = new Map<string, string | null>();
	for (const node of model.nodes.values()) {
		budget.charge("connector-node", "prepare-events", 2 + node.id.length);
		hierarchyParents.set(node.id, node.parentId);
	}
	const sweepHierarchy = buildSweepHierarchy(hierarchyParents, {
		budget,
		pass: "connector-node",
	});
	budget.charge("connector-node", "prepare-events");
	const connectorNodePartitions = new Map<string, SweepPartition>();
	for (const segment of segments) {
		budget.charge("connector-node", "prepare-events", 2 + segment.connectorId.length);
		if (connectorNodePartitions.has(segment.connectorId)) continue;
		const ends = connectorEnds(segment);
		if (!ends.nodeAnalysisEligible) continue;
		budget.charge("connector-node", "prepare-events");
		const ancestorTargets: string[] = [];
		if (ends.startNode !== undefined) {
			budget.charge("connector-node", "prepare-events");
			ancestorTargets.push(ends.startNode);
		}
		if (ends.endNode !== undefined) {
			budget.charge("connector-node", "prepare-events");
			ancestorTargets.push(ends.endNode);
		}
		budget.charge("connector-node", "prepare-events");
		connectorNodePartitions.set(segment.connectorId, {
			partition: `connector:${segment.connectorId}`,
			excludedPartitions: NO_EXCLUSIONS,
			ancestorTargets,
			hierarchy: sweepHierarchy,
		});
	}
	const labelNodePartitions = new Map<string, SweepPartition>();
	const nodeEligibleSegmentItems = countedFilter(
		segmentItems,
		"connector-node",
		(item) => connectorEnds(item.value).nodeAnalysisEligible,
	);
	pairSweep(
		partitioned(
			nodeEligibleSegmentItems,
			(segment) => connectorNodePartitions.get(segment.connectorId)!,
			budget,
			"connector-node",
		),
		leafNodeItems,
		false,
		(segment, node) => {
			const hit = segmentInsideBox(segment.a, segment.b, node.body, policy.overlapTolerance);
			if (!hit) return;
			findings.push(
				make({
					code: "CONNECTOR_PENETRATES_NODE",
					reason: "leaf-footprint-interior",
					severity: "error",
					affectsCoverage: false,
					details: {
						connectorId: segment.connectorId,
						segmentIndex: segment.index,
						nodeId: node.id,
						entry: point(hit.entry),
						exit: point(hit.exit),
					},
					message: `Connector ${segment.connectorId} passes through node ${node.id}.`,
					elements: uniqueRefs([byId.get(segment.connectorId)!].filter(Boolean)),
					nodes: [node.ref],
					points: [hit.entry, hit.exit],
					affected: pointBox([hit.entry, hit.exit]),
				}),
			);
		},
		counter,
		sweepWork,
		"connector-node",
		budget,
	);
	if (!counter.limited) {
		obstacleItems = countedMap(model.obstacles, "connector-obstacle", (obstacle) => ({
			id: obstacle.id,
			box: obstacle.box,
			value: obstacle,
			records: obstacle.members,
			semantics: unrestrictedPartition(obstacle.id),
		}));
		pairSweep(
			segmentItems,
			obstacleItems,
			false,
			(segment, obstacle) => {
				const hit = segmentInsideBox(segment.a, segment.b, obstacle.box, policy.overlapTolerance);
				if (!hit) return;
				findings.push(
					make({
						code: "CONNECTOR_PENETRATES_OBSTACLE",
						reason: "obstacle-footprint-interior",
						severity: "error",
						affectsCoverage: false,
						details: {
							connectorId: segment.connectorId,
							segmentIndex: segment.index,
							obstacleId: obstacle.id,
							entry: point(hit.entry),
							exit: point(hit.exit),
						},
						message: `Connector ${segment.connectorId} passes through obstacle ${obstacle.id}.`,
						elements: uniqueRefs(
							[byId.get(segment.connectorId)!, ...obstacle.members].filter(Boolean),
						),
						obstacles: [obstacle.ref],
						points: [hit.entry, hit.exit],
						affected: pointBox([hit.entry, hit.exit]),
					}),
				);
			},
			counter,
			sweepWork,
			"connector-obstacle",
			budget,
		);
	}
	if (!counter.limited) {
		budget.charge("connector-intersection", "prepare-events");
		const partitions = new Map<string, SweepPartition>();
		for (const segment of segments) {
			budget.charge("connector-intersection", "prepare-events", 2 + segment.connectorId.length);
			if (!partitions.has(segment.connectorId)) {
				budget.charge("connector-intersection", "prepare-events", 2);
				partitions.set(segment.connectorId, {
					partition: segment.connectorId,
					excludedPartitions: new Set([segment.connectorId]),
				});
			}
		}
		pairSweep(
			partitioned(
				segmentItems,
				(segment) => partitions.get(segment.connectorId)!,
				budget,
				"connector-intersection",
			),
			partitioned(
				segmentItems,
				(segment) => partitions.get(segment.connectorId)!,
				budget,
				"connector-intersection",
			),
			true,
			(a, b) => {
				const hit = intersectSegments(a.a, a.b, b.a, b.b, policy.intersectionTolerance);
				if (hit.kind === "proper")
					findings.push(
						make({
							code: "CONNECTOR_INTERSECTION_UNMARKED",
							reason: "proper-interior-crossing",
							severity: "error",
							affectsCoverage: false,
							details: {
								firstConnectorId: a.connectorId,
								firstSegmentIndex: a.index,
								secondConnectorId: b.connectorId,
								secondSegmentIndex: b.index,
								point: point(hit.point),
							},
							message: `Connectors ${a.connectorId} and ${b.connectorId} cross.`,
							elements: uniqueRefs(
								[byId.get(a.connectorId)!, byId.get(b.connectorId)!].filter(Boolean),
							),
							points: [hit.point],
							affected: pointBox([hit.point]),
						}),
					);
				else if (hit.kind === "collinear")
					findings.push(
						make({
							code: "AMBIGUOUS_GEOMETRY",
							reason: "collinear-overlap",
							severity: "warning",
							affectsCoverage: true,
							details: {
								firstConnectorId: a.connectorId,
								firstSegmentIndex: a.index,
								secondConnectorId: b.connectorId,
								secondSegmentIndex: b.index,
							},
							message: `Connectors ${a.connectorId} and ${b.connectorId} overlap collinearly.`,
							elements: uniqueRefs(
								[byId.get(a.connectorId)!, byId.get(b.connectorId)!].filter(Boolean),
							),
							points: hit.points,
							affected: pointBox(hit.points),
						}),
					);
			},
			counter,
			sweepWork,
			"connector-intersection",
			budget,
		);
	}
	if (!counter.limited) {
		budget.charge("node-overlap", "prepare-events");
		const partitions = new Map<string, SweepPartition>();
		for (const node of leaves) {
			budget.charge("node-overlap", "prepare-events", 2 + node.id.length);
			const excludedPartitions = new Set<string>();
			if (node.parentId) {
				budget.charge("node-overlap", "prepare-events", 1 + node.parentId.length);
				excludedPartitions.add(node.parentId);
			}
			budget.charge("node-overlap", "prepare-events");
			partitions.set(node.id, { partition: node.id, excludedPartitions });
		}
		pairSweep(
			partitioned(leafNodeItems, (node) => partitions.get(node.id)!, budget, "node-overlap"),
			partitioned(leafNodeItems, (node) => partitions.get(node.id)!, budget, "node-overlap"),
			true,
			(a, b) => {
				const hit = overlap(a.body, b.body);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance)
					return;
				findings.push(
					make({
						code: "NODE_OVERLAP",
						reason: "leaf-footprint-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							firstNodeId: a.id,
							secondNodeId: b.id,
							overlapWidth: hit.width,
							overlapHeight: hit.height,
						},
						message: `Nodes ${a.id} and ${b.id} overlap.`,
						nodes: [a.ref, b.ref],
						elements: uniqueRefs([...a.bodies, ...b.bodies]),
						affected: hit,
					}),
				);
			},
			counter,
			sweepWork,
			"node-overlap",
			budget,
		);
	}
	if (!counter.limited) {
		allNodeItems = countedMap(nodeValues, "label-node-overlap", (node) => ({
			id: node.id,
			box: node.body,
			value: node,
			records: node.bodies,
			semantics: unrestrictedPartition(node.id),
		}));
		labelNodeRecords = countedFilter(records, "label-node-overlap", (record) => {
			if (!record.live || !record.id || record.type !== "text" || !record.box) return false;
			const state = model.labelOwnership.get(record.id)?.state;
			return state !== undefined && state !== "none" && state !== "blocked";
		});
		labelNodeItems = countedMap(labelNodeRecords, "label-node-overlap", (label) => ({
			id: label.id!,
			box: label.box!,
			value: label,
			records: [label],
			semantics: unrestrictedPartition(label.id!),
		}));
		labelLabelItems = countedFilter(labelNodeItems, "label-label-overlap", (item) =>
			model.confirmedLabels.has(item.id),
		);
		budget.charge("label-node-overlap", "prepare-events");
		for (const label of labelNodeRecords) {
			budget.charge("label-node-overlap", "prepare-events", 2 + label.id!.length);
			const ownership = model.labelOwnership.get(label.id!);
			const candidateNodes: string[] = [];
			for (const owner of ownership?.candidateOwnerIds ?? []) {
				budget.charge("label-node-overlap", "prepare-events", 2 + owner.length);
				const candidate = model.nodeOfElement.get(owner);
				if (candidate !== undefined) {
					budget.charge("label-node-overlap", "prepare-events");
					candidateNodes.push(candidate);
				}
			}
			budget.charge("label-node-overlap", "prepare-events");
			labelNodePartitions.set(label.id!, {
				partition: `label:${label.id!}`,
				excludedPartitions: NO_EXCLUSIONS,
				ancestorTargets: candidateNodes,
				hierarchy: sweepHierarchy,
			});
		}
		pairSweep(
			partitioned(
				labelNodeItems,
				(label) => labelNodePartitions.get(label.id!)!,
				budget,
				"label-node-overlap",
			),
			allNodeItems,
			false,
			(label, node) => {
				const hit = overlap(label.box!, node.body);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance)
					return;
				findings.push(
					make({
						code: "LABEL_OVERLAP",
						reason: "label-node-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							labelId: label.id!,
							nodeId: node.id,
							overlapWidth: hit.width,
							overlapHeight: hit.height,
						},
						message: `Label ${label.id} overlaps node ${node.id}.`,
						elements: [label.ref],
						nodes: [node.ref],
						affected: hit,
					}),
				);
			},
			counter,
			sweepWork,
			"label-node-overlap",
			budget,
		);
	}
	if (!counter.limited) {
		const partitions = new Map<string, SweepPartition>();
		for (const label of labelLabelItems) {
			const owner = model.confirmedLabels.get(label.id!)!;
			if (!partitions.has(owner))
				partitions.set(owner, { partition: owner, excludedPartitions: new Set([owner]) });
		}
		pairSweep(
			partitioned(
				labelLabelItems,
				(label) => {
					const owner = model.confirmedLabels.get(label.id!)!;
					return partitions.get(owner)!;
				},
				budget,
				"label-label-overlap",
			),
			partitioned(
				labelLabelItems,
				(label) => {
					const owner = model.confirmedLabels.get(label.id!)!;
					return partitions.get(owner)!;
				},
				budget,
				"label-label-overlap",
			),
			true,
			(a, b) => {
				const hit = overlap(a.box!, b.box!);
				if (!hit || hit.width <= policy.overlapTolerance || hit.height <= policy.overlapTolerance)
					return;
				findings.push(
					make({
						code: "LABEL_OVERLAP",
						reason: "label-label-overlap",
						severity: "error",
						affectsCoverage: false,
						details: {
							firstLabelId: a.id!,
							secondLabelId: b.id!,
							overlapWidth: hit.width,
							overlapHeight: hit.height,
						},
						message: `Labels ${a.id} and ${b.id} overlap.`,
						elements: [a.ref, b.ref],
						affected: hit,
					}),
				);
			},
			counter,
			sweepWork,
			"label-label-overlap",
			budget,
		);
	}
	if (counter.limited) {
		const allBoxes = [...segmentItems, ...allNodeItems, ...obstacleItems, ...labelNodeItems].map(
			(item) => item.box,
		);
		const aggregate = aggregateBoxes(allBoxes);
		findings.push(
			make({
				code: "INSPECTION_LIMIT_EXCEEDED",
				reason: "broad-phase-comparison-ceiling",
				severity: "warning",
				affectsCoverage: true,
				details: {
					limit: BROAD_PHASE_COMPARISON_LIMIT,
					attempted: counter.value,
					pass: counter.pass,
					segmentCount: segments.length,
					nodeCount: leaves.length,
					obstacleCount: model.obstacles.length,
					labelCount: labelNodeRecords.length,
				},
				message: `Inspection stopped pair analysis at comparison ${counter.value}.`,
				elements: uniqueRefs(
					[...segmentItems, ...allNodeItems, ...obstacleItems, ...labelNodeItems].flatMap(
						(item) => item.records,
					),
				),
				affected:
					aggregate.kind === "representable"
						? aggregate.box
						: aggregate.kind === "unrepresentable"
							? aggregate.representative
							: null,
			}),
		);
	}
	return {
		findings,
		broadPhaseComparisons: counter.value,
		preprocessingWork: sweepWork,
	};
}

function emptyInspectionModel(): InspectionModel {
	return {
		byId: new Map(),
		duplicateIds: new Set(),
		nodes: new Map(),
		nodeOfElement: new Map(),
		confirmedLabels: new Map(),
		labelOwnership: new Map(),
		connectorEndpoints: new Map(),
		containerOnlyIds: new Set(),
		qualifyingGroupedObstacleElementIds: new Set(),
		obstacles: [],
		aggregateFailures: [],
		hierarchyWork: emptySweepWork(),
		containerBoundaryWork: emptySweepWork(),
	};
}

function preprocessingParticipants(
	records: readonly DecodedRecord[],
	model: InspectionModel | null,
): DecodedRecord[] {
	if (model) {
		const sourceIndexes = new Set<number>();
		for (const node of model.nodes.values())
			for (const record of node.bodies) sourceIndexes.add(record.sourceIndex);
		for (const obstacle of model.obstacles)
			for (const record of obstacle.members) sourceIndexes.add(record.sourceIndex);
		for (const record of records)
			if (
				record.live &&
				record.evidenceBox &&
				(record.type === "arrow" || record.type === "line" || record.type === "text")
			)
				sourceIndexes.add(record.sourceIndex);
		return records.filter((record) => sourceIndexes.has(record.sourceIndex));
	}
	return records.filter((record) => {
		if (!record.live || !record.evidenceBox) return false;
		if (record.type === "arrow" || record.type === "line" || record.type === "text") return true;
		const metadata = archboardMetadata(record);
		return (
			(metadata !== null && "node" in metadata) ||
			libraryAttribution(record) !== null ||
			(Array.isArray(record.raw?.groupIds) && record.raw.groupIds.length > 0) ||
			record.raw?.boundElements !== undefined ||
			record.raw?.containerId !== undefined ||
			(["rectangle", "ellipse", "diamond", "frame"].includes(record.type ?? "") &&
				(record.raw?.angle === undefined || record.raw.angle === 0))
		);
	});
}

function preprocessingLimitFinding(
	records: readonly DecodedRecord[],
	model: InspectionModel | null,
	error: PreprocessingCeilingReached,
	budget: PreprocessingBudget,
	segmentCount: number,
): InspectionFinding {
	const participants = preprocessingParticipants(records, model);
	return make({
		code: "INSPECTION_LIMIT_EXCEEDED",
		reason: "broad-phase-preprocessing-ceiling",
		severity: "warning",
		affectsCoverage: true,
		details: {
			limit: BROAD_PHASE_PREPROCESSING_LIMIT,
			attempted: error.attempted,
			pass: error.pass,
			phase: error.phase,
			completedBroadPhaseComparisons: budget.completedBroadPhaseComparisons,
			segmentCount,
			nodeCount: model
				? [...model.nodes.values()].filter((node) => node.children.length === 0).length
				: 0,
			obstacleCount: model?.obstacles.length ?? 0,
			labelCount: model
				? records.filter(
						(record) =>
							record.live &&
							record.id &&
							record.type === "text" &&
							model.labelOwnership.get(record.id)?.state !== "none",
					).length
				: 0,
		},
		message: `Inspection stopped preprocessing at ${error.pass}/${error.phase}.`,
		elements: uniqueRefs(participants),
		affected: affectedOf(participants),
	});
}

function sortFindings(findings: readonly InspectionFinding[]): InspectionFinding[] {
	return findings.toSorted((a, b) => {
		const severity = (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1);
		if (severity) return severity;
		const code = CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code);
		if (code) return code;
		const reason = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
		if (reason) return reason;
		const nodes = compareIdentityLists(
			a.nodes.map((node) => node.id),
			b.nodes.map((node) => node.id),
		);
		if (nodes) return nodes;
		const obstacles = compareIdentityLists(
			a.obstacles.map((obstacle) => obstacle.id),
			b.obstacles.map((obstacle) => obstacle.id),
		);
		if (obstacles) return obstacles;
		const elements = compareIdentityLists(
			a.elements.map((element) => element.id ?? ""),
			b.elements.map((element) => element.id ?? ""),
		);
		if (elements) return elements;
		const sources = numberListOrder(
			a.elements.map((element) => element.sourceIndex),
			b.elements.map((element) => element.sourceIndex),
		);
		if (sources) return sources;
		const boxA = a.affectedBBox;
		const boxB = b.affectedBBox;
		return (
			(a.points[0]?.x ?? Infinity) - (b.points[0]?.x ?? Infinity) ||
			(a.points[0]?.y ?? Infinity) - (b.points[0]?.y ?? Infinity) ||
			(boxA?.x ?? Infinity) - (boxB?.x ?? Infinity) ||
			(boxA?.y ?? Infinity) - (boxB?.y ?? Infinity) ||
			(boxA?.width ?? Infinity) - (boxB?.width ?? Infinity) ||
			(boxA?.height ?? Infinity) - (boxB?.height ?? Infinity) ||
			compareIdentity(a.message, b.message)
		);
	});
}

export function detectBoard(
	records: readonly DecodedRecord[],
	policy: InspectionPolicy,
): DetectionResult {
	const findings = [...renderFindings(records), ...identityFindings(records)];
	const budget = new PreprocessingBudget();
	let model = emptyInspectionModel();
	let modelComplete = false;
	let limit: PreprocessingCeilingReached | null = null;
	try {
		model = buildInspectionModel(records, budget);
		modelComplete = true;
	} catch (error) {
		if (!(error instanceof PreprocessingCeilingReached)) throw error;
		limit = error;
	}
	const structural = modelComplete
		? structuralFindings(records, policy, model, budget)
		: { findings: [], segments: [], pathSegmentChecks: 0, limit: null };
	findings.push(...structural.findings);
	if (structural.limit) limit = structural.limit;
	if (modelComplete) findings.push(...labelFindings(records, model));
	let collisions: CollisionResult = {
		findings: [],
		broadPhaseComparisons: budget.completedBroadPhaseComparisons,
		preprocessingWork: emptySweepWork(),
	};
	if (!limit && modelComplete)
		try {
			collisions = collisionFindings(
				records,
				model,
				structural.segments,
				policy,
				budget,
				collisions,
			);
		} catch (error) {
			if (!(error instanceof PreprocessingCeilingReached)) throw error;
			limit = error;
			collisions.broadPhaseComparisons = budget.completedBroadPhaseComparisons;
		}
	findings.push(...collisions.findings);
	if (limit)
		findings.push(
			preprocessingLimitFinding(
				records,
				modelComplete ? model : null,
				limit,
				budget,
				structural.segments.length,
			),
		);
	findings.push(...coordinateSpanFindings(records, model, findings));
	findings.push(...focusPaddingFindings(findings));
	return {
		findings: sortFindings(findings),
		broadPhaseComparisons: collisions.broadPhaseComparisons,
		preprocessingWork: {
			preprocessingSteps: budget.used,
			broadPhaseEvents: collisions.preprocessingWork.events,
			broadPhaseActiveVisits: collisions.preprocessingWork.activeVisits,
			broadPhaseExpiryPops: collisions.preprocessingWork.expiryPops,
			broadPhasePartitionChecks: collisions.preprocessingWork.partitionChecks,
			broadPhaseBucketScans: collisions.preprocessingWork.bucketScans,
			broadPhaseBucketIndexOperations: collisions.preprocessingWork.bucketIndexOperations,
			broadPhaseBucketLookups: collisions.preprocessingWork.bucketLookups,
			broadPhaseBucketUpdates: collisions.preprocessingWork.bucketUpdates,
			broadPhaseBucketDeletes: collisions.preprocessingWork.bucketDeletes,
			broadPhaseCompatibilityIndexUpdates: collisions.preprocessingWork.compatibilityIndexUpdates,
			broadPhaseCompatibilityProfiles: collisions.preprocessingWork.compatibilityProfiles,
			hierarchyEvents: model.hierarchyWork.events,
			hierarchyCandidateVisits: model.hierarchyWork.activeVisits,
			hierarchyExpiryPops: model.hierarchyWork.expiryPops,
			hierarchyPartitionChecks: model.hierarchyWork.partitionChecks,
			hierarchyBucketScans: model.hierarchyWork.bucketScans,
			hierarchyBucketIndexOperations: model.hierarchyWork.bucketIndexOperations,
			hierarchyCompatibilityProfiles: model.hierarchyWork.compatibilityProfiles,
			hierarchyPeakRetainedSelections: model.hierarchyWork.peakRetainedSelections,
			containerBoundaryEvents: model.containerBoundaryWork.events,
			containerBoundaryCandidateVisits: model.containerBoundaryWork.activeVisits,
			containerBoundaryBucketScans: model.containerBoundaryWork.bucketScans,
			containerBoundaryPeakRetainedBuckets: model.containerBoundaryWork.peakRetainedBuckets,
			containerBoundaryPeakRetainedIndexRefs: model.containerBoundaryWork.peakRetainedIndexRefs,
			broadPhaseProfileSnapshotEntries: collisions.preprocessingWork.profileSnapshotEntries,
			broadPhaseProfileSortComparisons: collisions.preprocessingWork.profileSortComparisons,
			broadPhaseProfileTerminalLookups: collisions.preprocessingWork.profileTerminalLookups,
			broadPhaseProfileCreations: collisions.preprocessingWork.profileCreations,
			broadPhaseProfileTrieSteps: collisions.preprocessingWork.profileTrieSteps,
			broadPhaseCompatibilityQueries: collisions.preprocessingWork.compatibilityQueries,
			broadPhaseCompatibilityQuerySteps: collisions.preprocessingWork.compatibilityQuerySteps,
			broadPhaseExactIndexUpdates: collisions.preprocessingWork.exactIndexUpdates,
			broadPhaseExactQuerySteps: collisions.preprocessingWork.exactQuerySteps,
			broadPhaseExactMembershipTests: collisions.preprocessingWork.exactMembershipTests,
			broadPhaseIdentityIntersectionComparisons:
				collisions.preprocessingWork.identityIntersectionComparisons,
			broadPhaseSummaryMergeSteps: collisions.preprocessingWork.summaryMergeSteps,
			broadPhaseHierarchySummarySteps: collisions.preprocessingWork.hierarchySummarySteps,
			broadPhaseCompatibilityTests: collisions.preprocessingWork.compatibilityTests,
			broadPhaseHierarchyMembershipTests: collisions.preprocessingWork.hierarchyMembershipTests,
			broadPhaseHierarchyPathQueries: collisions.preprocessingWork.hierarchyPathQueries,
			broadPhaseHierarchyPathSteps: collisions.preprocessingWork.hierarchyPathSteps,
			broadPhaseHierarchySubtreeQueries: collisions.preprocessingWork.hierarchySubtreeQueries,
			broadPhaseHierarchySubtreeSteps: collisions.preprocessingWork.hierarchySubtreeSteps,
			broadPhaseHierarchyIndexUpdateSteps: collisions.preprocessingWork.hierarchyIndexUpdateSteps,
			broadPhasePeakRetainedBuckets: collisions.preprocessingWork.peakRetainedBuckets,
			broadPhasePeakRetainedProfiles: collisions.preprocessingWork.peakRetainedProfiles,
			broadPhasePeakRetainedProfileTrieNodes:
				collisions.preprocessingWork.peakRetainedProfileTrieNodes,
			broadPhasePeakRetainedHierarchyIndexCells:
				collisions.preprocessingWork.peakRetainedHierarchyIndexCells,
			broadPhasePeakRetainedExclusionRefs: collisions.preprocessingWork.peakRetainedExclusionRefs,
			broadPhasePeakRetainedIndexRefs: collisions.preprocessingWork.peakRetainedIndexRefs,
			broadPhasePeakRetainedQueryRefs: collisions.preprocessingWork.peakRetainedQueryRefs,
			broadPhasePeakRetainedExactIndexNodes:
				collisions.preprocessingWork.peakRetainedExactIndexNodes,
			broadPhasePeakRetainedExactSummaryRefs:
				collisions.preprocessingWork.peakRetainedExactSummaryRefs,
			broadPhasePeakRetainedTotalStateRefs: collisions.preprocessingWork.peakRetainedTotalStateRefs,
			pathSegmentChecks: structural.pathSegmentChecks,
		},
	};
}
