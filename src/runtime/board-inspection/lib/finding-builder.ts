import type {
	COLLISION_PASSES,
	ElementRef,
	InspectionFinding,
	NodeRef,
	ObstacleRef,
	ScenePoint,
} from "@/runtime/board-inspection/schemas";
import { InspectionFindingSchema } from "@/runtime/board-inspection/schemas";
import { type DecodedRecord } from "@/runtime/board-inspection/lib/decode";
import {
	box,
	aggregateBoxes,
	focusBox,
	point,
	pointBox,
	type ExactBox,
	type ExactPoint,
} from "@/runtime/board-inspection/lib/geometry";
import { type SweepWork } from "@/runtime/board-inspection/lib/interval-sweep";
import { compareIdentity, compareIdentityLists } from "@/runtime/board-inspection/lib/ordering";

const BROAD_PHASE_COMPARISON_LIMIT = 2_000_000 as const;

interface DetectionResult {
	findings: InspectionFinding[];
	broadPhaseComparisons: number;
	workDiagnostics: {
		broadPhaseEvents: number;
		broadPhaseActiveVisits: number;
		broadPhaseExpiryPops: number;
		broadPhaseBucketScans: number;
		broadPhaseExactQuerySteps: number;
		broadPhaseHierarchyNodeVisits: number;
		broadPhasePeakActiveBuckets: number;
		broadPhasePeakActiveProfiles: number;
		broadPhasePeakIndexNodes: number;
		hierarchyCandidateVisits: number;
		containerBoundaryCandidateVisits: number;
		pathSegmentChecks: number;
	};
}
interface CollisionResult {
	findings: InspectionFinding[];
	broadPhaseComparisons: number;
	sweepWork: SweepWork;
	terminalLimit: "comparison" | null;
}
type CollisionPass = (typeof COLLISION_PASSES)[number];

/**
 * A fresh set of sweep counters, all at zero.
 * @returns the counters
 */
const emptySweepWork = (): SweepWork => ({
	events: 0,
	activeVisits: 0,
	expiryPops: 0,
	bucketScans: 0,
	exactQuerySteps: 0,
	hierarchyNodeVisits: 0,
	peakActiveBuckets: 0,
	peakActiveProfiles: 0,
	peakIndexNodes: 0,
	peakSelections: 0,
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
	"CONNECTOR_PENETRATES_TEXT",
	"CONNECTOR_INTERSECTION_UNMARKED",
	"NODE_OVERLAP",
	"LABEL_OVERLAP",
	"BRIDGE_PROVENANCE_INVALID",
];

const REASON_ORDER = [
	"non-data-input",
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
	"input-complexity-ceiling",
	"leaf-footprint-interior",
	"obstacle-footprint-interior",
	"text-interior",
	"proper-interior-crossing",
	"leaf-footprint-overlap",
	"label-node-overlap",
	"label-label-overlap",
	"incomplete-decoration",
	"stale-decoration",
] as const;

/**
 * The box a finding is drawn around: the one the detector named, the extent of the points it
 * found, or an empty box at the origin when it has neither.
 * @param input what the detector found
 * @returns the box, or null when the detector said there is none
 */
function affectedBoxOf(input: FindingInput): ExactBox | null {
	if (input.affected === null) {
		return null;
	}
	return box(input.affected ?? pointBox(input.points ?? []) ?? { x: 0, y: 0, width: 0, height: 0 });
}

/**
 * Build one finding, giving it the box a reader is pointed at: what the detector named, or
 * failing that the points it found, so every finding can be focused on the canvas.
 * @param input what the detector found
 * @returns the parsed finding
 */
function make(input: FindingInput): InspectionFinding {
	const affectedBBox = affectedBoxOf(input);
	const focusResult = focusBox(affectedBBox);
	return InspectionFindingSchema.parse({
		code: input.code,
		reason: input.reason,
		severity: input.severity,
		affectsCoverage: input.affectsCoverage,
		message: input.message,
		elements: [...(input.elements ?? [])],
		nodes: [...(input.nodes ?? [])],
		obstacles: [...(input.obstacles ?? [])],
		points: [...(input.points ?? [])].map(point),
		affectedBBox,
		focusBBox: focusResult.kind === "representable" ? focusResult.box : null,
		details: input.details,
	});
}

/**
 * Order two element references by identity, then by where they sat in the input.
 * @param a one reference
 * @param b the other
 * @returns -1, 0 or 1
 */
const refOrder = (a: ElementRef, b: ElementRef) =>
	compareIdentity(a.id ?? "", b.id ?? "") || a.sourceIndex - b.sourceIndex;

/**
 * Order two scene points left to right, then top to bottom.
 * @param a one point
 * @param b the other
 * @returns -1, 0 or 1
 */
const pointOrder = (a: ScenePoint, b: ScenePoint) => a.x - b.x || a.y - b.y;

/**
 * Order two number lists element by element, shorter first when one is a prefix of the other.
 * @param a one list
 * @param b the other
 * @returns -1, 0 or 1
 */
const numberListOrder = (a: readonly number[], b: readonly number[]): number => {
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		const difference = a[index]! - b[index]!;
		if (difference) {
			return difference;
		}
	}
	return a.length - b.length;
};
/**
 * The references of a set of records, one per input slot.
 * @param records the records a finding names
 * @returns their references, deduplicated by source index
 */
const uniqueRefs = (records: readonly DecodedRecord[]) => [
	...new Map(records.map((record) => [`${record.sourceIndex}`, record.ref])).values(),
];
/**
 * The evidence boxes of whichever records have one.
 * @param records the records a finding names
 * @returns their evidence boxes
 */
