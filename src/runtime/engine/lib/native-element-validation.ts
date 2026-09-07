// Checking one element against the shape a note may hold.
//
// The scalar readers each part is checked with are in
// `native-element-readers.ts`, and are re-exported here so a caller checking
// an element reaches for one place. Every reader takes the same four things
// beside its value: the context the caller is in, the element's id and type
// where they are known, and the path within the element.

import {
	NativeElementValidationError,
	booleanAt,
	fail,
	finite,
	nullableBooleanAt,
	nullablePoint,
	nullableStringAt,
	point,
	points,
	recordAt,
	stringAt,
} from "@/runtime/engine/lib/native-element-readers";
import type {
	BoundElement,
	ElbowArrowElement,
	ElementBinding,
	PersistedArchboardEnvelope,
	PersistedBoardElement,
	RuntimeElementTracking,
} from "@/shared/board-elements";

type PersistedArm<Kind extends PersistedBoardElement["type"]> = Extract<
	PersistedBoardElement,
	{ type: Kind }
>;
type PersistedBase = Omit<PersistedArm<"rectangle">, "type">;
type FixedPointBinding = NonNullable<ElbowArrowElement["startBinding"]>;

/**
 * One binding as a record, refusing a field the binding's kind does not
 * carry: an unknown key here is a shape nothing else on the board reads.
 * @param value The value.
 * @param allowed The fields this kind of binding carries.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @param path Where in the element the value is.
 * @returns The record, or null for an end bound to nothing.
 */
function bindingRecord(
	value: unknown,
	allowed: ReadonlySet<string>,
	context: string,
	id: string,
	type: string,
	path: string,
): Record<string, unknown> | null {
	if (value === null) {
		return null;
	}
	const record = recordAt(value, context, id, type, path);
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) {
			fail(context, id, type, `${path}.${key}`);
		}
	}
	if (typeof record["elementId"] !== "string" || !record["elementId"]) {
		fail(context, id, type, `${path}.elementId`);
	}
	return record;
}

/**
 * One ordinary arrow binding: which shape, how far round it, how far short.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @param path Where in the element the value is.
 * @returns The binding, or null for an end bound to nothing.
 */
function pointBindingAt(
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
	if (!record) {
		return null;
	}
	return {
		elementId: stringAt(record["elementId"], context, id, type, `${path}.elementId`),
		focus: finite(record["focus"], context, id, type, `${path}.focus`),
		gap: finite(record["gap"], context, id, type, `${path}.gap`),
	} satisfies ElementBinding;
}

/**
 * One elbowed arrow's binding, which also names the point on the shape the
 * arrow is pinned to.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @param path Where in the element the value is.
 * @returns The binding, or null for an end bound to nothing.
 */
function fixedPointBindingAt(
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
	if (!record) {
		return null;
	}
	return {
		elementId: stringAt(record["elementId"], context, id, type, `${path}.elementId`),
		focus: finite(record["focus"], context, id, type, `${path}.focus`),
		gap: finite(record["gap"], context, id, type, `${path}.gap`),
		fixedPoint: point(record["fixedPoint"], context, id, type, `${path}.fixedPoint`),
	} satisfies FixedPointBinding;
}

/**
 * The value as one of Excalidraw's fill styles.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The fill style.
 */
function fillStyleAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedBase["fillStyle"] {
	switch (value) {
		case "hachure":
		case "cross-hatch":
		case "solid":
		case "zigzag": {
			return value;
		}
		default: {
			return fail(context, id, type, "element.fillStyle");
		}
	}
}

/**
 * The value as one of Excalidraw's stroke styles.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The stroke style.
 */
function strokeStyleAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedBase["strokeStyle"] {
	switch (value) {
		case "solid":
		case "dashed":
		case "dotted": {
			return value;
		}
		default: {
			return fail(context, id, type, "element.strokeStyle");
		}
	}
}

/**
 * The value as one of Excalidraw's arrowheads.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @param path Where in the element the value is.
 * @returns The arrowhead, or null for an end that draws none.
 */
function arrowheadAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
	path: string,
): PersistedArm<"arrow">["startArrowhead"] {
	if (value === null) {
		return null;
	}
	if (!isArrowhead(value)) {
		fail(context, id, type, path);
	}
	return value;
}

