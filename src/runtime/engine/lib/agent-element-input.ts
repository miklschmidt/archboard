import {
	DEFAULT_FILL_STYLE,
	DEFAULT_SHAPE_BACKGROUND,
	FILLABLE_TYPES,
} from "../../../shared/appearance/appearance.js";
import { mintId } from "../../../shared/ids/ids.js";
import type { LegacyElementIngress } from "../../../shared/board-elements/index.js";
import { bindingFromRef } from "../arrow-binding.js";
import { DEFAULT_LINEAR_POINTS, pointsOf } from "../geometry.js";
import { EXCALIDRAW_ELEMENT_TYPES, normalizeFontFamily } from "../types.js";
import { stripTrackingClaims } from "../metadata.js";
import { CreateElementSchema } from "./element-input-schema.js";

const hasOwn = (value: object, key: PropertyKey): boolean =>
	Object.prototype.hasOwnProperty.call(value, key);

function normalizePoints(points: unknown): unknown {
	if (!Array.isArray(points)) return points;
	const normalized = pointsOf(points);
	return normalized && normalized.length === points.length
		? normalized.map((point) => [point.x, point.y])
		: points;
}

/** Spend public aliases before the native completion boundary. */
export function wellFormAgentStatement(
	raw: Record<string, unknown>,
	existingType?: string,
): Record<string, unknown> {
	const statement = { ...raw };
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
	if (type !== EXCALIDRAW_ELEMENT_TYPES.TEXT && hasOwn(statement, "text")) {
		const text = statement.text;
		delete statement.text;
		if (typeof text === "string") statement.label = { text };
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
		const value = element[ref];
		delete element[ref];
		if (said) element[binding] = bindingFromRef(value);
	}
}

export function buildAgentElement(
	raw: Record<string, unknown>,
	inUse: { has(id: string): boolean },
): LegacyElementIngress {
	const statement = wellFormAgentStatement(raw);
	const params = CreateElementSchema.parse(statement);
	const { board: _boardField, ...elementParams } = params as typeof params & { board?: string };
	for (const key of ["createdAt", "updatedAt", "syncedAt", "source", "syncTimestamp"])
		delete (elementParams as Record<string, unknown>)[key];
	if ("customData" in elementParams)
		(elementParams as Record<string, unknown>).customData = stripTrackingClaims(
			(elementParams as Record<string, unknown>).customData,
		);
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
