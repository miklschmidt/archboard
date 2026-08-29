import {
	BOARD_ELEMENT_TYPES,
	type PersistedBoardElement,
	type RuntimeBoardElement,
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
): void {
	if (!Array.isArray(value) || value.length !== 2) fail(context, id, type, path);
	finite(value[0], context, id, type, `${path}[0]`);
	finite(value[1], context, id, type, `${path}[1]`);
}

function nullablePoint(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): void {
	if (value !== null) point(value, context, id, type, path);
}

function points(
	value: unknown,
	minimum: number,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): void {
	if (!Array.isArray(value) || value.length < minimum) fail(context, id, type, path);
	value.forEach((candidate, index) => point(candidate, context, id, type, `${path}[${index}]`));
}

function binding(
	value: unknown,
	context: string,
	id: string | undefined,
	type: string | undefined,
	path: string,
): void {
	if (value === null) return;
	const record = recordAt(value, context, id, type, path);
	if (typeof record.elementId !== "string" || !record.elementId)
		fail(context, id, type, `${path}.elementId`);
	finite(record.focus, context, id, type, `${path}.focus`);
	finite(record.gap, context, id, type, `${path}.gap`);
	if (record.fixedPoint !== undefined)
		nullablePoint(record.fixedPoint, context, id, type, `${path}.fixedPoint`);
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

	return hydrateElementTracking(initial as PersistedBoardElement);
}