const evidenceBoxesOf = (records: readonly DecodedRecord[]): ExactBox[] =>
	records.flatMap((record) => (record.evidenceBox ? [record.evidenceBox] : []));
/**
 * The box a finding about these records is drawn around: their aggregate where that is
 * representable, and otherwise the representative box the aggregate fell back to.
 * @param records the records a finding names
 * @returns the box, or null when the records have no evidence at all
 */
const affectedOf = (records: readonly DecodedRecord[]): ExactBox | null => {
	const aggregate = aggregateBoxes(evidenceBoxesOf(records));
	return aggregate.kind === "representable"
		? aggregate.box
		: aggregate.kind === "unrepresentable"
			? aggregate.representative
			: null;
};

/**
 * Order a run's findings the way the report publishes them: errors first, then by the
 * authored code and reason order, then by what each finding names, and finally by where it
 * sits on the canvas. Two runs over one board therefore report in the same order.
 * @param findings the run's findings
 * @returns the findings in report order
 */
function orderedFindings(findings: readonly InspectionFinding[]): InspectionFinding[] {
	return findings.toSorted(
		(a, b) => compareSeverityAndKind(a, b) || compareSubjects(a, b) || comparePlace(a, b),
	);
}

/**
 * Order two findings by how serious they are and what kind of thing they say.
 * @param a one finding
 * @param b the other
 * @returns -1, 0 or 1
 */
function compareSeverityAndKind(a: InspectionFinding, b: InspectionFinding): number {
	const severity = (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1);
	return (
		severity ||
		CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code) ||
		REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason)
	);
}

/**
 * Order two findings by what they name: nodes, then obstacles, then elements, then where
 * those elements sat in the input.
 * @param a one finding
 * @param b the other
 * @returns -1, 0 or 1
 */
function compareSubjects(a: InspectionFinding, b: InspectionFinding): number {
	return (
		compareIdentityLists(
			a.nodes.map((node) => node.id),
			b.nodes.map((node) => node.id),
		) ||
		compareIdentityLists(
			a.obstacles.map((obstacle) => obstacle.id),
			b.obstacles.map((obstacle) => obstacle.id),
		) ||
		compareIdentityLists(
			a.elements.map((element) => element.id ?? ""),
			b.elements.map((element) => element.id ?? ""),
		) ||
		numberListOrder(
			a.elements.map((element) => element.sourceIndex),
			b.elements.map((element) => element.sourceIndex),
		)
	);
}

/**
 * Order two findings by where they sit: their first point, then their box, then their message,
 * so nothing is left to the order the detectors happened to run in.
 * @param a one finding
 * @param b the other
 * @returns -1, 0 or 1
 */
function comparePlace(a: InspectionFinding, b: InspectionFinding): number {
	const left = placeOf(a);
	const right = placeOf(b);
	for (let index = 0; index < left.length; index += 1) {
		const difference = left[index]! - right[index]!;
		if (difference) {
			return difference;
		}
	}
	return compareIdentity(a.message, b.message);
}

/**
 * Where a finding sits, as the ordered coordinates its order is decided on: its first point,
 * then its box. A finding without one of them sorts last on that coordinate.
 * @param finding the finding
 * @returns the coordinates, in comparison order
 */
function placeOf(finding: InspectionFinding): readonly number[] {
	const first = finding.points[0];
	return [coordinate(first?.x), coordinate(first?.y), ...boxCoordinates(finding.affectedBBox)];
}

/**
 * A box as the four coordinates its order is decided on, with a finding that has no box
 * sorting last on each of them.
 * @param affected the finding's box, when it has one
 * @returns the four coordinates
 */
function boxCoordinates(affected: InspectionFinding["affectedBBox"]): readonly number[] {
	return [
		coordinate(affected?.x),
		coordinate(affected?.y),
		coordinate(affected?.width),
		coordinate(affected?.height),
	];
}

/**
 * One coordinate of a finding for ordering, with a finding that has none sorting last.
 * @param value the coordinate, when the finding has one
 * @returns the coordinate, or infinity
 */
function coordinate(value: number | undefined): number {
	return value ?? Infinity;
}

/**
 * Put one finding's own lists in canonical order, so two runs that found the same thing
 * report it identically.
 * @param finding the finding
 * @returns the canonical finding
 */
function canonicalFinding(finding: InspectionFinding): InspectionFinding {
	return InspectionFindingSchema.parse({
		...finding,
		elements: [...finding.elements].toSorted(refOrder),
		nodes: [...finding.nodes].toSorted((a, b) => compareIdentity(a.id, b.id)),
		obstacles: [...finding.obstacles].toSorted((a, b) => compareIdentity(a.id, b.id)),
		points: [...finding.points].toSorted(pointOrder),
	});
}

/**
 * Canonicalise and order a run's findings, which is the last thing a run does to them.
 * @param findings the run's findings
 * @returns the findings as the report publishes them
 */
function terminalFinalizeFindings(findings: readonly InspectionFinding[]): InspectionFinding[] {
	return orderedFindings(findings.map(canonicalFinding));
}

export {
	BROAD_PHASE_COMPARISON_LIMIT,
	type CollisionPass,
	type CollisionResult,
	type DetectionResult,
	type FindingInput,
	affectedOf,
	emptySweepWork,
	evidenceBoxesOf,
	make,
	numberListOrder,
	pointOrder,
	refOrder,
	terminalFinalizeFindings,
	uniqueRefs,
};
