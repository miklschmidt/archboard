import type { ElementRef } from "../schemas.js";
import { collectInvalidRenderGeometry } from "../../engine/geometry.js";
import { finite, type ExactBox, type ExactPoint } from "./geometry.js";
import type { SnapshotRecord } from "./input-snapshot.js";

const MAX_ANALYZABLE_SEGMENT_COMPONENT = Math.sqrt(Number.MAX_VALUE) / 2;
export const ELBOW_POINT_COMPONENT_LIMIT = 1_000_000 as const;

export interface DecodedRecord {
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

export type ValueKind =
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

export const kindOf = (value: unknown): ValueKind => {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value as ValueKind;
};

export function stableDescription(value: unknown): string {
	const kind = kindOf(value);
	if (kind === "string") return JSON.stringify(String(value).slice(0, 80));
	if (kind === "number" || kind === "boolean" || kind === "bigint")
		return String(value).slice(0, 80);
	return kind;
}

export function decodeRecords(
	records: readonly (SnapshotRecord | null)[],
	blockedSourceIndexes: ReadonlySet<number> = new Set(),
): DecodedRecord[] {
	const idCounts = new Map<string, number>();
	for (const value of records) {
		const raw =
			value && typeof value === "object" && !Array.isArray(value)
				? (value as Readonly<Record<string, unknown>>)
				: null;
		if (raw?.isDeleted === true || typeof raw?.id !== "string" || raw.id.length === 0) continue;
		idCounts.set(raw.id, (idCounts.get(raw.id) ?? 0) + 1);
	}
	return records.map((value, sourceIndex) => {
		const raw = value;
		if (blockedSourceIndexes.has(sourceIndex))
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
		const rawId = raw?.id;
		const id = typeof rawId === "string" && rawId.length > 0 ? rawId : null;
		const type = typeof raw?.type === "string" ? raw.type : null;
		const invalidRenderFields = collectInvalidRenderGeometry([raw ?? {}])[0]?.fields ?? [];
		const x = raw && finite(raw.x) ? raw.x : undefined;
		const y = raw && finite(raw.y) ? raw.y : undefined;
		const width = raw && finite(raw.width) ? raw.width : undefined;
		const height = raw && finite(raw.height) ? raw.height : undefined;
		const normalizedWidth = width === undefined ? undefined : Math.max(0, width);
		const normalizedHeight = height === undefined ? undefined : Math.max(0, height);
		const perRecordValid =
			invalidRenderFields.length === 0 &&
			x !== undefined &&
			y !== undefined &&
			normalizedWidth !== undefined &&
			normalizedHeight !== undefined;
		const finiteExtent =
			perRecordValid && finite(x + normalizedWidth) && finite(y + normalizedHeight);
		const recordBox = finiteExtent
			? { x, y, width: normalizedWidth, height: normalizedHeight }
			: null;
		return {
			raw,
			sourceIndex,
			live: raw?.isDeleted !== true,
			id,
			usableId: !!id && idCounts.get(id) === 1,
			type,
			ref: { id, type, sourceIndex },
			box: recordBox,
			evidenceBox:
				recordBox ?? (x !== undefined && y !== undefined ? { x, y, width: 0, height: 0 } : null),
			invalidRenderFields,
			extentRepresentable: perRecordValid && finiteExtent,
		};
	});
}

export type PathDecode =
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

export type PersistedConnectorPointChainEligibility =
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

export function decodePath(record: DecodedRecord): PathDecode {
	const raw = record.raw;
	if (!raw || !("points" in raw) || raw.points === undefined)
		return { ok: false, issue: "missing" };
	if (!Array.isArray(raw.points)) return { ok: false, issue: "non-array" };
	if (raw.points.length === 0) return { ok: false, issue: "empty" };
	const origin = finite(raw.x) && finite(raw.y) ? { x: raw.x, y: raw.y } : null;
	const relativePoints: ExactPoint[] = [];
	const scenePoints: ExactPoint[] | null = origin ? [] : null;
	for (let index = 0; index < raw.points.length; index += 1) {
		const candidate = raw.points[index];
		const x = Array.isArray(candidate) ? candidate[0] : undefined;
		const y = Array.isArray(candidate) ? candidate[1] : undefined;
		if (!finite(x) || !finite(y))
			return {
				ok: false,
				issue: "malformed-point",
				pointIndex: index,
				relativePoints,
				scenePoints,
			};
		relativePoints.push({ x, y });
		if (origin && scenePoints) {
			const absolute = { x: origin.x + x, y: origin.y + y };
			if (!finite(absolute.x) || !finite(absolute.y))
				return {
					ok: false,
					issue: "absolute-point-overflow",
					pointIndex: index,
					relativePoints,
					scenePoints,
				};
			scenePoints.push(absolute);
			const previous = scenePoints.at(-2);
			if (
				previous &&
				(Math.abs(absolute.x - previous.x) > MAX_ANALYZABLE_SEGMENT_COMPONENT ||
					Math.abs(absolute.y - previous.y) > MAX_ANALYZABLE_SEGMENT_COMPONENT)
			)
				return {
					ok: false,
					issue: "absolute-point-overflow",
					pointIndex: index,
					relativePoints,
					scenePoints,
				};
		}
	}
	if (relativePoints.length === 1)
		return { ok: false, issue: "one-point", relativePoints, scenePoints };
	const zeroSegments: number[] = [];
	for (let index = 0; index < relativePoints.length - 1; index += 1) {
		const a = relativePoints[index]!;
		const b = relativePoints[index + 1]!;
		if (a.x === b.x && a.y === b.y) zeroSegments.push(index);
	}
	return { ok: true, relativePoints, scenePoints, zeroSegments };
}

export function persistedConnectorPointChainEligibility(
	record: DecodedRecord,
	decoded: Extract<PathDecode, { ok: true }>,
): PersistedConnectorPointChainEligibility {
	const raw = record.raw;
	if (!raw) return { eligible: false, issue: "malformed-elbowed" };
	if (record.type === "arrow" && Boolean(raw.elbowed))
		for (const [pointIndex, candidate] of decoded.relativePoints.entries())
			for (const [axis, coordinate] of [
				["x", candidate.x],
				["y", candidate.y],
			] as const)
				if (Math.abs(coordinate) > ELBOW_POINT_COMPONENT_LIMIT)
					return {
						eligible: false,
						issue: "elbow-coordinate-limit",
						pointIndex,
						axis,
						coordinate,
						limit: ELBOW_POINT_COMPONENT_LIMIT,
					};
	const elbowed = raw.elbowed;
	if (elbowed !== undefined && elbowed !== null && elbowed !== false && elbowed !== true)
		return { eligible: false, issue: "malformed-elbowed" };
	if (raw.fixedSegments != null && !(record.type === "arrow" && elbowed === true))
		return { eligible: false, issue: "fixed-segments-without-elbow" };
	return { eligible: true };
}
