import { measureLinear } from "@/runtime/engine/geometry";
import type { InspectionFinding, InspectionPolicy } from "@/runtime/board-inspection/schemas";
import {
	decodePath,
	persistedConnectorPointChainEligibility,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import { pointBox, type ExactPoint, type Segment } from "@/runtime/board-inspection/lib/geometry";
import { make } from "@/runtime/board-inspection/lib/finding-builder";
import type { RawRecord, RecordMap } from "@/runtime/board-inspection/lib/connector-records";
import {
	decodedPathEvidence,
	storedExtent,
	unusablePathFinding,
	type PathEvidence,
} from "@/runtime/board-inspection/lib/connector-evidence";
import {
	connectorBindingFindings,
	persistedEndpointFindings,
} from "@/runtime/board-inspection/lib/detect-connector-bindings";

/** The run's segment budget, counted up as each connector's path is walked. */
interface SegmentWork {
	pathSegmentChecks: number;
}

/**
 * The finding for a rotated connector, whose stored angle the inspection does not model.
 * @param record the connector
 * @param angle the raw angle
 * @param evidence what the finding can point at
 * @returns the finding
 */
function rotationFinding(
	record: DecodedRecord,
	angle: unknown,
	evidence: PathEvidence,
): InspectionFinding {
	return make({
		code: "UNSUPPORTED_GEOMETRY",
		reason: "rotation",
		severity: "warning",
		affectsCoverage: true,
		details: {
			angle: typeof angle === "number" && Number.isFinite(angle) ? angle : stableDescription(angle),
		},
		message: `Connector ${record.id ?? record.sourceIndex} is rotated.`,
		elements: [record.ref],
		...evidence,
	});
}

/**
 * The finding for a curved connector, whose curve the inspection's straight segments cannot
 * stand for.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param evidence what the finding can point at
 * @returns the finding
 */
function curveFinding(
	record: DecodedRecord,
	raw: RawRecord,
	evidence: PathEvidence,
): InspectionFinding {
	return make({
		code: "UNSUPPORTED_GEOMETRY",
		reason: "curve",
		severity: "warning",
		affectsCoverage: true,
		details: { curveKind: stableDescription(raw["curveKind"] ?? raw["curve"]) },
		message: `Connector ${record.id ?? record.sourceIndex} is curved.`,
		elements: [record.ref],
		...evidence,
	});
}

/** What an ineligible point chain was found to be. */
type Ineligibility = Exclude<
	ReturnType<typeof persistedConnectorPointChainEligibility>,
	{ eligible: true }
>;

/**
 * What to say about a point chain the inspection will not follow.
 * @param record the connector
 * @param eligibility why the chain is ineligible
 * @returns the message
 */
function ineligibilityMessage(record: DecodedRecord, eligibility: Ineligibility): string {
	const subject = `Connector ${record.id ?? record.sourceIndex}`;
	if (eligibility.issue === "elbow-coordinate-limit") {
		return `${subject} has elbow point ${eligibility.pointIndex} ${eligibility.axis} coordinate ${eligibility.coordinate} exceeding ±1,000,000.`;
	}
	if (eligibility.issue === "malformed-elbowed") {
		return `${subject} has malformed elbowed metadata.`;
	}
	return `${subject} has fixedSegments metadata without elbowed geometry.`;
}

/**
 * The finding for a connector whose rounding or elbow metadata puts its point chain outside
 * what the inspection follows.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param eligibility why the chain is ineligible
 * @param evidence what the finding can point at
 * @returns the finding
 */
function ineligibleChainFinding(
	record: DecodedRecord,
	raw: RawRecord,
	eligibility: Ineligibility,
	evidence: PathEvidence,
): InspectionFinding {
	return make({
		code: "UNSUPPORTED_GEOMETRY",
		reason: "rounded-or-elbowed",
		severity: "warning",
		affectsCoverage: true,
		details: {
			roundness: raw["roundness"] == null ? null : stableDescription(raw["roundness"]),
			elbowed: raw["elbowed"] === true,
			fixedSegments: raw["fixedSegments"] != null,
		},
		message: ineligibilityMessage(record, eligibility),
		elements: [record.ref],
		...evidence,
	});
}

/**
 * The geometry the inspection does not model: rotation, curvature, and point chains its
 * segment model cannot stand for. A connector with any of these is described but not measured.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param evidence what the findings can point at
 * @returns the findings
 */
function unsupportedGeometryFindings(
	record: DecodedRecord,
	raw: RawRecord,
	evidence: PathEvidence,
): InspectionFinding[] {
	const findings: InspectionFinding[] = [];
	const angle = raw["angle"];
	if (rotated(angle)) {
		findings.push(rotationFinding(record, angle, evidence));
	}
	if (curved(raw)) {
		findings.push(curveFinding(record, raw, evidence));
	}
	const ineligible = ineligibleChain(record);
	if (ineligible !== null) {
		findings.push(ineligibleChainFinding(record, raw, ineligible, evidence));
	}
	return findings;
}

/**
 * Whether a connector carries a rotation, which the inspection's axis-aligned model does not
 * stand for.
 * @param angle the raw angle
 * @returns true when the connector is rotated
 */
function rotated(angle: unknown): boolean {
	return angle !== undefined && angle !== 0;
}

/**
 * Whether a connector carries curvature, which its straight segments do not stand for.
 * @param raw the connector's raw fields
 * @returns true when the connector is curved
 */
function curved(raw: RawRecord): boolean {
	return raw["curve"] !== undefined || raw["curveKind"] !== undefined;
}

/**
 * Why a decoded connector's point chain is one the inspection will not follow.
 * @param record the connector
 * @returns the ineligibility, or null when the chain is followed
 */
function ineligibleChain(record: DecodedRecord): Ineligibility | null {
	const decoded = decodePath(record);
	if (!decoded.ok) {
		return null;
	}
	const eligibility = persistedConnectorPointChainEligibility(record, decoded);
	return eligibility.eligible ? null : eligibility;
}

/**
 * The findings for segments of zero length, which name a point on the path but no direction.
 * @param record the connector
 * @param zeroSegments the indexes of the zero-length segments
 * @param scenePoints the decoded path, when it has one
 * @returns the findings
 */
function zeroLengthFindings(
	record: DecodedRecord,
	zeroSegments: readonly number[],
	scenePoints: readonly ExactPoint[] | null,
): InspectionFinding[] {
	return zeroSegments.map((segmentIndex) => {
		const point = scenePoints?.[segmentIndex];
		return make({
			code: "AMBIGUOUS_GEOMETRY",
			reason: "zero-length",
			severity: "warning",
			affectsCoverage: true,
			details: { connectorId: record.id, sourceIndex: record.sourceIndex, segmentIndex },
			message: `Connector ${record.id ?? record.sourceIndex} has a zero-length segment.`,
			elements: [record.ref],
			points: point === undefined ? [] : [point],
			affected: point === undefined ? null : pointBox([point]),
		});
	});
}

/**
 * Add this connector's drawable segments to the run's collection, counting every segment it
 * looked at against the run's budget. Zero-length segments name no direction and are skipped.
 * @param connectorId the connector's identity
 * @param sourceIndex where the connector sat in the input
 * @param scenePoints the decoded path
 * @param zeroSegments the indexes of the zero-length segments
 * @param segments the run's segments, added to in place
 * @param work the run's counters, advanced in place
 */
function collectSegments(
	connectorId: string,
	sourceIndex: number,
	scenePoints: readonly ExactPoint[],
	zeroSegments: readonly number[],
	segments: Segment[],
	work: SegmentWork,
): void {
	const skip = new Set(zeroSegments);
	for (let index = 0; index < scenePoints.length - 1; index += 1) {
		work.pathSegmentChecks += 1;
		const a = scenePoints[index];
		const b = scenePoints[index + 1];
		if (skip.has(index) || a === undefined || b === undefined) {
			continue;
		}
		segments.push({ connectorId, sourceIndex, index, a, b });
	}
}

/**
 * A connector's stored width and height, when both read as finite numbers.
 * @param raw the connector's raw fields
 * @returns the stored size, or null when it does not read
 */
function storedSize(raw: RawRecord): { width: number; height: number } | null {
	const width = raw["width"];
	const height = raw["height"];
	if (typeof width !== "number" || !Number.isFinite(width)) {
		return null;
	}
	return typeof height === "number" && Number.isFinite(height) ? { width, height } : null;
}

/**
 * The finding for stored dimensions that no longer match the path they describe, which is what
 * makes a connector render at a size its own points disagree with.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param policy the run's policy, which sets how far apart the two may drift
 * @param scenePoints the decoded path
 * @returns the finding, or null when the stored dimensions still hold
 */
function staleDimensionFinding(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
	scenePoints: readonly ExactPoint[],
): InspectionFinding | null {
	const measured = measureLinear(raw["points"]);
	const stored = storedSize(raw);
	if (!measured || stored === null) {
		return null;
	}
	const widthDelta = Math.abs(stored.width - measured.width);
	const heightDelta = Math.abs(stored.height - measured.height);
	const reason = staleReason(widthDelta, heightDelta, policy.dimensionTolerance);
	if (reason === null) {
		return null;
	}
	return make({
		code: "STALE_LINEAR_DIMENSIONS",
		reason,
		severity: "error",
		affectsCoverage: false,
		details: {
			storedWidth: stored.width,
			storedHeight: stored.height,
			measuredWidth: measured.width,
			measuredHeight: measured.height,
			widthDelta,
			heightDelta,
		},
		message: `Connector ${record.id ?? record.sourceIndex} has stale stored dimensions.`,
		elements: [record.ref],
		points: scenePoints,
		affected: pointBox(scenePoints),
	});
}

/**
 * Which stored dimension no longer describes the path, if either does not.
 * @param widthDelta how far the stored width is from the measured one
 * @param heightDelta how far the stored height is from the measured one
 * @param tolerance how far apart the run's policy lets them drift
 * @returns the reason, or null when both dimensions still hold
 */
function staleReason(
	widthDelta: number,
	heightDelta: number,
	tolerance: number,
): "width" | "height" | "width-and-height" | null {
	const staleWidth = widthDelta >= tolerance;
	const staleHeight = heightDelta >= tolerance;
	if (staleWidth && staleHeight) {
		return "width-and-height";
	}
	if (staleWidth) {
		return "width";
	}
	return staleHeight ? "height" : null;
}

/**
 * Whether a connector's path can be measured against the rest of the board: it must have a
 * usable identity, a decoded path, and no geometry the inspection declined to model.
 * @param record the connector
 * @param unsupported how many unsupported-geometry findings it already has
 * @param scenePoints the decoded path, when it has one
 * @returns true when the path is worth measuring
 */
function measurable(
	record: DecodedRecord,
	unsupported: number,
	scenePoints: readonly ExactPoint[] | null,
): boolean {
	if (unsupported > 0 || scenePoints === null) {
		return false;
	}
	return record.usableId && record.id !== null;
}

/**
 * Everything a connector's own geometry says: the geometry the inspection will not model, the
 * path that cannot be used at all, its zero-length segments, and stored dimensions its points
 * no longer agree with. A connector whose geometry is described but not modelled contributes
 * no segments to the run.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param policy the run's policy
 * @param segments the run's segments, added to in place
 * @param work the run's counters, advanced in place
 * @returns the geometry findings
 */
function connectorGeometryFindings(
	record: DecodedRecord,
	raw: RawRecord,
	policy: InspectionPolicy,
	segments: Segment[],
	work: SegmentWork,
): InspectionFinding[] {
	const decoded = decodePath(record);
	const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
	const unsupported = unsupportedGeometryFindings(record, raw, evidence);
	if (!decoded.ok) {
		return [...unsupported, unusablePathFinding(record, raw)];
	}
	const findings = [
		...unsupported,
		...zeroLengthFindings(record, decoded.zeroSegments, decoded.scenePoints),
	];
	if (!measurable(record, unsupported.length, decoded.scenePoints) || !decoded.scenePoints) {
		return findings;
	}
	collectSegments(
		record.id ?? "",
		record.sourceIndex,
		decoded.scenePoints,
		decoded.zeroSegments,
		segments,
		work,
	);
	const stale = staleDimensionFinding(record, raw, policy, decoded.scenePoints);
	return stale === null ? findings : [...findings, stale];
}

export {
	type RawRecord,
	type RecordMap,
	connectorBindingFindings,
	connectorGeometryFindings,
	persistedEndpointFindings,
	storedExtent,
};