/** Every arrowhead Excalidraw draws. */
const ARROWHEADS = [
	"arrow",
	"bar",
	"dot",
	"circle",
	"circle_outline",
	"triangle",
	"triangle_outline",
	"diamond",
	"diamond_outline",
	"crowfoot_one",
	"crowfoot_many",
	"crowfoot_one_or_many",
] as const satisfies readonly NonNullable<PersistedArm<"arrow">["startArrowhead"]>[];

const ARROWHEAD_NAMES = new Set<unknown>(ARROWHEADS);

/**
 * Whether a value names one of Excalidraw's arrowheads.
 * @param value The value.
 * @returns True when it is one.
 */
function isArrowhead(value: unknown): value is (typeof ARROWHEADS)[number] {
	return ARROWHEAD_NAMES.has(value);
}

/**
 * The value as Excalidraw's roundness record: which of its three rules, and
 * the radius the fixed rule carries.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The roundness, or null for a sharp element.
 */
function roundnessAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedBase["roundness"] {
	if (value === null) {
		return null;
	}
	const record = recordAt(value, context, id, type, "element.roundness");
	const kind = record["type"];
	if (kind !== 1 && kind !== 2 && kind !== 3) {
		fail(context, id, type, "element.roundness.type");
	}
	return {
		type: kind,
		...(record["value"] === undefined
			? {}
			: { value: finite(record["value"], context, id, type, "element.roundness.value") }),
	};
}

/**
 * The value as a shape's forward references to the texts and arrows bound to
 * it.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The references, or null for an element that binds nothing.
 */
function boundElementsAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): BoundElement[] | null {
	if (value === null) {
		return null;
	}
	if (!Array.isArray(value)) {
		fail(context, id, type, "element.boundElements");
	}
	return value.map((raw, index) =>
		boundElementAt(raw, context, id, type, `element.boundElements[${index}]`),
	);
}

/**
 * One `boundElements` entry: which element, and whether it is the label or an
 * arrow.
 * @param raw The entry.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @param path Where in the element the entry is.
 * @returns The reference.
 */
function boundElementAt(
	raw: unknown,
	context: string,
	id: string,
	type: string,
	path: string,
): BoundElement {
	const bound = recordAt(raw, context, id, type, path);
	if (typeof bound["id"] !== "string" || !bound["id"]) {
		fail(context, id, type, `${path}.id`);
	}
	if (bound["type"] !== "text" && bound["type"] !== "arrow") {
		fail(context, id, type, `${path}.type`);
	}
	return { id: bound["id"], type: bound["type"] } satisfies BoundElement;
}

const TRACKING_KEYS = [
	"createdAt",
	"updatedAt",
	"syncedAt",
	"source",
	"syncTimestamp",
] as const satisfies readonly (keyof RuntimeElementTracking)[];

const TRACKING_KEY_NAMES = new Set<string>(TRACKING_KEYS);

/**
 * The value as `customData`, archboard's metadata channel (ADR 0003).
 *
 * Another plugin's keys are carried through as they are; archboard's own
 * envelope is read field by field, and the tracking fields in it must be
 * text, because that is what everything downstream reads them as.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The metadata.
 */
function customDataAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): NonNullable<PersistedBase["customData"]> {
	const record = recordAt(value, context, id, type, "element.customData");
	const custom: Record<string, unknown> & { archboard?: PersistedArchboardEnvelope } = {};
	for (const [key, entry] of Object.entries(record)) {
		if (key !== "archboard") {
			custom[key] = entry;
		}
	}
	if ("archboard" in record) {
		custom.archboard = archboardEnvelopeAt(record["archboard"], context, id, type);
	}
	return custom;
}

/**
 * The `customData.archboard` envelope, with its tracking fields checked.
 * @param value The envelope as stored.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The envelope.
 */
function archboardEnvelopeAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedArchboardEnvelope {
	const raw = recordAt(value, context, id, type, "element.customData.archboard");
	const envelope: PersistedArchboardEnvelope = {};
	for (const [key, entry] of Object.entries(raw)) {
		if (!TRACKING_KEY_NAMES.has(key)) {
			envelope[key] = entry;
			continue;
		}
		if (typeof entry !== "string") {
			fail(context, id, type, `element.customData.archboard.${key}`);
		}
		Object.assign(envelope, { [key]: entry });
	}
	return envelope;
}

/**
 * The properties every element carries, whatever its type.
 * @param initial The element as stored.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The checked base.
 */
function persistedBase(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: string,
): PersistedBase {
	// The five geometry fields are read first, before anything else can refuse:
	// an element that is not on the canvas at all is the more useful complaint.
	const x = finite(initial["x"], context, id, type, "element.x");
	const y = finite(initial["y"], context, id, type, "element.y");
	const width = finite(initial["width"], context, id, type, "element.width");
	const height = finite(initial["height"], context, id, type, "element.height");
	const angle = finite(initial["angle"], context, id, type, "element.angle");
	return {
		id,
		x,
		y,
		strokeColor: stringAt(initial["strokeColor"], context, id, type, "element.strokeColor"),
		backgroundColor: stringAt(
			initial["backgroundColor"],
			context,
			id,
			type,
			"element.backgroundColor",
		),
		fillStyle: fillStyleAt(initial["fillStyle"], context, id, type),
		strokeWidth: finite(initial["strokeWidth"], context, id, type, "element.strokeWidth"),
		strokeStyle: strokeStyleAt(initial["strokeStyle"], context, id, type),
		roundness: roundnessAt(initial["roundness"], context, id, type),
		roughness: finite(initial["roughness"], context, id, type, "element.roughness"),
		opacity: finite(initial["opacity"], context, id, type, "element.opacity"),
		width,
		height,
		angle,
		seed: finite(initial["seed"], context, id, type, "element.seed"),
		version: finite(initial["version"], context, id, type, "element.version"),
		versionNonce: finite(initial["versionNonce"], context, id, type, "element.versionNonce"),
		index: nullableStringAt(initial["index"], context, id, type, "element.index"),
		isDeleted: booleanAt(initial["isDeleted"], context, id, type, "element.isDeleted"),
		groupIds: groupIdsAt(initial["groupIds"], context, id, type),
		frameId: nullableStringAt(initial["frameId"], context, id, type, "element.frameId"),
		boundElements: boundElementsAt(initial["boundElements"], context, id, type),
		updated: finite(initial["updated"], context, id, type, "element.updated"),
		link: nullableStringAt(initial["link"], context, id, type, "element.link"),
		locked: booleanAt(initial["locked"], context, id, type, "element.locked"),
		...(initial["customData"] === undefined
			? {}
			: { customData: customDataAt(initial["customData"], context, id, type) }),
	} satisfies PersistedBase;
}

/**
 * The groups an element belongs to.
 * @param value The value.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The group ids.
 */
function groupIdsAt(value: unknown, context: string, id: string, type: string): string[] {
	if (!Array.isArray(value)) {
		fail(context, id, type, "element.groupIds");
	}
	return value.map((entry, at) => stringAt(entry, context, id, type, `element.groupIds[${at}]`));
}

/**
 * The bookkeeping archboard keeps beside an element: when it was made, when
 * it last changed, and whether a human drew it.
 * @param initial The element as stored.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The tracking fields the element carries.
 */
function runtimeTrackingAt(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: string,
): RuntimeElementTracking {
	const tracking: RuntimeElementTracking = {};
	for (const key of TRACKING_KEYS) {
		if (initial[key] === undefined) {
			continue;
		}
		tracking[key] = stringAt(initial[key], context, id, type, `element.${key}`);
	}
	return tracking;
}

export {
	NativeElementValidationError,
	type PersistedArm,
	type PersistedBase,
	fail,
	recordAt,
	finite,
	point,
	nullablePoint,
	points,
	pointBindingAt,
	fixedPointBindingAt,
	stringAt,
	booleanAt,
	nullableBooleanAt,
	nullableStringAt,
	fillStyleAt,
	strokeStyleAt,
	arrowheadAt,
	roundnessAt,
	boundElementsAt,
	customDataAt,
	persistedBase,
	runtimeTrackingAt,
};
