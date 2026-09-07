import type { ElementRef } from "@/runtime/board-inspection/schemas";
import { collectInvalidRenderGeometry } from "@/runtime/engine/geometry";
import { finite, type ExactBox, type ExactPoint } from "@/runtime/board-inspection/lib/geometry";
import type { SnapshotRecord } from "@/runtime/board-inspection/lib/input-snapshot";

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
 * A record's finite origin, when both coordinates read as finite numbers.
 * @param raw the snapshot record
 * @returns the origin, or null when the record cannot be located
 */
function recordOrigin(raw: SnapshotRecord | null): ExactPoint | null {
	const x = finiteField(raw, "x");
	const y = finiteField(raw, "y");
	return x !== undefined && y !== undefined ? { x, y } : null;
}

/**
 * A record's identity, when it carries one that could name an element.
 * @param raw the snapshot record
 * @returns the id, or null when the record names none
 */
function recordIdentity(raw: SnapshotRecord | null): string | null {
	const rawId = raw?.id;
	return typeof rawId === "string" && rawId.length > 0 ? rawId : null;
}

/**
 * Whether an identity is claimed by exactly one live record, which is what makes it usable.
 * @param id the record's identity, if any
 * @param idCounts live id occurrence counts across the board
 * @returns true when the identity is unique
 */
function isUniqueIdentity(id: string | null, idCounts: ReadonlyMap<string, number>): boolean {
	return id !== null && idCounts.get(id) === 1;
}

/** A record's normalised extent, with negative dimensions read as zero. */
interface RecordSize {
	readonly width: number;
	readonly height: number;
}

/**
 * A record's normalised size, when the render fields were valid and both dimensions read as
 * finite numbers. A negative dimension is read as zero, as the renderer does.
 * @param raw the snapshot record
 * @param renderValid whether every render field is present and finite
 * @returns the size, or null when the record has no usable extent
 */
function recordSize(raw: SnapshotRecord | null, renderValid: boolean): RecordSize | null {
	if (!renderValid) {
		return null;
	}
	const width = finiteField(raw, "width");
	const height = finiteField(raw, "height");
	if (width === undefined || height === undefined) {
		return null;
	}
	return { width: Math.max(0, width), height: Math.max(0, height) };
}

/**
 * The box a record spans, when its far edges are still finite.
 * @param origin the record's finite origin
 * @param size the record's normalised size
 * @returns the box, or null when an edge overflows
 */
function boxIfFinite(origin: ExactPoint, size: RecordSize): RecordExtent["box"] {
	if (!finite(origin.x + size.width) || !finite(origin.y + size.height)) {
		return null;
	}
	return { ...origin, width: size.width, height: size.height };
}

/**
 * The extent of a record that has a place but no representable span: the origin is still
 * evidence of where it is, which is what a finding points at.
 * @param origin the record's origin, when it has one
 * @returns the extent
 */
function originOnlyExtent(origin: ExactPoint | null): RecordExtent {
	return {
		box: null,
		evidenceBox: origin === null ? null : { ...origin, width: 0, height: 0 },
		extentRepresentable: false,
	};
}

/**
 * A record's element type, when it names one.
 * @param raw the snapshot record
 * @returns the type name, or null
 */
function recordTypeName(raw: SnapshotRecord | null): string | null {
	return typeof raw?.type === "string" ? raw.type : null;
}

/**
 * Whether a record is live, which every record is unless it says it was deleted.
 * @param raw the snapshot record
 * @returns true when the record is live
 */
function isLive(raw: SnapshotRecord | null): boolean {
	return raw?.isDeleted !== true;
}

/** The render fields a record can fail on. */
type InvalidRenderFields = ReturnType<typeof collectInvalidRenderGeometry>[number]["fields"];

/**
 * The render fields of a record that did not read as finite numbers.
 * @param raw the snapshot record
 * @returns the invalid field names, empty when the geometry read cleanly
 */
function invalidRenderFieldsOf(raw: SnapshotRecord | null): InvalidRenderFields {
	return collectInvalidRenderGeometry([raw ?? {}])[0]?.fields ?? [];
}

/**
 * Derive a record's exact box and evidence box from its render fields.
 * @param raw the snapshot record
 * @param renderValid whether every render field is present and finite
 * @returns the box when its far edges are finite, the best evidence box otherwise
 */
function recordExtent(raw: SnapshotRecord | null, renderValid: boolean): RecordExtent {
	const origin = recordOrigin(raw);
	const size = recordSize(raw, renderValid);
	if (origin === null || size === null) {
		return originOnlyExtent(origin);
	}
	const box = boxIfFinite(origin, size);
	if (box === null) {
		return originOnlyExtent(origin);
	}
	return { box, evidenceBox: box, extentRepresentable: true };
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
	const id = recordIdentity(raw);
	const invalidRenderFields = invalidRenderFieldsOf(raw);
	const extent = recordExtent(raw, invalidRenderFields.length === 0);
	return {
		raw,
		sourceIndex,
		live: isLive(raw),
		id,
		usableId: isUniqueIdentity(id, idCounts),
		type: recordTypeName(raw),
		ref: { id, type: recordTypeName(raw), sourceIndex },
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
export {
	ELBOW_POINT_COMPONENT_LIMIT,
	type DecodedRecord,
	type ValueKind,
	kindOf,
	recordOrigin,
	stableDescription,
	decodeRecords,
};

export {
	type PathDecode,
	type PersistedConnectorPointChainEligibility,
	decodePath,
	persistedConnectorPointChainEligibility,
} from "@/runtime/board-inspection/lib/connector-path";
