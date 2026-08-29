import { expect, test } from "bun:test";

import { applyElementInput } from "../apply-element-input.js";
import { expandElements } from "../expand-elements.js";
import { validatePersistedBoardElement } from "../native-element.js";

test("the named write boundary completes all eight native arms and image defaults", () => {
	const elements = expandElements(
		[
			{ id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
			{ id: "e", type: "ellipse", x: 0, y: 0, width: 10, height: 10 },
			{ id: "d", type: "diamond", x: 0, y: 0, width: 10, height: 10 },
			{ id: "t", type: "text", x: 0, y: 0, text: "text" },
			{ id: "l", type: "line", x: 0, y: 0 },
			{ id: "a", type: "arrow", x: 0, y: 0 },
			{ id: "f", type: "freedraw", x: 0, y: 0, points: [[0, 0]] },
			{ id: "i", type: "image", x: 0, y: 0, width: 10, height: 10 },
		],
		{ deterministic: true, forStore: true },
	);
	expect(new Set(elements.map((element) => element.type))).toEqual(
		new Set(["rectangle", "ellipse", "diamond", "text", "line", "arrow", "freedraw", "image"]),
	);
	const image = elements.find((element) => element.type === "image");
	expect(image).toMatchObject({ fileId: null, status: "pending", scale: [1, 1], crop: null });
	for (const element of elements) {
		expect(validatePersistedBoardElement(element, "trusted note /vault/board.md")).toEqual(element);
	}
});

test("trusted reads reject missing native fields and invalid image values pathfully", () => {
	const complete = expandElements(
		[{ id: "image", type: "image", x: 0, y: 0, width: 10, height: 10 }],
		{ deterministic: true, forStore: true },
	)[0]!;
	const missing = structuredClone(complete) as unknown as Record<string, unknown>;
	delete missing.angle;
	expect(() => validatePersistedBoardElement(missing, "note /vault/strict.excalidraw.md")).toThrow(
		"note /vault/strict.excalidraw.md: invalid element image (image) at element.angle",
	);
	for (const [field, value] of [
		["fileId", ""],
		["status", "unknown"],
		["scale", [1, 0]],
		["crop", { x: 0, y: 0, width: -1, height: 1, naturalWidth: 1, naturalHeight: 1 }],
	] as const) {
		expect(() =>
			validatePersistedBoardElement({ ...complete, [field]: value }, "image ingress"),
		).toThrow(`element.${field}`);
	}
	expect(() =>
		validatePersistedBoardElement({ ...complete, label: { text: "spent" } }, "trusted note"),
	).toThrow("element.label");
});

test("line and arrow keep distinct native contracts", () => {
	const [line, arrow] = expandElements(
		[
			{ id: "line", type: "line", x: 0, y: 0 },
			{ id: "arrow", type: "arrow", x: 0, y: 0 },
		],
		{ deterministic: true, forStore: true },
	);
	expect(line?.type).toBe("line");
	expect(arrow).toMatchObject({ type: "arrow", elbowed: false });
	expect(() => validatePersistedBoardElement({ ...line, elbowed: false }, "line ingress")).toThrow(
		"element.elbowed",
	);
	const missingElbowed = { ...arrow } as Record<string, unknown>;
	delete missingElbowed.elbowed;
	expect(() => validatePersistedBoardElement(missingElbowed, "arrow ingress")).toThrow(
		"element.elbowed",
	);
	expect(() =>
		validatePersistedBoardElement({ ...arrow, points: [[0, 0]] }, "arrow ingress"),
	).toThrow("element.points");
});

test("a human whole-scene ingress preserves cross-element native bindings", () => {
	const source = expandElements(
		[
			{
				id: "box",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 100,
				height: 50,
				boundElements: [{ id: "label", type: "text" }],
			},
			{ id: "label", type: "text", x: 10, y: 10, text: "Label", containerId: "box" },
		],
		{ deterministic: true, forStore: true },
	);
	const board = new Map();
	applyElementInput(board, {
		origin: "human",
		upserts: Array.from(source, (element) => Object.assign({} as Record<string, unknown>, element)),
	});
	const box = board.get("box");
	expect(box?.boundElements).toContainEqual({ id: "label", type: "text" });
});
