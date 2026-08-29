import type {
	BoundElement,
	ElbowArrowElement,
	ElementBinding,
	PersistedArchboardEnvelope,
	PersistedBoardElement,
	RuntimeElementTracking,
} from "../../../shared/board-elements/index.js";

export class NativeElementValidationError extends Error {
	readonly status = 400;
}

export type PersistedArm<Kind extends PersistedBoardElement["type"]> = Extract<
	PersistedBoardElement,
	{ type: Kind }
>;
export type PersistedBase = Omit<PersistedArm<"rectangle">, "type">;
type FixedPointBinding = NonNullable<ElbowArrowElement["startBinding"]>;

export function fail(
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): never {
	throw new NativeElementValidationError(
		`${context}: invalid element${id ? ` ${id}` : ""}${type ? ` (${type})` : ""} at ${path}`,
	);
}

export function recordAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) fail(context, id, type, path);
	return value as Record<string, unknown>;
}

export function finite(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) fail(context, id, type, path);
	return value;
}

export function point(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): [number, number] {
	if (!Array.isArray(value) || value.length !== 2) fail(context, id, type, path);
	return [
		finite(value[0], context, id, type, `${path}[0]`),
		finite(value[1], context, id, type, `${path}[1]`),
	];
}

export function nullablePoint(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): [number, number] | null {
	return value === null ? null : point(value, context, id, type, path);
}

export function points(
	value: unknown,
	minimum: number,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): [number, number][] {
	if (!Array.isArray(value) || value.length < minimum) fail(context, id, type, path);
	return value.map((candidate, index) => point(candidate, context, id, type, `${path}[${index}]`));
}

function bindingRecord(
	value: unknown,
	allowed: ReadonlySet<string>,
	context: string,
	id: string,
	type: string,
	path: string,
): Record<string, unknown> | null {
	if (value === null) return null;
	const record = recordAt(value, context, id, type, path);
	for (const key of Object.keys(record))
		if (!allowed.has(key)) fail(context, id, type, `${path}.${key}`);
	if (typeof record.elementId !== "string" || !record.elementId)
		fail(context, id, type, `${path}.elementId`);
	return record;
}

export function pointBindingAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
	path: string,
): ElementBinding | null {
	const record = bindingRecord(
		value,
		new Set(["elementId", "focus", "gap"]),
		context,
		id,
		type,
		path,
	);
	if (!record) return null;
	return {
		elementId: record.elementId as string,
		focus: finite(record.focus, context, id, type, `${path}.focus`),
		gap: finite(record.gap, context, id, type, `${path}.gap`),
	} satisfies ElementBinding;
}

export function fixedPointBindingAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
	path: string,
): FixedPointBinding | null {
	const record = bindingRecord(
		value,
		new Set(["elementId", "fixedPoint", "focus", "gap"]),
		context,
		id,
		type,
		path,
	);
	if (!record) return null;
	return {
		elementId: record.elementId as string,
		focus: finite(record.focus, context, id, type, `${path}.focus`),
		gap: finite(record.gap, context, id, type, `${path}.gap`),
		fixedPoint: point(record.fixedPoint, context, id, type, `${path}.fixedPoint`),
	} satisfies FixedPointBinding;
}

export function stringAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): string {
	if (typeof value !== "string") fail(context, id, type, path);
	return value;
}

export function booleanAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): boolean {
	if (typeof value !== "boolean") fail(context, id, type, path);
	return value;
}

export function nullableBooleanAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
	path: string,
): boolean | null {
	return value === null ? null : booleanAt(value, context, id, type, path);
}

export function nullableStringAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): string | null {
	return value === null ? null : stringAt(value, context, id, type, path);
}

export function fillStyleAt(value: unknown, context: string, id: string, type: string) {
	switch (value) {
		case "hachure":
		case "cross-hatch":
		case "solid":
		case "zigzag":
			return value;
		default:
			fail(context, id, type, "element.fillStyle");
	}
}

export function strokeStyleAt(value: unknown, context: string, id: string, type: string) {
	switch (value) {
		case "solid":
		case "dashed":
		case "dotted":
			return value;
		default:
			fail(context, id, type, "element.strokeStyle");
	}
}

export function arrowheadAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
	path: string,
): PersistedArm<"arrow">["startArrowhead"] {
	if (value === null) return null;
	if (typeof value !== "string") fail(context, id, type, path);
	switch (value) {
		case "arrow":
		case "bar":
		case "dot":
		case "circle":
		case "circle_outline":
		case "triangle":
		case "triangle_outline":
		case "diamond":
		case "diamond_outline":
		case "crowfoot_one":
		case "crowfoot_many":
		case "crowfoot_one_or_many":
			return value;
		default:
			fail(context, id, type, path);
	}
}

