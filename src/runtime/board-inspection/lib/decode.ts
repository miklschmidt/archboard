import type { ElementRef } from "@/runtime/board-inspection/schemas";
import { collectInvalidRenderGeometry } from "@/runtime/engine/geometry";
import { finite, type ExactBox, type ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import type { SnapshotRecord } from "@/runtime/board-inspection/lib/input-snapshot";

const MAX_ANALYZABLE_SEGMENT_COMPONENT = Math.sqrt(Number.MAX_VALUE) / 2;
const ELBOW_POINT_COMPONENT_LIMIT = 1_000_000 as const;

interface DecodedRecord {
	readonly raw: SnapshotRecord | null;
	readonly sourceIndex: number;
	readonly live: boolean;
	readonly id: string | null;
	readonly usableId: boolean;
	readonly type: string | null;
	readonly ref: ElementRef;
	readonly box: ExactBox | null;
	readonly evidenceBox: ExactBox | null;
	readonly invalidRenderFields: Array<"x" | "y" | "width" | "height">;
	readonly extentRepresentable: boolean;
}

type ValueKind =
	| "undefined"
	| "null"
	| "array"
	| "string"
	| "number"
	| "boolean"
	| "bigint"
	| "symbol"
	| "function"
	| "object";

/**
 * Classify a value by the vocabulary findings report, distinguishing null and arrays from objects.
 * @param value any snapshot value
 * @returns the value's kind name
 */
const kindOf = (value: unknown): ValueKind => {
	if (value === undefined) {
		return "undefined";
	}
	if (value === null) {
		return "null";
	}
	if (Array.isArray(value)) {
		return "array";
	}
	return typeof value;
};

/**
 * Render a value for a finding without leaking unbounded caller text.
 * @param value any snapshot value
 * @returns a short, stable description: quoted text, a number, or the kind name
 */
function stableDescription(value: unknown): string {
	const kind = kindOf(value);
	if (kind === "string") {
		return JSON.stringify(String(value).slice(0, 80));
	}
	if (kind === "number" || kind === "boolean" || kind === "bigint") {
		return String(value).slice(0, 80);
	}
	return kind;
}

/**
 * The id of a live record when it is a nonempty string.
 * @param raw the snapshot record
 * @returns the id, or null when the record is deleted or has no usable id
 */
function liveIdOf(raw: SnapshotRecord | null): string | null {
	if (!raw || raw.isDeleted === true || typeof raw.id !== "string" || raw.id.length === 0) {
		return null;
	}
	return raw.id;
}

/**
 * Count how many live records carry each id so duplicates can be refused.
 * @param records the snapshot records
 * @returns live id occurrence counts
 */
function countLiveIds(records: readonly (SnapshotRecord | null)[]): Map<string, number> {
	const idCounts = new Map<string, number>();
	for (const value of records) {
		const id = liveIdOf(value);
		if (id !== null) {
			idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
		}
	}
	return idCounts;
}

/**
 * The inert decoded shape of a record the snapshot blocked from analysis.
 * @param sourceIndex the record's position in the input
 * @returns a dead, unlocatable record
 */
function blockedRecord(sourceIndex: number): DecodedRecord {
	return {
		raw: null,
		sourceIndex,
		live: false,
		id: null,
		usableId: false,
		type: null,
		ref: { id: null, type: null, sourceIndex },
		box: null,
		evidenceBox: null,
		invalidRenderFields: [],
		extentRepresentable: false,
	};
}

/**
 * A finite numeric field of a record, or undefined when absent or non-finite.
 * @param raw the snapshot record
 * @param field which render field to read
 * @returns the finite value or undefined
 */
function finiteField(
	raw: SnapshotRecord | null,
	field: "x" | "y" | "width" | "height",
): number | undefined {
	const value = raw?.[field];
	return finite(value) ? value : undefined;
}

interface RecordExtent {
	readonly box: ExactBox | null;
	readonly evidenceBox: ExactBox | null;
	readonly extentRepresentable: boolean;
}

/**
 * Derive a record's exact box and evidence box from its render fields.
 * @param raw the snapshot record
 * @param renderValid whether every render field is present and finite
 * @returns the box when its far edges are finite, the best evidence box otherwise
 */
function recordExtent(raw: SnapshotRecord | null, renderValid: boolean): RecordExtent {
	const x = finiteField(raw, "x");
	const y = finiteField(raw, "y");
	const width = finiteField(raw, "width");
	const height = finiteField(raw, "height");
	const origin = x !== undefined && y !== undefined ? { x, y } : null;
	if (!renderValid || !origin || width === undefined || height === undefined) {
		return {
			box: null,
			evidenceBox: origin ? { ...origin, width: 0, height: 0 } : null,
			extentRepresentable: false,
		};
	}
	const normalizedWidth = Math.max(0, width);
	const normalizedHeight = Math.max(0, height);
	const finiteExtent = finite(origin.x + normalizedWidth) && finite(origin.y + normalizedHeight);
	const box = finiteExtent
		? { ...origin, width: normalizedWidth, height: normalizedHeight }
		: null;
	return {
		box,
		evidenceBox: box ?? { ...origin, width: 0, height: 0 },
		extentRepresentable: finiteExtent,
	};
}

/**
 * Decode one admitted record.
 * @param raw the snapshot record, or null when the input slot held no record
 * @param sourceIndex the record's position in the input
 * @param idCounts live id occurrence counts across the board
 * @returns the decoded record
 */
function decodeRecord(
	raw: SnapshotRecord | null,
	sourceIndex: number,
	idCounts: ReadonlyMap<string, number>,
): DecodedRecord {
	const rawId = raw?.id;
	const id = typeof rawId === "string" && rawId.length > 0 ? rawId : null;
	const type = typeof raw?.type === "string" ? raw.type : null;
	const invalidRenderFields = collectInvalidRenderGeometry([raw ?? {}])[0]?.fields ?? [];
	const extent = recordExtent(raw, invalidRenderFields.length === 0);
	return {
		raw,
		sourceIndex,
		live: raw?.isDeleted !== true,
		id,
		usableId: id !== null && idCounts.get(id) === 1,
		type,
		ref: { id, type, sourceIndex },
		box: extent.box,
		evidenceBox: extent.evidenceBox,
		invalidRenderFields,
		extentRepresentable: extent.extentRepresentable,
	};
}

/**
 * Decode snapshot records into the identity and geometry facts detectors read.
 * @param records the snapshot records
 * @param blockedSourceIndexes records the snapshot refused to admit
 * @returns one decoded record per input slot, in input order
 */
function decodeRecords(
	records: readonly (SnapshotRecord | null)[],
	blockedSourceIndexes: ReadonlySet<number> = new Set(),
): DecodedRecord[] {
	const idCounts = countLiveIds(records);
	return records.map((value, sourceIndex) =>
		blockedSourceIndexes.has(sourceIndex)
			? blockedRecord(sourceIndex)
			: decodeRecord(value, sourceIndex, idCounts),
	);
}

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
		const relative = decodeRelativePoint(points[index]);
		if (!relative) {
			return { ok: false, issue: "malformed-point", pointIndex: index, relativePoints, scenePoints };
		}
		relativePoints.push(relative);
		if (!origin || !scenePoints) {
			continue;
		}
		const absolute = { x: origin.x + relative.x, y: origin.y + relative.y };
		if (!representableScenePoint(absolute, scenePoints.at(-1))) {
			return {
				ok: false,
				issue: "absolute-point-overflow",
				pointIndex: index,
				relativePoints,
				scenePoints,
			};
		}
		scenePoints.push(absolute);
	}
	if (relativePoints.length === 1) {
		return { ok: false, issue: "one-point", relativePoints, scenePoints };
	}
	return { ok: true, relativePoints, scenePoints, zeroSegments: zeroLengthSegments(relativePoints) };
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
	const origin = finite(raw.x) && finite(raw.y) ? { x: raw.x, y: raw.y } : null;
	return decodePoints(raw.points, origin);
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
	const elbowedArrow = record.type === "arrow" && Boolean(raw.elbowed);
	const limited = elbowedArrow ? elbowCoordinateLimit(decoded.relativePoints) : null;
	if (limited) {
		return limited;
	}
	const elbowed = raw.elbowed;
	if (elbowed !== undefined && elbowed !== null && typeof elbowed !== "boolean") {
		return { eligible: false, issue: "malformed-elbowed" };
	}
	if (raw.fixedSegments != null && !(record.type === "arrow" && elbowed === true)) {
		return { eligible: false, issue: "fixed-segments-without-elbow" };
	}
	return { eligible: true };
}

export {
	ELBOW_POINT_COMPONENT_LIMIT,
	type DecodedRecord,
	type ValueKind,
	kindOf,
	stableDescription,
	decodeRecords,
	type PathDecode,
	type PersistedConnectorPointChainEligibility,
	decodePath,
	persistedConnectorPointChainEligibility,
};
