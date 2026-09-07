// One element of a note, checked and built.
//
// A note may hold anything, and everything past this point treats an element
// as the shape its type promises. So each type is built by its own function,
// reading every field it declares through the checked readers next door and
// refusing the first thing that is not what it says it is.

import type {
	ElbowArrowElement,
	NonElbowArrowElement,
	PersistedBoardElement,
	RuntimeBoardElement,
} from "@/shared/board-elements";
import { hydrateElementTracking } from "@/runtime/engine/metadata";
import {
	arrowheadAt,
	booleanAt,
	fail,
	finite,
	fixedPointBindingAt,
	nullableBooleanAt,
	nullablePoint,
	nullableStringAt,
	persistedBase,
	point,
	pointBindingAt,
	points,
	recordAt,
	runtimeTrackingAt,
	stringAt,
	type PersistedArm,
	type PersistedBase,
} from "@/runtime/engine/lib/native-element-validation";

type PersistedNonElbowArrow = Extract<PersistedArm<"arrow">, NonElbowArrowElement>;
type PersistedElbowArrow = Extract<PersistedArm<"arrow">, ElbowArrowElement>;

/** Everything one element is built from, carried together. */
interface Build {
	/** The element as the note holds it. */
	initial: Record<string, unknown>;
	/** What the caller was doing, for the refusal. */
	context: string;
	id: string;
	type: PersistedBoardElement["type"];
	/** The fields every element has, already checked. */
	base: PersistedBase;
}

/**
 * The elbow arrow's fixed segments, refusing any field a segment does not
 * declare.
 * @param value The value the note holds.
 * @param context What the caller was doing.
 * @param id The element's id.
 * @param type The element's type.
 * @returns The segments, or null when the arrow has none.
 * @throws {NativeElementValidationError} When any of it is not a segment.
 */
function fixedSegmentsAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedElbowArrow["fixedSegments"] {
	if (value === null) {
		return null;
	}
	if (!Array.isArray(value)) {
		fail(context, id, type, "element.fixedSegments");
	}
	return value.map((candidate, index) => {
		const path = `element.fixedSegments[${index}]`;
		const segment = recordAt(candidate, context, id, type, path);
		for (const key of Object.keys(segment)) {
			if (key !== "start" && key !== "end" && key !== "index") {
				fail(context, id, type, `${path}.${key}`);
			}
		}
		return {
			start: point(segment["start"], context, id, type, `${path}.start`),
			end: point(segment["end"], context, id, type, `${path}.end`),
			index: finite(segment["index"], context, id, type, `${path}.index`),
		};
	});
}

/**
 * A rectangle, which is the base fields and nothing else.
 * @param b What the element is built from.
 * @returns The element.
 */
function buildRectangle(b: Build): PersistedArm<"rectangle"> {
	const { id: baseId, ...baseFields } = b.base;
	return { id: baseId, type: "rectangle", ...baseFields };
}

/**
 * An ellipse, which is the base fields and nothing else.
 * @param b What the element is built from.
 * @returns The element.
 */
function buildEllipse(b: Build): PersistedArm<"ellipse"> {
	const { id: baseId, ...baseFields } = b.base;
	return { id: baseId, type: "ellipse", ...baseFields };
}

/**
 * A diamond, which is the base fields and nothing else.
 * @param b What the element is built from.
 * @returns The element.
 */
function buildDiamond(b: Build): PersistedArm<"diamond"> {
	const { id: baseId, ...baseFields } = b.base;
	return { id: baseId, type: "diamond", ...baseFields };
}

/**
 * A text element, with the layout fields Excalidraw measures it by.
 *
 * `rawText` is Obsidian's, and is carried only when the note carries it.
 * @param b What the element is built from.
 * @returns The element.
 * @throws {NativeElementValidationError} When any field is not what it says.
 */
