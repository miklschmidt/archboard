import { expect, test } from "bun:test";
import {
	cachedModelDrawing,
	type PictureStorage,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";

test("canonical scenes survive reload only under their exact key and refused storage still draws", async () => {
	const drawing = {
		svg: '<svg width="100" height="100"><rect data-semantic-id="Service" width="80" height="40" /></svg>',
		width: 100,
		height: 100,
		atlas: {
			nodes: { Service: { x: 0, y: 0, width: 80, height: 40 } },
			edges: {},
			regions: {},
		},
		placed: ["Service"],
		readingDirection: "down",
	} satisfies Awaited<ReturnType<Parameters<typeof cachedModelDrawing>[2]>>;
	const entries = new Map<string, unknown>();
	const storage: PictureStorage = {
		/**
		 * Read one saved scene.
		 * @param key The exact scene identity.
		 * @returns Its stored value, if present.
		 */
		get: async (key) => entries.get(key),
		/**
		 * Save one scene across cache calls.
		 * @param key The exact scene identity.
		 * @param value The rendered scene.
		 */
		set: async (key, value) => {
			entries.set(key, value);
		},
		/**
		 * Remove a saved scene.
		 * @param key The exact scene identity.
		 */
		del: async (key) => {
			entries.delete(key);
		},
		/**
		 * List the stored identities.
		 * @returns Every scene key.
		 */
		keys: async () => [...entries.keys()],
	};
	let layouts = 0;
	/**
	 * Count fresh layout requests.
	 * @returns The complete scene, including its reading direction.
	 */
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
		/**
		 * Refuse a read from unavailable browser storage.
		 * @throws {Error} The storage refusal.
		 */
		get: async () => {
			throw new Error("Storage is unavailable");
		},
		/**
		 * Refuse a write after storage fills.
		 * @throws {Error} The storage refusal.
		 */
		set: async () => {
			throw new Error("Storage is full");
		},
	};
	expect(await cachedModelDrawing(refused, "first-scene", draw)).toBe(drawing);
	expect(layouts).toBe(4);
});
