import {
	ELBOW_POINT_COMPONENT_LIMIT,
	recordOrigin,
	type DecodedRecord,
} from "@/runtime/board-inspection/lib/decode";
import { finite, type ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import type { SnapshotRecord } from "@/runtime/board-inspection/lib/input-snapshot";

const MAX_ANALYZABLE_SEGMENT_COMPONENT = Math.sqrt(Number.MAX_VALUE) / 2;

type PathDecode =
	| {
			ok: true;
			relativePoints: ExactPoint[];
			scenePoints: ExactPoint[] | null;
			zeroSegments: number[];
	  }
	| {
			ok: false;
			issue: "missing" | "non-array" | "empty";
			relativePoints?: ExactPoint[];
			scenePoints?: ExactPoint[] | null;
	  }
	| {
			ok: false;
			issue: "one-point";
			relativePoints: ExactPoint[];
			scenePoints: ExactPoint[] | null;
	  }
	| {
			ok: false;
			issue: "malformed-point";
			pointIndex: number;
			relativePoints: ExactPoint[];
			scenePoints: ExactPoint[] | null;
	  }
	| {
			ok: false;
			issue: "absolute-point-overflow";
			pointIndex: number;
			relativePoints: ExactPoint[];
			scenePoints: ExactPoint[];
	  };

type PersistedConnectorPointChainEligibility =
	| { readonly eligible: true }
	| {
			readonly eligible: false;
			readonly issue: "elbow-coordinate-limit";
			readonly pointIndex: number;
			readonly axis: "x" | "y";
			readonly coordinate: number;
			readonly limit: typeof ELBOW_POINT_COMPONENT_LIMIT;
	  }
	| { readonly eligible: false; readonly issue: "malformed-elbowed" }
	| { readonly eligible: false; readonly issue: "fixed-segments-without-elbow" };

/**
 * Read one persisted point as two finite numbers.
 * @param candidate the raw point entry
 * @returns the point, or null when it is not a two-number array
 */
function decodeRelativePoint(candidate: unknown): ExactPoint | null {
	if (!Array.isArray(candidate)) {
		return null;
	}
	const x: unknown = candidate[0];
	const y: unknown = candidate[1];
	return finite(x) && finite(y) ? { x, y } : null;
}

/**
 * Whether a scene point, and the segment reaching it, stay inside analyzable range.
 * @param absolute the scene point
 * @param previous the previous scene point, if any
 * @returns true when both coordinates are finite and the segment components are bounded
 */
function representableScenePoint(absolute: ExactPoint, previous: ExactPoint | undefined): boolean {
	if (!finite(absolute.x) || !finite(absolute.y)) {
		return false;
	}
	return (
		!previous ||
		(Math.abs(absolute.x - previous.x) <= MAX_ANALYZABLE_SEGMENT_COMPONENT &&
			Math.abs(absolute.y - previous.y) <= MAX_ANALYZABLE_SEGMENT_COMPONENT)
	);
}

/**
 * Indexes of segments whose two endpoints coincide.
 * @param relativePoints the decoded relative points
 * @returns zero-length segment indexes in path order
 */
function zeroLengthSegments(relativePoints: readonly ExactPoint[]): number[] {
	const zeroSegments: number[] = [];
	for (let index = 0; index < relativePoints.length - 1; index += 1) {
		const a = relativePoints[index]!;
		const b = relativePoints[index + 1]!;
		if (a.x === b.x && a.y === b.y) {
			zeroSegments.push(index);
		}
	}
	return zeroSegments;
}

/**
 * Decode a persisted point array into relative and scene coordinates.
 * @param points the raw nonempty points array
 * @param origin the record's finite origin, or null when it cannot be located
 * @returns the decoded path or the first point that made it unusable
 */
function decodePoints(points: readonly unknown[], origin: ExactPoint | null): PathDecode {
	const relativePoints: ExactPoint[] = [];
	const scenePoints: ExactPoint[] | null = origin ? [] : null;
	for (let index = 0; index < points.length; index += 1) {
		const issue = decodePointAt(points[index], origin, relativePoints, scenePoints);
		if (issue !== null) {
			return pathFailure(issue, index, relativePoints, scenePoints);
		}
	}
	if (relativePoints.length === 1) {
		return { ok: false, issue: "one-point", relativePoints, scenePoints };
	}
	return {
		ok: true,
		relativePoints,
		scenePoints,
		zeroSegments: zeroLengthSegments(relativePoints),
	};
}

/**
 * Append one scene point to a connector's path, refusing a point whose absolute coordinates
 * or step from the previous point cannot be represented exactly.
 * @param scenePoints the scene points so far, appended to in place
 * @param origin the connector's finite origin
 * @param relative the decoded relative point
 * @returns false when the absolute point is not representable
 */
function appendScenePoint(
	scenePoints: ExactPoint[],
	origin: ExactPoint,
	relative: ExactPoint,
): boolean {
	const absolute = { x: origin.x + relative.x, y: origin.y + relative.y };
	if (!representableScenePoint(absolute, scenePoints.at(-1))) {
		return false;
	}
	scenePoints.push(absolute);
	return true;
}

/**
 * The failed decode for a point. It carries a scene path only when one was being built: an
 * absolute overflow can only be reported where scene points exist.
 * @param issue what made the point unusable
 * @param pointIndex the point's position in the chain
 * @param relativePoints the relative points decoded so far
 * @param scenePoints the scene points decoded so far, when there is an origin
 * @returns the failed path decode
 */
function pathFailure(
	issue: "malformed-point" | "absolute-point-overflow",
	pointIndex: number,
	relativePoints: ExactPoint[],
	scenePoints: ExactPoint[] | null,
): PathDecode {
	if (issue === "absolute-point-overflow" && scenePoints !== null) {
		return { ok: false, issue, pointIndex, relativePoints, scenePoints };
	}
	return { ok: false, issue: "malformed-point", pointIndex, relativePoints, scenePoints };
}

/**
 * Decode one point of a connector's chain into the relative and scene paths being built.
 * @param value the raw point
 * @param origin the connector's finite origin, or null when it cannot be located
 * @param relativePoints the relative points so far, appended to in place
 * @param scenePoints the scene points so far, appended to in place when there is an origin
 * @returns the issue that makes the chain unusable, or null when the point was decoded
 */
function decodePointAt(
	value: unknown,
	origin: ExactPoint | null,
	relativePoints: ExactPoint[],
	scenePoints: ExactPoint[] | null,
): "malformed-point" | "absolute-point-overflow" | null {
	const relative = decodeRelativePoint(value);
	if (!relative) {
		return "malformed-point";
	}
	relativePoints.push(relative);
	if (origin === null || scenePoints === null) {
		return null;
	}
	return appendScenePoint(scenePoints, origin, relative) ? null : "absolute-point-overflow";
}

/**
 * Decode a connector's persisted point chain.
 * @param record the decoded connector record
 * @returns the usable path, or why the points cannot be analyzed
 */
function decodePath(record: DecodedRecord): PathDecode {
	const raw = record.raw;
	if (!raw || !("points" in raw) || raw.points === undefined) {
		return { ok: false, issue: "missing" };
	}
	if (!Array.isArray(raw.points)) {
		return { ok: false, issue: "non-array" };
	}
	if (raw.points.length === 0) {
		return { ok: false, issue: "empty" };
	}
	return decodePoints(raw.points, recordOrigin(raw));
}

/**
 * Find the first elbow point coordinate outside the ±1,000,000 analyzable range.
 * @param relativePoints the decoded relative points
 * @returns the ineligibility naming that coordinate, or null when all fit
 */
function elbowCoordinateLimit(
	relativePoints: readonly ExactPoint[],
): Extract<PersistedConnectorPointChainEligibility, { issue: "elbow-coordinate-limit" }> | null {
	for (const [pointIndex, candidate] of relativePoints.entries()) {
		for (const axis of ["x", "y"] as const) {
			const coordinate = candidate[axis];
			if (Math.abs(coordinate) > ELBOW_POINT_COMPONENT_LIMIT) {
				return {
					eligible: false,
					issue: "elbow-coordinate-limit",
					pointIndex,
					axis,
					coordinate,
					limit: ELBOW_POINT_COMPONENT_LIMIT,
				};
			}
		}
	}
	return null;
}

/**
 * Whether a record is an arrow the board persisted as elbowed, which is the only shape whose
 * points are read as an elbow chain.
 * @param record the decoded connector record
 * @param raw its snapshot record
 * @returns true for an elbowed arrow
 */
function isElbowedArrow(record: DecodedRecord, raw: SnapshotRecord): boolean {
	return record.type === "arrow" && raw.elbowed === true;
}

/**
 * Whether an elbowed flag reads as the boolean the contract allows, absent included.
 * @param elbowed the raw elbowed field
 * @returns true when the flag can be read
 */
function isReadableElbowedFlag(elbowed: unknown): boolean {
	return elbowed === undefined || elbowed === null || typeof elbowed === "boolean";
}

/**
 * Whether a record carries fixed segments without being the elbowed arrow that gives them
 * meaning, which makes its chain unanalysable.
 * @param record the decoded connector record
 * @param raw its snapshot record
 * @returns true when fixed segments appear where they cannot apply
 */
function hasFixedSegmentsWithoutElbow(record: DecodedRecord, raw: SnapshotRecord): boolean {
	return raw.fixedSegments != null && !isElbowedArrow(record, raw);
}

/**
 * Whether a connector's persisted point chain may enter geometric analysis.
 * @param record the decoded connector record
 * @param decoded its usable path
 * @returns eligibility, or the elbow or fixed-segment metadata that blocks it
 */
function persistedConnectorPointChainEligibility(
	record: DecodedRecord,
	decoded: Extract<PathDecode, { ok: true }>,
): PersistedConnectorPointChainEligibility {
	const raw = record.raw;
	if (!raw) {
		return { eligible: false, issue: "malformed-elbowed" };
	}
	const limited = isElbowedArrow(record, raw) ? elbowCoordinateLimit(decoded.relativePoints) : null;
	if (limited) {
		return limited;
	}
	if (!isReadableElbowedFlag(raw.elbowed)) {
		return { eligible: false, issue: "malformed-elbowed" };
	}
	if (hasFixedSegmentsWithoutElbow(record, raw)) {
		return { eligible: false, issue: "fixed-segments-without-elbow" };
	}
	return { eligible: true };
}

export {
	type PathDecode,
	type PersistedConnectorPointChainEligibility,
	decodePath,
	persistedConnectorPointChainEligibility,
};