function buildText(b: Build): PersistedArm<"text"> {
	const { initial, context, id, type } = b;
	const { id: baseId, ...baseFields } = b.base;
	return {
		id: baseId,
		type: "text",
		...baseFields,
		fontSize: finite(initial["fontSize"], context, id, type, "element.fontSize"),
		fontFamily: finite(initial["fontFamily"], context, id, type, "element.fontFamily"),
		text: stringAt(initial["text"], context, id, type, "element.text"),
		textAlign: stringAt(initial["textAlign"], context, id, type, "element.textAlign"),
		verticalAlign: stringAt(initial["verticalAlign"], context, id, type, "element.verticalAlign"),
		containerId: nullableStringAt(initial["containerId"], context, id, type, "element.containerId"),
		originalText: stringAt(initial["originalText"], context, id, type, "element.originalText"),
		autoResize: booleanAt(initial["autoResize"], context, id, type, "element.autoResize"),
		lineHeight: finite(initial["lineHeight"], context, id, type, "element.lineHeight"),
		...(initial["rawText"] === undefined
			? {}
			: { rawText: stringAt(initial["rawText"], context, id, type, "element.rawText") }),
	};
}

/**
 * A line, which keeps its shape in its path.
 * @param b What the element is built from.
 * @returns The element.
 * @throws {NativeElementValidationError} When any field is not what it says.
 */
function buildLine(b: Build): PersistedArm<"line"> {
	const { initial, context, id, type } = b;
	const { id: baseId, ...baseFields } = b.base;
	return {
		id: baseId,
		type: "line",
		...baseFields,
		points: points(initial["points"], 2, context, id, type, "element.points"),
		lastCommittedPoint: nullablePoint(
			initial["lastCommittedPoint"],
			context,
			id,
			type,
			"element.lastCommittedPoint",
		),
		startBinding: pointBindingAt(
			initial["startBinding"],
			context,
			id,
			type,
			"element.startBinding",
		),
		endBinding: pointBindingAt(initial["endBinding"], context, id, type, "element.endBinding"),
		startArrowhead: arrowheadAt(
			initial["startArrowhead"],
			context,
			id,
			type,
			"element.startArrowhead",
		),
		endArrowhead: arrowheadAt(initial["endArrowhead"], context, id, type, "element.endArrowhead"),
	};
}

/**
 * The fields both kinds of arrow share: the path, and where it was last
 * committed.
 * @param b What the element is built from.
 * @returns The shared fields.
 * @throws {NativeElementValidationError} When the path is not one.
 */
function arrowPath(b: Build): {
	points: PersistedArm<"arrow">["points"];
	lastCommittedPoint: PersistedArm<"arrow">["lastCommittedPoint"];
} {
	const { initial, context, id, type } = b;
	return {
		points: points(initial["points"], 2, context, id, type, "element.points"),
		lastCommittedPoint: nullablePoint(
			initial["lastCommittedPoint"],
			context,
			id,
			type,
			"element.lastCommittedPoint",
		),
	};
}

/**
 * The arrowheads on each end of a connector.
 * @param b What the element is built from.
 * @returns The two arrowhead fields.
 * @throws {NativeElementValidationError} When either is not one.
 */
function arrowheads(b: Build): {
	startArrowhead: PersistedArm<"arrow">["startArrowhead"];
	endArrowhead: PersistedArm<"arrow">["endArrowhead"];
} {
	const { initial, context, id, type } = b;
	return {
		startArrowhead: arrowheadAt(
			initial["startArrowhead"],
			context,
			id,
			type,
			"element.startArrowhead",
		),
		endArrowhead: arrowheadAt(initial["endArrowhead"], context, id, type, "element.endArrowhead"),
	};
}

/**
 * Refuse the fields only an elbow arrow has, on an arrow that is not one.
 *
 * They are not harmless leftovers: Excalidraw reads them, and a straight arrow
 * carrying elbow state is a shape nobody drew.
 * @param b What the element is built from.
 * @throws {NativeElementValidationError} When one of them is present.
 */
function refuseElbowOnlyFields(b: Build): void {
	for (const field of ["fixedSegments", "startIsSpecial", "endIsSpecial"] as const) {
		if (field in b.initial) {
			fail(b.context, b.id, b.type, `element.${field}`);
		}
	}
}

/**
 * A straight arrow, whose ends bind by focus and gap.
 * @param b What the element is built from.
 * @returns The element.
 * @throws {NativeElementValidationError} When any field is not what it says.
 */
