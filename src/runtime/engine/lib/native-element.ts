import {
	BOARD_ELEMENT_TYPES,
	type BoundElement,
	type ElementBinding,
	type PersistedArchboardEnvelope,
	type PersistedBoardElement,
	type RuntimeBoardElement,
	type RuntimeElementTracking,
} from "../../../shared/board-elements/index.js";
import { hydrateElementTracking } from "../metadata.js";

const TYPES = new Set<string>(BOARD_ELEMENT_TYPES);
const FILL_STYLES = new Set(["hachure", "cross-hatch", "solid", "zigzag"]);
const STROKE_STYLES = new Set(["solid", "dashed", "dotted"]);
const IMAGE_STATUSES = new Set(["pending", "saved", "error"]);

export class NativeElementValidationError extends Error {
	readonly status = 400;
}

function fail(
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): never {
	throw new NativeElementValidationError(
		`${context}: invalid element${id ? ` ${id}` : ""}${type ? ` (${type})` : ""} at ${path}`,
	);
}

function recordAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) fail(context, id, type, path);
	return value as Record<string, unknown>;
}

function finite(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) fail(context, id, type, path);
	return value;
}

function point(
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

function nullablePoint(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): [number, number] | null {
	return value === null ? null : point(value, context, id, type, path);
}

function points(
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

type CanonicalBinding = ElementBinding & { fixedPoint?: [number, number] | null };

function binding(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): CanonicalBinding | null {
	if (value === null) return null;
	const record = recordAt(value, context, id, type, path);
	const allowed = new Set(["elementId", "focus", "gap", "fixedPoint"]);
	for (const key of Object.keys(record))
		if (!allowed.has(key)) fail(context, id, type, `${path}.${key}`);
	if (typeof record.elementId !== "string" || !record.elementId)
		fail(context, id, type, `${path}.elementId`);
	const fixedPoint =
		record.fixedPoint === undefined
			? undefined
			: nullablePoint(record.fixedPoint, context, id, type, `${path}.fixedPoint`);
	return {
		elementId: record.elementId,
		...(fixedPoint !== undefined ? { fixedPoint } : {}),
		focus: finite(record.focus, context, id, type, `${path}.focus`),
		gap: finite(record.gap, context, id, type, `${path}.gap`),
	};
}

type PersistedArm<Kind extends PersistedBoardElement["type"]> = Extract<
	PersistedBoardElement,
	{ type: Kind }
>;
type PersistedBase = Omit<PersistedArm<"rectangle">, "type">;

function stringAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): string {
	if (typeof value !== "string") fail(context, id, type, path);
	return value;
}

function booleanAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): boolean {
	if (typeof value !== "boolean") fail(context, id, type, path);
	return value;
}

function nullableStringAt(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): string | null {
	return value === null ? null : stringAt(value, context, id, type, path);
}

