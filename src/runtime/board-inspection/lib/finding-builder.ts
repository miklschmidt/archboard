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
		elements: [...(input.elements ?? [])],
		nodes: [...(input.nodes ?? [])],
		obstacles: [...(input.obstacles ?? [])],
		points: [...(input.points ?? [])].map(point),
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
		if (difference) {
			return difference;
		}
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

function orderedFindings(findings: readonly InspectionFinding[]): InspectionFinding[] {
	return findings.toSorted((a, b) => {
		const severity = (a.severity === "error" ? 0 : 1) - (b.severity === "error" ? 0 : 1);
		if (severity) {
			return severity;
		}
		const code = CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code);
		if (code) {
			return code;
		}
		const reason = REASON_ORDER.indexOf(a.reason) - REASON_ORDER.indexOf(b.reason);
		if (reason) {
			return reason;
		}
		const nodes = compareIdentityLists(
			a.nodes.map((node) => node.id),
			b.nodes.map((node) => node.id),
		);
		if (nodes) {
			return nodes;
		}
		const obstacles = compareIdentityLists(
			a.obstacles.map((obstacle) => obstacle.id),
			b.obstacles.map((obstacle) => obstacle.id),
		);
		if (obstacles) {
			return obstacles;
		}
		const elements = compareIdentityLists(
			a.elements.map((element) => element.id ?? ""),
			b.elements.map((element) => element.id ?? ""),
		);
		if (elements) {
			return elements;
		}
		const sources = numberListOrder(
			a.elements.map((element) => element.sourceIndex),
			b.elements.map((element) => element.sourceIndex),
		);
		if (sources) {
			return sources;
		}
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

function canonicalFinding(finding: InspectionFinding): InspectionFinding {
	return InspectionFindingSchema.parse({
		...finding,
		elements: [...finding.elements].toSorted(refOrder),
		nodes: [...finding.nodes].toSorted((a, b) => compareIdentity(a.id, b.id)),
		obstacles: [...finding.obstacles].toSorted((a, b) => compareIdentity(a.id, b.id)),
		points: [...finding.points].toSorted(pointOrder),
	});
}

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
