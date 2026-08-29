import {
	DEFAULT_FILL_STYLE,
	DEFAULT_SHAPE_BACKGROUND,
	FILLABLE_TYPES,
} from "../../../shared/appearance/appearance.js";
import { mintId } from "../../../shared/ids/ids.js";
import type { LegacyElementIngress } from "../../../shared/board-elements/index.js";
import { bindingFromRef } from "../arrow-binding.js";
import { DEFAULT_LINEAR_POINTS } from "../geometry.js";
import { EXCALIDRAW_ELEMENT_TYPES, normalizeFontFamily } from "../types.js";
import { stripUntrustedTrackingClaims } from "../metadata.js";
import { CreateElementSchema } from "./element-input-schema.js";
import type { AgentElementInput } from "./element-input-schema.js";

const hasOwn = (value: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

function normalizePoints(points: unknown): unknown {
	if (!Array.isArray(points)) return points;
	const normalized: [number, number][] = [];
	for (const point of points) {
		const record =
			point && typeof point === "object" && !Array.isArray(point)
				? (point as Record<string, unknown>)
				: null;
		const x = Array.isArray(point) ? point[0] : record?.x;
		const y = Array.isArray(point) ? point[1] : record?.y;
		if (typeof x !== "number" || !Number.isFinite(x)) return points;
		if (typeof y !== "number" || !Number.isFinite(y)) return points;
		normalized.push([x, y]);
	}
	return normalized;
}

/** Spend public aliases before the native completion boundary. */
export function wellFormAgentStatement(
	raw: Record<string, unknown>,
	existingType?: string,
): Record<string, unknown> {
	const statement = stripUntrustedTrackingClaims(raw);
	if (hasOwn(statement, "points")) statement.points = normalizePoints(statement.points);
	for (const [alias, ref] of [
		["startElementId", "start"],
		["endElementId", "end"],
	] as const) {
		if (hasOwn(statement, alias)) {
			const id = statement[alias];
			statement[ref] = typeof id === "string" && id ? { id } : null;
		}
		delete statement[alias];
	}
	const type = typeof statement.type === "string" ? statement.type : existingType;
	if (type !== EXCALIDRAW_ELEMENT_TYPES.TEXT) {
		const label = statement.label;
		const labelText =
			label && typeof label === "object" && !Array.isArray(label)
				? (label as Record<string, unknown>).text
				: undefined;
		const text = statement.text;
		delete statement.label;
		delete statement.text;
		if (typeof labelText === "string") statement.labelText = labelText;
		else if (typeof text === "string") statement.labelText = text;
	}
	for (const key of ["startBinding", "endBinding"] as const) {
		if (!hasOwn(statement, key)) continue;
		const value = statement[key];
		if (value === null || !value || typeof value !== "object" || Array.isArray(value)) continue;
		const record = value as Record<string, unknown>;
		statement[key] = {
			elementId: record.elementId,
			focus: record.focus,
			gap: record.gap,
			...(hasOwn(record, "fixedPoint") ? { fixedPoint: record.fixedPoint } : {}),
		};
	}
	return statement;
}

export function spendArrowRefs(
	element: Record<string, unknown>,
	stated: Record<string, unknown>,
): void {
	if (element.type !== "arrow" && element.type !== "line") return;
	for (const [ref, binding] of [
		["start", "startBinding"],
		["end", "endBinding"],
	] as const) {
		const said = hasOwn(stated, ref);
		const value = stated[ref];
		delete element[ref];
		delete stated[ref];
		if (said) {
			const normalized = bindingFromRef(value);
			element[binding] = normalized;
			stated[binding] = normalized;
		}
	}
}

export function buildAgentElement(
	raw: AgentElementInput,
	inUse: { has(id: string): boolean },
): LegacyElementIngress {
	const statement = wellFormAgentStatement(raw);
	const params = CreateElementSchema.parse(statement);
	const { board: _boardField, ...elementParams } = params as typeof params & { board?: string };
	const now = new Date().toISOString();
	const element = {
		id: params.id || mintId(inUse),
		...elementParams,
		fontFamily: normalizeFontFamily(params.fontFamily),
		createdAt: now,
		updatedAt: now,
		version: 1,
	} as LegacyElementIngress;
	if (
		(element.type === "arrow" || element.type === "line") &&
		((element as unknown as Record<string, unknown>).start !== undefined ||
			(element as unknown as Record<string, unknown>).end !== undefined) &&
		!Array.isArray(element.points)
	) {
		(element as unknown as Record<string, unknown>).points = DEFAULT_LINEAR_POINTS.map((point) =>
			point.slice(),
		);
	}
	if (FILLABLE_TYPES.has(element.type) && element.backgroundColor === undefined) {
		element.backgroundColor = DEFAULT_SHAPE_BACKGROUND;
		(element as unknown as Record<string, unknown>).fillStyle ??= DEFAULT_FILL_STYLE;
	}
	spendArrowRefs(
		element as unknown as Record<string, unknown>,
		elementParams as Record<string, unknown>,
	);
	return element;
}