function fillStyleAt(value: unknown, context: string, id: string, type: string) {
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

function strokeStyleAt(value: unknown, context: string, id: string, type: string) {
	switch (value) {
		case "solid":
		case "dashed":
		case "dotted":
			return value;
		default:
			fail(context, id, type, "element.strokeStyle");
	}
}

function arrowheadAt(
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

function roundnessAt(
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

function boundElementsAt(
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

function customDataAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedBase["customData"] {
	if (value === undefined) return undefined;
	const record = recordAt(value, context, id, type, "element.customData");
	const custom: Record<string, unknown> & { archboard?: PersistedArchboardEnvelope } = {};
	for (const [key, entry] of Object.entries(record)) {
		if (key !== "archboard") custom[key] = entry;
	}
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
			if (TRACKING_KEYS.includes(key as (typeof TRACKING_KEYS)[number])) {
				if (typeof entry !== "string")
					fail(context, id, type, `element.customData.archboard.${key}`);
				switch (key) {
					case "createdAt":
						envelope.createdAt = entry;
						break;
					case "updatedAt":
						envelope.updatedAt = entry;
						break;
					case "syncedAt":
						envelope.syncedAt = entry;
						break;
					case "source":
						envelope.source = entry;
						break;
					case "syncTimestamp":
						envelope.syncTimestamp = entry;
				}
			} else {
				envelope[key] = entry;
			}
		}
		custom.archboard = envelope;
	}
	return custom;
}

function persistedBase(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: string,
): PersistedBase {
	const index =
		initial.index === null ? null : stringAt(initial.index, context, id, type, "element.index");
	const base = {
		id,
		x: finite(initial.x, context, id, type, "element.x"),
		y: finite(initial.y, context, id, type, "element.y"),
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
		width: finite(initial.width, context, id, type, "element.width"),
		height: finite(initial.height, context, id, type, "element.height"),
		angle: finite(initial.angle, context, id, type, "element.angle"),
		seed: finite(initial.seed, context, id, type, "element.seed"),
		version: finite(initial.version, context, id, type, "element.version"),
		versionNonce: finite(initial.versionNonce, context, id, type, "element.versionNonce"),
		index,
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
	return base;
}

function runtimeTrackingAt(
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

function buildValidatedElement(
	initial: Record<string, unknown>,
	context: string,
	id: string,
	type: PersistedBoardElement["type"],
): RuntimeBoardElement {
	const base = persistedBase(initial, context, id, type);
	const { id: baseId, ...baseFields } = base;
	const tracking = runtimeTrackingAt(initial, context, id, type);
	const finish = (element: PersistedBoardElement): RuntimeBoardElement =>
		hydrateElementTracking({ ...element, ...tracking });
	switch (type) {
		case "rectangle":
			return finish({
				id: baseId,
				type: "rectangle",
				...baseFields,
			} satisfies PersistedArm<"rectangle">);
		case "ellipse":
			return finish({
				id: baseId,
				type: "ellipse",
				...baseFields,
			} satisfies PersistedArm<"ellipse">);
		case "diamond":
			return finish({
				id: baseId,
				type: "diamond",
				...baseFields,
			} satisfies PersistedArm<"diamond">);
		case "text":
			return finish({
				id: baseId,
				type: "text",
				...baseFields,
				fontSize: finite(initial.fontSize, context, id, type, "element.fontSize"),
				fontFamily: finite(initial.fontFamily, context, id, type, "element.fontFamily"),
				text: stringAt(initial.text, context, id, type, "element.text"),
				textAlign: stringAt(initial.textAlign, context, id, type, "element.textAlign"),
				verticalAlign: stringAt(initial.verticalAlign, context, id, type, "element.verticalAlign"),
				containerId: nullableStringAt(
					initial.containerId,
					context,
					id,
					type,
					"element.containerId",
				),
				originalText: stringAt(initial.originalText, context, id, type, "element.originalText"),
				autoResize: booleanAt(initial.autoResize, context, id, type, "element.autoResize"),
				lineHeight: finite(initial.lineHeight, context, id, type, "element.lineHeight"),
				...(initial.rawText === undefined
					? {}
					: { rawText: stringAt(initial.rawText, context, id, type, "element.rawText") }),
			} satisfies PersistedArm<"text">);
		case "line":
			return finish({
				id: baseId,
				type: "line",
				...baseFields,
				points: points(initial.points, 2, context, id, type, "element.points"),
				lastCommittedPoint: nullablePoint(
					initial.lastCommittedPoint,
					context,
					id,
					type,
					"element.lastCommittedPoint",
				),
				startBinding: binding(initial.startBinding, context, id, type, "element.startBinding"),
				endBinding: binding(initial.endBinding, context, id, type, "element.endBinding"),
				startArrowhead: arrowheadAt(
					initial.startArrowhead,
					context,
					id,
					type,
					"element.startArrowhead",
				),
				endArrowhead: arrowheadAt(initial.endArrowhead, context, id, type, "element.endArrowhead"),
			} satisfies PersistedArm<"line">);
		case "arrow":
			return finish({
				id: baseId,
				type: "arrow",
				...baseFields,
				points: points(initial.points, 2, context, id, type, "element.points"),
				lastCommittedPoint: nullablePoint(
					initial.lastCommittedPoint,
					context,
					id,
					type,
					"element.lastCommittedPoint",
				),
				startBinding: binding(initial.startBinding, context, id, type, "element.startBinding"),
				endBinding: binding(initial.endBinding, context, id, type, "element.endBinding"),
				startArrowhead: arrowheadAt(
					initial.startArrowhead,
					context,
					id,
					type,
					"element.startArrowhead",
				),
				endArrowhead: arrowheadAt(initial.endArrowhead, context, id, type, "element.endArrowhead"),
				elbowed: booleanAt(initial.elbowed, context, id, type, "element.elbowed"),
			} satisfies PersistedArm<"arrow">);
		case "freedraw":
			return finish({
				id: baseId,
				type: "freedraw",
				...baseFields,
				points: points(initial.points, 1, context, id, type, "element.points"),
				pressures: Array.isArray(initial.pressures)
					? initial.pressures.map((entry, at) =>
							finite(entry, context, id, type, `element.pressures[${at}]`),
						)
					: fail(context, id, type, "element.pressures"),
				simulatePressure: booleanAt(
					initial.simulatePressure,
					context,
					id,
					type,
					"element.simulatePressure",
				),
				lastCommittedPoint: nullablePoint(
					initial.lastCommittedPoint,
					context,
					id,
					type,
					"element.lastCommittedPoint",
				),
			} satisfies PersistedArm<"freedraw">);
		case "image": {
			const fileId = nullableStringAt(initial.fileId, context, id, type, "element.fileId");
			if (fileId === "") fail(context, id, type, "element.fileId");
			const status = initial.status;
			if (status !== "pending" && status !== "saved" && status !== "error")
				fail(context, id, type, "element.status");
			const scale = point(initial.scale, context, id, type, "element.scale");
			if ((scale[0] !== -1 && scale[0] !== 1) || (scale[1] !== -1 && scale[1] !== 1))
				fail(context, id, type, "element.scale");
			let crop: PersistedArm<"image">["crop"] = null;
			if (initial.crop !== null) {
				const record = recordAt(initial.crop, context, id, type, "element.crop");
				const allowed = new Set(["x", "y", "width", "height", "naturalWidth", "naturalHeight"]);
				for (const key of Object.keys(record))
					if (!allowed.has(key)) fail(context, id, type, `element.crop.${key}`);
				crop = {
					x: finite(record.x, context, id, type, "element.crop.x"),
					y: finite(record.y, context, id, type, "element.crop.y"),
					width: finite(record.width, context, id, type, "element.crop.width"),
					height: finite(record.height, context, id, type, "element.crop.height"),
					naturalWidth: finite(record.naturalWidth, context, id, type, "element.crop.naturalWidth"),
					naturalHeight: finite(
						record.naturalHeight,
						context,
						id,
						type,
						"element.crop.naturalHeight",
					),
				};
				for (const key of ["width", "height", "naturalWidth", "naturalHeight"] as const)
					if (crop[key] < 0) fail(context, id, type, `element.crop.${key}`);
			}
			return finish({
				id: baseId,
				type: "image",
				...baseFields,
				fileId,
				status,
				scale,
				crop,
			} satisfies PersistedArm<"image">);
		}
	}
}

/** Validate a trusted persisted record without completing or rewriting it. */
// oxlint-disable-next-line eslint/complexity -- the pinned eight-arm runtime contract stays exhaustive in one owner
export function validatePersistedBoardElement(
	value: unknown,
	context: string,
): RuntimeBoardElement {
	const initial = recordAt(value, context, undefined, undefined, "element");
	const id = typeof initial.id === "string" ? initial.id : undefined;
	const type = typeof initial.type === "string" ? initial.type : undefined;
	if (!id) fail(context, id, type, "element.id");
	if (!type || !TYPES.has(type)) fail(context, id, type, "element.type");
	for (const alias of ["label", "start", "end", "startElementId", "endElementId"])
		if (alias in initial) fail(context, id, type, `element.${alias}`);
	if (type !== "text" && "rawText" in initial) fail(context, id, type, "element.rawText");

	for (const name of ["x", "y", "width", "height", "angle"])
		finite(initial[name], context, id, type, `element.${name}`);
	for (const name of [
		"strokeWidth",
		"roughness",
		"opacity",
		"seed",
		"version",
		"versionNonce",
		"updated",
	])
		finite(initial[name], context, id, type, `element.${name}`);
	for (const name of ["strokeColor", "backgroundColor"])
		if (typeof initial[name] !== "string") fail(context, id, type, `element.${name}`);
	if (typeof initial.fillStyle !== "string" || !FILL_STYLES.has(initial.fillStyle))
		fail(context, id, type, "element.fillStyle");
	if (typeof initial.strokeStyle !== "string" || !STROKE_STYLES.has(initial.strokeStyle))
		fail(context, id, type, "element.strokeStyle");
	for (const name of ["isDeleted", "locked"])
		if (typeof initial[name] !== "boolean") fail(context, id, type, `element.${name}`);
	if (initial.index !== null && typeof initial.index !== "string")
		fail(context, id, type, "element.index");
	if (initial.frameId !== null && typeof initial.frameId !== "string")
		fail(context, id, type, "element.frameId");
	if (initial.link !== null && typeof initial.link !== "string")
		fail(context, id, type, "element.link");
	if (
		!Array.isArray(initial.groupIds) ||
		initial.groupIds.some((entry) => typeof entry !== "string")
	)
		fail(context, id, type, "element.groupIds");
	if (initial.roundness !== null) {
		const roundness = recordAt(initial.roundness, context, id, type, "element.roundness");
		if (![1, 2, 3].includes(roundness.type as number))
			fail(context, id, type, "element.roundness.type");
		if (roundness.value !== undefined)
			finite(roundness.value, context, id, type, "element.roundness.value");
	}
	if (initial.boundElements !== null) {
		if (!Array.isArray(initial.boundElements)) fail(context, id, type, "element.boundElements");
		for (const [index, raw] of initial.boundElements.entries()) {
			const bound = recordAt(raw, context, id, type, `element.boundElements[${index}]`);
			if (typeof bound.id !== "string" || !bound.id)
				fail(context, id, type, `element.boundElements[${index}].id`);
			if (bound.type !== "text" && bound.type !== "arrow")
				fail(context, id, type, `element.boundElements[${index}].type`);
		}
	}

	switch (type) {
		case "text":
			for (const name of ["text", "originalText", "textAlign", "verticalAlign"])
				if (typeof initial[name] !== "string") fail(context, id, type, `element.${name}`);
			for (const name of ["fontSize", "fontFamily", "lineHeight"])
				finite(initial[name], context, id, type, `element.${name}`);
			if (typeof initial.autoResize !== "boolean") fail(context, id, type, "element.autoResize");
			if (initial.containerId !== null && typeof initial.containerId !== "string")
				fail(context, id, type, "element.containerId");
			break;
		case "line":
		case "arrow":
			points(initial.points, 2, context, id, type, "element.points");
			nullablePoint(initial.lastCommittedPoint, context, id, type, "element.lastCommittedPoint");
			binding(initial.startBinding, context, id, type, "element.startBinding");
			binding(initial.endBinding, context, id, type, "element.endBinding");
			for (const name of ["startArrowhead", "endArrowhead"])
				if (initial[name] !== null && typeof initial[name] !== "string")
					fail(context, id, type, `element.${name}`);
			if (type === "line" && "elbowed" in initial) fail(context, id, type, "element.elbowed");
			if (type === "arrow" && typeof initial.elbowed !== "boolean")
				fail(context, id, type, "element.elbowed");
			break;
		case "freedraw":
			points(initial.points, 1, context, id, type, "element.points");
			if (
				!Array.isArray(initial.pressures) ||
				initial.pressures.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
			)
				fail(context, id, type, "element.pressures");
			if (typeof initial.simulatePressure !== "boolean")
				fail(context, id, type, "element.simulatePressure");
			nullablePoint(initial.lastCommittedPoint, context, id, type, "element.lastCommittedPoint");
			break;
		case "image": {
			if (initial.fileId !== null && (typeof initial.fileId !== "string" || !initial.fileId))
				fail(context, id, type, "element.fileId");
			if (typeof initial.status !== "string" || !IMAGE_STATUSES.has(initial.status))
				fail(context, id, type, "element.status");
			if (
				!Array.isArray(initial.scale) ||
				initial.scale.length !== 2 ||
				initial.scale.some((entry) => entry !== -1 && entry !== 1)
			)
				fail(context, id, type, "element.scale");
			if (initial.crop !== null) {
				const crop = recordAt(initial.crop, context, id, type, "element.crop");
				const cropKeys = ["x", "y", "width", "height", "naturalWidth", "naturalHeight"];
				for (const key of Object.keys(crop))
					if (!cropKeys.includes(key)) fail(context, id, type, `element.crop.${key}`);
				for (const name of cropKeys) {
					const number = finite(crop[name], context, id, type, `element.crop.${name}`);
					if (!["x", "y"].includes(name) && number < 0)
						fail(context, id, type, `element.crop.${name}`);
				}
			}
			break;
		}
		case "rectangle":
		case "ellipse":
		case "diamond":
			break;
	}

	switch (type) {
		case "rectangle":
		case "ellipse":
		case "diamond":
		case "text":
		case "line":
		case "arrow":
		case "freedraw":
		case "image":
			return buildValidatedElement(initial, context, id, type);
		default:
			return fail(context, id, type, "element.type");
	}
}