function buildStraightArrow(b: Build): PersistedNonElbowArrow {
	const { initial, context, id, type } = b;
	const { id: baseId, ...baseFields } = b.base;
	return {
		id: baseId,
		type: "arrow",
		...baseFields,
		...arrowPath(b),
		startBinding: pointBindingAt(
			initial["startBinding"],
			context,
			id,
			type,
			"element.startBinding",
		),
		endBinding: pointBindingAt(initial["endBinding"], context, id, type, "element.endBinding"),
		...arrowheads(b),
		elbowed: false,
	};
}

/**
 * An elbow arrow, whose ends bind to a fixed point and whose corners are
 * stated rather than routed.
 * @param b What the element is built from.
 * @returns The element.
 * @throws {NativeElementValidationError} When any field is not what it says.
 */
function buildElbowArrow(b: Build): PersistedElbowArrow {
	const { initial, context, id, type } = b;
	const { id: baseId, ...baseFields } = b.base;
	return {
		id: baseId,
		type: "arrow",
		...baseFields,
		...arrowPath(b),
		startBinding: fixedPointBindingAt(
			initial["startBinding"],
			context,
			id,
			type,
			"element.startBinding",
		),
		endBinding: fixedPointBindingAt(initial["endBinding"], context, id, type, "element.endBinding"),
		...arrowheads(b),
		elbowed: true,
		fixedSegments: fixedSegmentsAt(initial["fixedSegments"], context, id, type),
		startIsSpecial: nullableBooleanAt(
			initial["startIsSpecial"],
			context,
			id,
			type,
			"element.startIsSpecial",
		),
		endIsSpecial: nullableBooleanAt(
			initial["endIsSpecial"],
			context,
			id,
			type,
			"element.endIsSpecial",
		),
	};
}

/**
 * An arrow, which is two different elements wearing one type name.
 * @param b What the element is built from.
 * @returns The element.
 * @throws {NativeElementValidationError} When any field is not what it says.
 */
function buildArrow(b: Build): PersistedArm<"arrow"> {
	const elbowed = booleanAt(b.initial["elbowed"], b.context, b.id, b.type, "element.elbowed");
	if (!elbowed) {
		refuseElbowOnlyFields(b);
		return buildStraightArrow(b);
	}
	return buildElbowArrow(b);
}

/**
 * A freedraw stroke, whose pressures run alongside its path.
 * @param b What the element is built from.
 * @returns The element.
 * @throws {NativeElementValidationError} When any field is not what it says.
 */
function buildFreedraw(b: Build): PersistedArm<"freedraw"> {
	const { initial, context, id, type } = b;
	const { id: baseId, ...baseFields } = b.base;
	return {
		id: baseId,
		type: "freedraw",
		...baseFields,
		points: points(initial["points"], 1, context, id, type, "element.points"),
		pressures: Array.isArray(initial["pressures"])
			? initial["pressures"].map((entry, at) =>
					finite(entry, context, id, type, `element.pressures[${at}]`),
				)
			: fail(context, id, type, "element.pressures"),
		simulatePressure: booleanAt(
			initial["simulatePressure"],
			context,
			id,
			type,
			"element.simulatePressure",
		),
		lastCommittedPoint: nullablePoint(
			initial["lastCommittedPoint"],
			context,
			id,
			type,
			"element.lastCommittedPoint",
		),
	};
}

/**
 * Whether an image's flip is one of the two values a flip can be.
 * @param value The stated scale on one axis.
 * @returns True for 1 or -1.
 */
function isFlip(value: number): boolean {
	return value === -1 || value === 1;
}

/**
 * How far an image has been loaded.
 * @param b What the element is built from.
 * @returns The status.
 * @throws {NativeElementValidationError} When it is not one of the three.
 */
function imageStatus(b: Build): PersistedArm<"image">["status"] {
	const status = b.initial["status"];
	if (status !== "pending" && status !== "saved" && status !== "error") {
		fail(b.context, b.id, b.type, "element.status");
	}
	return status;
}

/**
 * Which way round an image is drawn.
 *
 * Only a flip, never a resize: an image's size is its width and height, so a
 * scale of anything but 1 or -1 would be a second, contradictory answer.
 * @param b What the element is built from.
 * @returns The scale.
 * @throws {NativeElementValidationError} When either axis is not a flip.
 */
