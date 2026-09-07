import type { InspectionFinding } from "@/runtime/board-inspection/schemas";
import {
	decodePath,
	kindOf,
	stableDescription,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import { pointBox, type ExactBox, type ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import { make } from "@/runtime/board-inspection/lib/finding-builder";
import type { RawRecord } from "@/runtime/board-inspection/lib/connector-records";

/** How many raw points a connector needs before it describes a path at all. */
const MINIMUM_PATH_POINTS = 2;

/** Where a connector's findings can be pointed at, when its path does not decode. */
interface PathEvidence {
	points: readonly ExactPoint[];
	affected: ExactBox | null;
}

/**
 * Whether a record's own origin reads as two finite numbers, which is what makes it something
 * a reader can be pointed at even when its path does not decode.
 * @param raw the record's raw fields
 * @returns true when the origin is locatable
 */
const locatableOrigin = (raw: RawRecord): raw is RawRecord & { x: number; y: number } =>
	typeof raw["x"] === "number" &&
	Number.isFinite(raw["x"]) &&
	typeof raw["y"] === "number" &&
	Number.isFinite(raw["y"]);

/**
 * The extent a record can still stand for: its evidence box, or a zero-sized box at its origin.
 * @param record the decoded record
 * @param raw the record's raw fields
 * @returns the extent, or null when the record cannot be located at all
 */
const storedExtent = (record: DecodedRecord, raw: RawRecord): ExactBox | null =>
	record.evidenceBox ?? (locatableOrigin(raw) ? { x: raw.x, y: raw.y, width: 0, height: 0 } : null);

/**
 * What a finding about this connector can point at: the points its path decoded to, and the
 * box around them, falling back to the record's own stored extent.
 * @param record the decoded record
 * @param raw the record's raw fields
 * @param scenePoints the points the path decoded to, when it decoded to any
 * @returns the points and box a finding is drawn with
 */
function decodedPathEvidence(
	record: DecodedRecord,
	raw: RawRecord,
	scenePoints: readonly ExactPoint[] | null | undefined,
): PathEvidence {
	if (!pointable(raw, scenePoints)) {
		return { points: [], affected: null };
	}
	const points = scenePoints ?? [];
	const pathBox = points.length > 0 ? pointBox(points) : null;
	return { points, affected: pathBox ?? storedExtent(record, raw) };
}

/**
 * Whether there is anywhere to point at all: a path that failed to decode leaves nothing, and
 * a path that was never read leaves only the record's own origin.
 * @param raw the record's raw fields
 * @param scenePoints the points the path decoded to, when it decoded to any
 * @returns true when a finding can be pointed somewhere
 */
function pointable(raw: RawRecord, scenePoints: readonly ExactPoint[] | null | undefined): boolean {
	if (scenePoints === null) {
		return false;
	}
	return scenePoints !== undefined || locatableOrigin(raw);
}

/**
 * The finding for a connector whose points do not describe a path: absent, not a list, empty,
 * or a single point that no segment can be drawn from. Each way of falling short is reported
 * under its own reason, so a reader is told which one it was.
 * @param record the connector
 * @param raw the connector's raw fields
 * @param issue which way the points fall short
 * @param evidence what the finding can point at
 * @returns the finding
 */
function cardinalityFinding(
	record: DecodedRecord,
	raw: RawRecord,
	issue: "missing" | "non-array" | "empty" | "one-point",
	evidence: PathEvidence,
): InspectionFinding {
	const shared = {
		code: "AMBIGUOUS_GEOMETRY",
		severity: "warning",
		affectsCoverage: true,
		message: `Connector ${record.id ?? record.sourceIndex} has no usable path.`,
		elements: [record.ref],
		...evidence,
	} as const;
	const subject = { connectorId: record.id, sourceIndex: record.sourceIndex };
	switch (issue) {
		case "missing":
			return make({
				...shared,
				reason: "points-missing",
				details: {
					...subject,
					rawPointsKind: "missing",
					rawPointsDescription: "missing",
					pointCount: null,
					minimumRequired: MINIMUM_PATH_POINTS,
					issue: "missing",
				},
			});
		case "non-array":
			return make({
				...shared,
				reason: "points-not-array",
				details: {
					...subject,
					rawPointsKind: kindOf(raw["points"]),
					rawPointsDescription: stableDescription(raw["points"]),
					pointCount: null,
					minimumRequired: MINIMUM_PATH_POINTS,
					issue: "non-array",
				},
			});
		case "empty":
			return make({
				...shared,
				reason: "points-empty",
				details: {
					...subject,
					rawPointsKind: "array",
					rawPointsDescription: "array",
					pointCount: 0,
					minimumRequired: MINIMUM_PATH_POINTS,
					issue: "empty",
				},
			});
		default:
			return make({
				...shared,
				reason: "points-one-point",
				details: {
					...subject,
					rawPointsKind: "array",
					rawPointsDescription: "array",
					pointCount: 1,
					minimumRequired: MINIMUM_PATH_POINTS,
					issue: "insufficient-cardinality",
				},
			});
	}
}

/**
 * The finding for a path whose arithmetic left the finite inspection range, or whose points
 * are not pairs of finite numbers. Both name the point the decode stopped at.
 * @param record the connector
 * @param reason which of the two failures it was
 * @param pointIndex the point the decode stopped at
 * @param evidence what the finding can point at
 * @returns the finding
 */
function pointFailureFinding(
	record: DecodedRecord,
	reason: "absolute-point-overflow" | "malformed-point",
	pointIndex: number,
	evidence: PathEvidence,
): InspectionFinding {
	const overflow = reason === "absolute-point-overflow";
	return make({
		code: "AMBIGUOUS_GEOMETRY",
		reason,
		severity: "warning",
		affectsCoverage: true,
		details: {
			connectorId: record.id,
			sourceIndex: record.sourceIndex,
			pointIndex,
			issue: overflow
				? "absolute path coordinate or segment arithmetic exceeded finite inspection range"
				: "point must contain two finite numbers",
		},
		message: overflow
			? `Connector ${record.id ?? record.sourceIndex} overflows absolute path coordinates.`
			: `Connector ${record.id ?? record.sourceIndex} has a malformed point.`,
		elements: [record.ref],
		...evidence,
	});
}

/**
 * The one finding that says why a connector has no path the inspection can work with.
 * @param record the connector
 * @param raw the connector's raw fields
 * @returns the finding
 */
function unusablePathFinding(record: DecodedRecord, raw: RawRecord): InspectionFinding {
	const decoded = decodePath(record);
	if (decoded.ok) {
		throw new Error("usable connector path passed to unusablePathFinding");
	}
	const evidence = decodedPathEvidence(record, raw, decoded.scenePoints);
	if (decoded.issue === "absolute-point-overflow" || decoded.issue === "malformed-point") {
		return pointFailureFinding(record, decoded.issue, decoded.pointIndex, evidence);
	}
	return cardinalityFinding(record, raw, decoded.issue, evidence);
}

export {
	type PathEvidence,
	decodedPathEvidence,
	locatableOrigin,
	storedExtent,
	unusablePathFinding,
};
