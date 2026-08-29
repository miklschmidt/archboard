import { expect, test } from "bun:test";

import { applyElementInput } from "../apply-element-input.js";
import { expandElements } from "../expand-elements.js";
import { pointsOf } from "../geometry.js";
import { validatePersistedBoardElement } from "../native-element.js";
import { completeElement } from "./support/elements.js";
import type { LegacyElementIngress } from "../../../shared/board-elements/index.js";

function ordinaryArrow() {
	return completeElement({ id: "ordinary", type: "arrow", x: 0, y: 0 });
}

test("trusted reads enforce the vendor arrow and binding correlation", () => {
	const ordinary = ordinaryArrow();
	expect(ordinary).toMatchObject({ type: "arrow", elbowed: false });
	expect(() =>
		validatePersistedBoardElement(
			{
				...ordinary,
				startBinding: { elementId: "left", focus: 0, gap: 4, fixedPoint: [0, 1] },
			},
			"note /vault/arrows.excalidraw.md",
		),
	).toThrow(
		"note /vault/arrows.excalidraw.md: invalid element ordinary (arrow) at element.startBinding.fixedPoint",
	);

	const elbow = {
		...ordinary,
		id: "elbow",
		elbowed: true,
		startBinding: { elementId: "left", focus: 0, gap: 4, fixedPoint: [0, 1] },
		endBinding: { elementId: "right", focus: 0.5, gap: 6, fixedPoint: [1, 0] },
		fixedSegments: [{ start: [0, 0], end: [40, 0], index: 0 }],
		startIsSpecial: null,
		endIsSpecial: false,
	};
	expect(
		validatePersistedBoardElement(elbow, "note /vault/arrows.excalidraw.md") as unknown,
	).toEqual(elbow);
	for (const end of ["startBinding", "endBinding"] as const) {
		const binding = { ...elbow[end] } as Record<string, unknown>;
		delete binding.fixedPoint;
		expect(() =>
			validatePersistedBoardElement(
				{ ...elbow, [end]: binding },
				"note /vault/arrows.excalidraw.md",
			),
		).toThrow(`element.${end}.fixedPoint`);
	}
	for (const field of ["fixedSegments", "startIsSpecial", "endIsSpecial"] as const) {
		const incomplete = { ...elbow } as Record<string, unknown>;
		delete incomplete[field];
		expect(() =>
			validatePersistedBoardElement(incomplete, "note /vault/arrows.excalidraw.md"),
		).toThrow(`element.${field}`);
	}
	for (const field of ["fixedSegments", "startIsSpecial", "endIsSpecial"] as const) {
		expect(() =>
			validatePersistedBoardElement(
				{ ...ordinary, [field]: elbow[field] },
				"note /vault/arrows.excalidraw.md",
			),
		).toThrow(`element.${field}`);
	}
});

test("write ingress builds both vendor-derived arrow arms in canonical field order", () => {
	const [ordinary, elbow] = expandElements(
		[
			{
				id: "ordinary",
				type: "arrow",
				x: 0,
				y: 0,
				startBinding: { elementId: "left", focus: 0, gap: 4 },
			},
			{
				id: "elbow",
				type: "arrow",
				x: 0,
				y: 0,
				elbowed: true,
				startBinding: { elementId: "left", focus: 0, gap: 4, fixedPoint: [0, 1] },
				endBinding: { elementId: "right", focus: 0.5, gap: 6, fixedPoint: [1, 0] },
				fixedSegments: [{ start: [0, 0], end: [40, 0], index: 0 }],
				startIsSpecial: null,
				endIsSpecial: false,
			} satisfies LegacyElementIngress,
		],
		{ deterministic: true, forStore: true },
	);
	expect(ordinary).toMatchObject({ elbowed: false });
	if (ordinary?.type !== "arrow" || elbow?.type !== "arrow")
		throw new Error("fixtures did not produce arrows");
	expect(ordinary?.startBinding).toEqual({ elementId: "left", focus: 0, gap: 4 });
	expect(elbow).toMatchObject({
		elbowed: true,
		fixedSegments: [{ start: [0, 0], end: [40, 0], index: 0 }],
		startIsSpecial: null,
		endIsSpecial: false,
	});
	expect(elbow?.startBinding).toEqual({
		elementId: "left",
		focus: 0,
		gap: 4,
		fixedPoint: [0, 1],
	});
	expect(Object.keys(elbow.startBinding ?? {})).toEqual([
		"elementId",
		"focus",
		"gap",
		"fixedPoint",
	]);
	expect(Object.keys(elbow.endBinding ?? {})).toEqual(["elementId", "focus", "gap", "fixedPoint"]);
	expect(
		Object.keys(elbow).filter((key) =>
			[
				"points",
				"lastCommittedPoint",
				"startBinding",
				"endBinding",
				"startArrowhead",
				"endArrowhead",
				"elbowed",
				"fixedSegments",
				"startIsSpecial",
				"endIsSpecial",
			].includes(key),
		),
	).toEqual([
		"elbowed",
		"endArrowhead",
		"endBinding",
		"endIsSpecial",
		"fixedSegments",
		"lastCommittedPoint",
		"points",
		"startArrowhead",
		"startBinding",
		"startIsSpecial",
	]);
});

test("only agent ingress normalizes object points", () => {
	const board = new Map();
	applyElementInput(board, {
		origin: "agent",
		upserts: [
			{
				id: "object-points",
				type: "line",
				x: 0,
				y: 0,
				points: [
					{ x: 0, y: 0 },
					{ x: 40, y: 20 },
				],
			},
		],
	});
	const line = board.get("object-points");
	expect(line?.type).toBe("line");
	if (line?.type !== "line") throw new Error("fixture did not produce a line");
	expect(line.points).toEqual([
		[0, 0],
		[40, 20],
	]);
	expect(
		pointsOf([
			{ x: 0, y: 0 },
			{ x: 40, y: 20 },
		]),
	).toBeUndefined();
});

test("agent ingress spends label and non-text text intent before label expansion", () => {
	const board = new Map();
	applyElementInput(board, {
		origin: "agent",
		upserts: [
			{
				id: "labelled",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 100,
				height: 60,
				label: { text: "Label alias" },
			},
		],
	});
	const container = board.get("labelled")!;
	const label = [...board.values()].find(
		(element) => element.type === "text" && element.containerId === "labelled",
	);
	expect(Reflect.has(container, "label")).toBeFalse();
	expect(Reflect.has(container, "labelText")).toBeFalse();
	expect(label?.text).toBe("Label alias");

	applyElementInput(board, {
		origin: "agent",
		upserts: [{ id: "labelled", text: "Text alias" }],
	});
	const renamed = [...board.values()].find(
		(element) => element.type === "text" && element.containerId === "labelled",
	);
	expect(renamed?.text).toBe("Text alias");
});
