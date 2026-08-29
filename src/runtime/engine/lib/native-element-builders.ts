import type {
	ElbowArrowElement,
	NonElbowArrowElement,
	PersistedBoardElement,
	RuntimeBoardElement,
} from "../../../shared/board-elements/index.js";
import { hydrateElementTracking } from "../metadata.js";
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
} from "./native-element-validation.js";

type PersistedNonElbowArrow = Extract<PersistedArm<"arrow">, NonElbowArrowElement>;
type PersistedElbowArrow = Extract<PersistedArm<"arrow">, ElbowArrowElement>;

function fixedSegmentsAt(
	value: unknown,
	context: string,
	id: string,
	type: string,
): PersistedElbowArrow["fixedSegments"] {
	if (value === null) return null;
	if (!Array.isArray(value)) fail(context, id, type, "element.fixedSegments");
	return value.map((candidate, index) => {
		const path = `element.fixedSegments[${index}]`;
		const segment = recordAt(candidate, context, id, type, path);
		for (const key of Object.keys(segment))
			if (key !== "start" && key !== "end" && key !== "index")
				fail(context, id, type, `${path}.${key}`);
		return {
			start: point(segment.start, context, id, type, `${path}.start`),
			end: point(segment.end, context, id, type, `${path}.end`),
			index: finite(segment.index, context, id, type, `${path}.index`),
		};
	});
}

export function buildValidatedElement(
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
				startBinding: pointBindingAt(
					initial.startBinding,
					context,
					id,
					type,
					"element.startBinding",
				),
				endBinding: pointBindingAt(initial.endBinding, context, id, type, "element.endBinding"),
				startArrowhead: arrowheadAt(
					initial.startArrowhead,
					context,
					id,
					type,
					"element.startArrowhead",
				),
				endArrowhead: arrowheadAt(initial.endArrowhead, context, id, type, "element.endArrowhead"),
			} satisfies PersistedArm<"line">);
		case "arrow": {
			const elbowed = booleanAt(initial.elbowed, context, id, type, "element.elbowed");
			if (!elbowed) {
				for (const field of ["fixedSegments", "startIsSpecial", "endIsSpecial"] as const) {
					if (field in initial) fail(context, id, type, `element.${field}`);
				}
			}
			const linear = {
				id: baseId,
				type: "arrow" as const,
				...baseFields,
				points: points(initial.points, 2, context, id, type, "element.points"),
				lastCommittedPoint: nullablePoint(
					initial.lastCommittedPoint,
					context,
					id,
					type,
					"element.lastCommittedPoint",
				),
			};
			const arrowheads = {
				startArrowhead: arrowheadAt(
					initial.startArrowhead,
					context,
					id,
					type,
					"element.startArrowhead",
				),
				endArrowhead: arrowheadAt(initial.endArrowhead, context, id, type, "element.endArrowhead"),
			};
			if (!elbowed)
				return finish({
					...linear,
					startBinding: pointBindingAt(
						initial.startBinding,
						context,
						id,
						type,
						"element.startBinding",
					),
					endBinding: pointBindingAt(initial.endBinding, context, id, type, "element.endBinding"),
					...arrowheads,
					elbowed: false,
				} satisfies PersistedNonElbowArrow);
			return finish({
				...linear,
				startBinding: fixedPointBindingAt(
					initial.startBinding,
					context,
					id,
					type,
					"element.startBinding",
				),
				endBinding: fixedPointBindingAt(
					initial.endBinding,
					context,
					id,
					type,
					"element.endBinding",
				),
				...arrowheads,
				elbowed: true,
				fixedSegments: fixedSegmentsAt(initial.fixedSegments, context, id, type),
				startIsSpecial: nullableBooleanAt(
					initial.startIsSpecial,
					context,
					id,
					type,
					"element.startIsSpecial",
				),
				endIsSpecial: nullableBooleanAt(
					initial.endIsSpecial,
					context,
					id,
					type,
					"element.endIsSpecial",
				),
			} satisfies PersistedElbowArrow);
		}
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
