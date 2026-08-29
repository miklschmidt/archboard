import { expect, test } from "bun:test";

import { applyElementInput } from "../apply-element-input.js";
import { expandElements } from "../expand-elements.js";
import { validatePersistedBoardElement } from "../native-element.js";
import { completeElement } from "./support/elements.js";

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

test("binding input extensions are spent and trusted reads reject them at either end", () => {
	const board = new Map([
		["left", completeElement({ id: "left", type: "rectangle", x: 0, y: 0, width: 20, height: 20 })],
		[
			"right",
			completeElement({ id: "right", type: "rectangle", x: 100, y: 0, width: 20, height: 20 }),
		],
	]);
	applyElementInput(board, {
		origin: "agent",
		upserts: [
			{
				id: "joined",
				type: "arrow",
				x: 20,
				y: 10,
				startBinding: { elementId: "left", focus: 0, gap: 4, fixedPoint: null, mode: "inside" },
				endBinding: { elementId: "right", focus: 0.5, gap: 6, fixedPoint: [1, 0], mode: "outside" },
			},
		],
	});
	const joined = board.get("joined");
	expect(joined?.type).toBe("arrow");
	if (joined?.type !== "arrow") throw new Error("fixture did not create an arrow");
	expect(joined.startBinding).toMatchObject({ elementId: "left", focus: 0, gap: 4 });
	expect(Reflect.get(joined.startBinding!, "fixedPoint")).toBeUndefined();
	expect(Object.keys(joined.startBinding!)).toEqual(["elementId", "focus", "gap"]);
	expect(joined.endBinding).toMatchObject({ elementId: "right", focus: 0.5, gap: 6 });
	expect(Reflect.get(joined.endBinding!, "fixedPoint")).toBeUndefined();
	expect(Object.keys(joined.endBinding!)).toEqual(["elementId", "focus", "gap"]);
	for (const end of ["startBinding", "endBinding"] as const) {
		expect(() =>
			validatePersistedBoardElement(
				{ ...joined, [end]: { ...joined[end], mode: "inside" } },
				"note /vault/binding.excalidraw.md",
			),
		).toThrow(
			`note /vault/binding.excalidraw.md: invalid element joined (arrow) at element.${end}.mode`,
		);
	}
});

test("agent and human create and update cannot spoof runtime or nested tracking", () => {
	const board = new Map();
	applyElementInput(board, {
		origin: "agent",
		upserts: [
			{
				id: "agent",
				type: "rectangle",
				x: 0,
				y: 0,
				width: 20,
				height: 20,
				createdAt: "spoofed-create",
				customData: { archboard: { node: "agent", source: "spoofed-nested" }, foreign: true },
			},
		],
	});
	const agentCreated = board.get("agent")!;
	expect(agentCreated.createdAt).not.toBe("spoofed-create");
	expect(agentCreated.customData).toEqual({ archboard: { node: "agent" }, foreign: true });
	applyElementInput(board, {
		origin: "agent",
		upserts: [
			{
				id: "agent",
				updatedAt: "spoofed-update",
				customData: { archboard: { node: "updated", syncTimestamp: "spoofed-nested" } },
			},
		],
	});
	const agentUpdated = board.get("agent")!;
	expect(agentUpdated.updatedAt).not.toBe("spoofed-update");
	expect(agentUpdated.customData).toEqual({ archboard: { node: "updated" }, foreign: true });
	applyElementInput(board, {
		origin: "agent",
		upserts: [{ id: "agent", customData: {} }],
	});
	expect(board.get("agent")!.customData).toEqual({ foreign: true });

	const humanSeed = completeElement({
		id: "human",
		type: "rectangle",
		x: 20,
		y: 20,
		width: 20,
		height: 20,
	});
	applyElementInput(board, {
		origin: "human",
		upserts: [
			{
				...humanSeed,
				createdAt: "spoofed-human-create",
				customData: {
					archboard: { node: "human", syncedAt: "spoofed-nested" },
					foreignHuman: true,
				},
			},
		],
	});
	const humanCreated = board.get("human")!;
	expect(humanCreated.createdAt).not.toBe("spoofed-human-create");
	expect(humanCreated.source).toBe("frontend_sync");
	expect(humanCreated.customData).toEqual({ archboard: { node: "human" }, foreignHuman: true });
	applyElementInput(board, {
		origin: "human",
		upserts: [
			{
				...humanCreated,
				x: 40,
				source: "spoofed-human-update",
				customData: { archboard: { node: "human-updated", updatedAt: "spoofed-nested" } },
			},
		],
	});
	const humanUpdated = board.get("human")!;
	expect(humanUpdated.source).toBe("frontend_sync");
	expect(humanUpdated.customData).toEqual({
		archboard: { node: "human-updated" },
		foreignHuman: true,
	});
});
