import { expect, test } from "bun:test";
import { renderArchitecture } from "@archboard/renderer/bun";
import {
	cachedModelDrawing,
	type PictureStorage,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";

test("canonical scenes survive reload only under their exact key and refused storage still draws", async () => {
	const drawing = await renderArchitecture({
		content: {
			nodes: [{ id: "Service", name: "Service", kind: "module", order: 1000 }],
			edges: [],
			flows: [],
			walkthroughs: [],
		},
		theme: "light",
	});
	const entries = new Map<string, unknown>();
	const storage: PictureStorage = {
		get: async (key) => entries.get(key),
		set: async (key, value) => {
			entries.set(key, value);
		},
		del: async (key) => {
			entries.delete(key);
		},
		keys: async () => [...entries.keys()],
	};
	let layouts = 0;
	const draw = async () => {
		layouts++;
		return drawing;
	};
	await cachedModelDrawing(storage, "first-scene", draw);
	const reloaded = await cachedModelDrawing(storage, "first-scene", draw);
	expect(layouts).toBe(1);
	expect(reloaded).toMatchObject({
		svg: drawing.svg,
		width: drawing.width,
		height: drawing.height,
		atlas: drawing.atlas,
		placed: drawing.placed,
		readingDirection: drawing.readingDirection,
	});
	await cachedModelDrawing(storage, "changed-scene", draw);
	expect(layouts).toBe(2);
	entries.set("first-scene", { svg: drawing.svg });
	await cachedModelDrawing(storage, "first-scene", draw);
	expect(layouts).toBe(3);
	const refused: PictureStorage = {
		...storage,
		get: async () => {
			throw new Error("Storage is unavailable");
		},
		set: async () => {
			throw new Error("Storage is full");
		},
	};
	expect(await cachedModelDrawing(refused, "first-scene", draw)).toBe(drawing);
	expect(layouts).toBe(4);
});