export function roundnessAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedBase["roundness"] {
	if (value === null) return null;
	const record = recordAt(value, context, id, type, "element.roundness");
	const kind = record.type;
	if (kind !== 1 && kind !== 2 && kind !== 3) fail(context, id, type, "element.roundness.type");
	return {
		type: kind,
		...(record.value === undefined
			? {}
			: { value: finite(record.value, context, id, type, "element.roundness.value") }),
	};
}

export function boundElementsAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): BoundElement[] | null {
	if (value === null) return null;
	if (!Array.isArray(value)) fail(context, id, type, "element.boundElements");
	return value.map((raw, index) => {
		const path = `element.boundElements[${index}]`;
		const bound = recordAt(raw, context, id, type, path);
		if (typeof bound.id !== "string" || !bound.id) fail(context, id, type, `${path}.id`);
		if (bound.type !== "text" && bound.type !== "arrow") fail(context, id, type, `${path}.type`);
		return { id: bound.id, type: bound.type } satisfies BoundElement;
	});
}

const TRACKING_KEYS = [
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
] as const satisfies readonly (keyof RuntimeElementTracking)[];

export function customDataAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedBase["customData"] {
	if (value === undefined) return undefined;
	const record = recordAt(value, context, id, type, "element.customData");
	const custom: Record<string, unknown> & { archboard?: PersistedArchboardEnvelope } = {};
	for (const [key, entry] of Object.entries(record)) if (key !== "archboard") custom[key] = entry;
	if ("archboard" in record) {
		const rawEnvelope = recordAt(
			record.archboard,
			context,
			id,
			type,
			"element.customData.archboard",
		);
		const envelope: PersistedArchboardEnvelope = {};
		for (const [key, entry] of Object.entries(rawEnvelope)) {
			if (!TRACKING_KEYS.includes(key as (typeof TRACKING_KEYS)[number])) {
				envelope[key] = entry;
				continue;
			}
			if (typeof entry !== "string") fail(context, id, type, `element.customData.archboard.${key}`);
			Object.assign(envelope, { [key]: entry });
		}
		custom.archboard = envelope;
	}
	return custom;
}

export function persistedBase(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: string,
): PersistedBase {
	const x = finite(initial.x, context, id, type, "element.x");
	const y = finite(initial.y, context, id, type, "element.y");
	const width = finite(initial.width, context, id, type, "element.width");
	const height = finite(initial.height, context, id, type, "element.height");
	const angle = finite(initial.angle, context, id, type, "element.angle");
	return {
		id,
		x,
		y,
		strokeColor: stringAt(initial.strokeColor, context, id, type, "element.strokeColor"),
		backgroundColor: stringAt(
			initial.backgroundColor,
			context,
			id,
			type,
			"element.backgroundColor",
		),
		fillStyle: fillStyleAt(initial.fillStyle, context, id, type),
		strokeWidth: finite(initial.strokeWidth, context, id, type, "element.strokeWidth"),
		strokeStyle: strokeStyleAt(initial.strokeStyle, context, id, type),
		roundness: roundnessAt(initial.roundness, context, id, type),
		roughness: finite(initial.roughness, context, id, type, "element.roughness"),
		opacity: finite(initial.opacity, context, id, type, "element.opacity"),
		width,
		height,
		angle,
		seed: finite(initial.seed, context, id, type, "element.seed"),
		version: finite(initial.version, context, id, type, "element.version"),
		versionNonce: finite(initial.versionNonce, context, id, type, "element.versionNonce"),
		index:
			initial.index === null ? null : stringAt(initial.index, context, id, type, "element.index"),
		isDeleted: booleanAt(initial.isDeleted, context, id, type, "element.isDeleted"),
		groupIds: Array.isArray(initial.groupIds)
			? initial.groupIds.map((entry, at) =>
					stringAt(entry, context, id, type, `element.groupIds[${at}]`),
				)
			: fail(context, id, type, "element.groupIds"),
		frameId: nullableStringAt(initial.frameId, context, id, type, "element.frameId"),
		boundElements: boundElementsAt(initial.boundElements, context, id, type),
		updated: finite(initial.updated, context, id, type, "element.updated"),
		link: nullableStringAt(initial.link, context, id, type, "element.link"),
		locked: booleanAt(initial.locked, context, id, type, "element.locked"),
		...(initial.customData === undefined
			? {}
			: { customData: customDataAt(initial.customData, context, id, type) }),
	} satisfies PersistedBase;
}

export function runtimeTrackingAt(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: string,
): RuntimeElementTracking {
	const tracking: RuntimeElementTracking = {};
	for (const key of TRACKING_KEYS) {
		if (initial[key] === undefined) continue;
		tracking[key] = stringAt(initial[key], context, id, type, `element.${key}`);
	}
	return tracking;
}
