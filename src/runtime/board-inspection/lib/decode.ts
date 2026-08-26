import type { ElementRef } from "../schemas.js";
import { finite, type ExactBox, type ExactPoint, type Segment } from "./geometry.js";

export interface DecodedRecord {
	readonly raw: Readonly<Record<string, unknown>> | null;
	readonly sourceIndex: number;
	readonly live: boolean;
	readonly id: string | null;
	readonly type: string | null;
	readonly ref: ElementRef;
	readonly box: ExactBox | null;
}

export const kindOf = (value: unknown): string => {
	if (value === undefined) return "undefined";
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
};

export function stableDescription(value: unknown): string {
	const kind = kindOf(value);
	if (kind === "string") return JSON.stringify(String(value).slice(0, 80));
	if (kind === "number" || kind === "boolean" || kind === "bigint") return String(value).slice(0, 80);
	return kind;
}

export function decodeRecords(records: readonly unknown[]): DecodedRecord[] {
	return records.map((value, sourceIndex) => {
		const raw = value && typeof value === "object" && !Array.isArray(value)
			? (value as Readonly<Record<string, unknown>>) : null;
		const rawId = raw?.id;
		const id = typeof rawId === "string" && rawId.length > 0 ? rawId : null;
		const type = typeof raw?.type === "string" ? raw.type : null;
		const x = raw && finite(raw.x) ? raw.x : undefined;
		const y = raw && finite(raw.y) ? raw.y : undefined;
		const width = raw && finite(raw.width) ? raw.width : undefined;
		const height = raw && finite(raw.height) ? raw.height : undefined;
		return {
			raw, sourceIndex, live: raw?.isDeleted !== true, id, type,
			ref: { id, type, sourceIndex },
			box: x !== undefined && y !== undefined && width !== undefined && height !== undefined
				? { x, y, width: Math.max(0, width), height: Math.max(0, height) } : null,
		};
	});
}

export type PathDecode =
	| { ok: true; points: ExactPoint[]; segments: Segment[]; zeroSegments: number[] }
	| { ok: false; issue: "missing" | "non-array" | "empty" | "one-point"; points?: ExactPoint[] }
	| { ok: false; issue: "malformed-point"; pointIndex: number; points: ExactPoint[] };

export function decodePath(record: DecodedRecord): PathDecode {
	const raw = record.raw;
	if (!raw || !("points" in raw) || raw.points === undefined) return { ok: false, issue: "missing" };
	if (!Array.isArray(raw.points)) return { ok: false, issue: "non-array" };
	if (raw.points.length === 0) return { ok: false, issue: "empty" };
	const originX = finite(raw.x) ? raw.x : 0;
	const originY = finite(raw.y) ? raw.y : 0;
	const points: ExactPoint[] = [];
	for (let index = 0; index < raw.points.length; index += 1) {
		const candidate = raw.points[index];
		const object = candidate && typeof candidate === "object" && !Array.isArray(candidate)
			? candidate as Record<string, unknown> : null;
		const x = Array.isArray(candidate) ? candidate[0] : object?.x;
		const y = Array.isArray(candidate) ? candidate[1] : object?.y;
		if (!finite(x) || !finite(y)) return { ok: false, issue: "malformed-point", pointIndex: index, points };
		points.push({ x: originX + x, y: originY + y });
	}
	if (points.length === 1) return { ok: false, issue: "one-point", points };
	const connectorId = record.id ?? "";
	const zeroSegments: number[] = [];
	const segments = points.slice(0, -1).map((a, index) => {
		const b = points[index + 1]!;
		if (a.x === b.x && a.y === b.y) zeroSegments.push(index);
		return { connectorId, sourceIndex: record.sourceIndex, index, a, b };
	});
	return { ok: true, points, segments, zeroSegments };
}