function imageScale(b: Build): PersistedArm<"image">["scale"] {
	const scale = point(b.initial["scale"], b.context, b.id, b.type, "element.scale");
	if (!isFlip(scale[0]) || !isFlip(scale[1])) {
		fail(b.context, b.id, b.type, "element.scale");
	}
	return scale;
}

const CROP_KEYS = new Set(["x", "y", "width", "height", "naturalWidth", "naturalHeight"]);

/**
 * The crop's six numbers.
 * @param record The crop as the note holds it.
 * @param b What the element is built from.
 * @returns The crop.
 * @throws {NativeElementValidationError} When any of them is not a number.
 */
function imageCropFields(
	record: Record<string, unknown>,
	b: Build,
): NonNullable<PersistedArm<"image">["crop"]> {
	const { context, id, type } = b;
	return {
		x: finite(record["x"], context, id, type, "element.crop.x"),
		y: finite(record["y"], context, id, type, "element.crop.y"),
		width: finite(record["width"], context, id, type, "element.crop.width"),
		height: finite(record["height"], context, id, type, "element.crop.height"),
		naturalWidth: finite(record["naturalWidth"], context, id, type, "element.crop.naturalWidth"),
		naturalHeight: finite(record["naturalHeight"], context, id, type, "element.crop.naturalHeight"),
	};
}

/**
 * How much of an image is shown, refusing a field the crop does not declare
 * and a negative size, which is not a crop of anything.
 * @param b What the element is built from.
 * @returns The crop, or null when the whole image is shown.
 * @throws {NativeElementValidationError} When it is not a crop.
 */
function imageCrop(b: Build): PersistedArm<"image">["crop"] {
	if (b.initial["crop"] === null) {
		return null;
	}
	const record = recordAt(b.initial["crop"], b.context, b.id, b.type, "element.crop");
	for (const key of Object.keys(record)) {
		if (!CROP_KEYS.has(key)) {
			fail(b.context, b.id, b.type, `element.crop.${key}`);
		}
	}
	const crop = imageCropFields(record, b);
	for (const key of ["width", "height", "naturalWidth", "naturalHeight"] as const) {
		if (crop[key] < 0) {
			fail(b.context, b.id, b.type, `element.crop.${key}`);
		}
	}
	return crop;
}

/**
 * An image, which points at a file the note carries separately.
 * @param b What the element is built from.
 * @returns The element.
 * @throws {NativeElementValidationError} When any field is not what it says.
 */
function buildImage(b: Build): PersistedArm<"image"> {
	const { id: baseId, ...baseFields } = b.base;
	const fileId = nullableStringAt(b.initial["fileId"], b.context, b.id, b.type, "element.fileId");
	if (fileId === "") {
		fail(b.context, b.id, b.type, "element.fileId");
	}
	return {
		id: baseId,
		type: "image",
		...baseFields,
		fileId,
		status: imageStatus(b),
		scale: imageScale(b),
		crop: imageCrop(b),
	};
}

// One builder per element type, so adding a type is adding a function and an
// entry here rather than a branch inside a growing switch.
const BUILDERS: { [Kind in PersistedBoardElement["type"]]: (b: Build) => PersistedArm<Kind> } = {
	rectangle: buildRectangle,
	ellipse: buildEllipse,
	diamond: buildDiamond,
	text: buildText,
	line: buildLine,
	arrow: buildArrow,
	freedraw: buildFreedraw,
	image: buildImage,
};

/**
 * One element of a note, checked field by field and built as the type it
 * claims to be.
 * @param initial The element as the note holds it.
 * @param context What the caller was doing, for the refusal.
 * @param id The element's id.
 * @param type The element's type, which decides what it must carry.
 * @returns The element, with its runtime tracking rehydrated.
 * @throws {NativeElementValidationError} At the first field that is not what
 * the type says it is.
 */
export function buildValidatedElement(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: PersistedBoardElement["type"],
): RuntimeBoardElement {
	const base = persistedBase(initial, context, id, type);
	const tracking = runtimeTrackingAt(initial, context, id, type);
	const built = BUILDERS[type]({ initial, context, id, type, base });
	return hydrateElementTracking({ ...built, ...tracking });
}
