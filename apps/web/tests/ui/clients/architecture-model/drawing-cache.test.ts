import { PICTURE_MS } from "@archboard/timing";
import { createSteppedClock, driveFramesFrom } from "@archboard/ui-kit/frame-clock";
import { afterAll, expect, test } from "bun:test";
import {
	cachedModelDrawing,
	forgetStalePictures,
	modelDrawingKey,
	type PictureStorage,
} from "#ui/clients/semantic-board-canvas/reads/picture-cache.ts";

const clock = createSteppedClock(0);
afterAll(driveFramesFrom(clock));

const DRAWING = {
	svg: '<svg width="100" height="100"><rect data-semantic-id="Service" width="80" height="40" /></svg>',
	painting: "{}",
	width: 100,
	height: 100,
	atlas: {
		nodes: { Service: { x: 0, y: 0, width: 80, height: 40 } },
		edges: {},
		regions: {},
	},
	placed: ["Service"],
	appearances: [],
	legend: null,
	readingDirection: "down",
} satisfies Awaited<ReturnType<Parameters<typeof cachedModelDrawing>[2]>>;

/**
 * A picture store over a map.
 * @param entries What it holds.
 * @returns The store.
 */
function storeOver(entries: Map<string, unknown>): PictureStorage {
	return {
		/**
		 * Read one drawing.
		 * @param key Its key.
		 * @returns The drawing.
		 */
		get: async (key) => entries.get(key),
		/**
		 * Keep one drawing.
		 * @param key Its key.
		 * @param value The drawing.
		 */
		set: async (key, value) => {
			entries.set(key, value);
		},
		/**
		 * Forget one drawing.
		 * @param key Its key.
		 */
		del: async (key) => {
			entries.delete(key);
		},
		/**
		 * List the keys.
		 * @returns Every key.
		 */
		keys: async () => [...entries.keys()],
	};
}

/**
 * Lay nothing out.
 * @returns The fixture's drawing.
 */
async function drawFixture() {
	return DRAWING;
}

test("canonical drawings stay bounded, drop other builds and survive the replay cleanup", async () => {
	const entries = new Map<string, unknown>();
	const other = modelDrawingKey("older-build", "Shop", "digest");
	entries.set(other, DRAWING);
	const kept = Array.from({ length: 80 }, (_, index) =>
		modelDrawingKey("build", "Shop", `digest-${index}`),
	);
	for (const key of kept.slice(0, -1)) entries.set(key, DRAWING);
	const storage = storeOver(entries);
	await cachedModelDrawing(storage, kept.at(-1)!, drawFixture);
	expect(entries.has(other)).toBe(false);
	expect(entries.size).toBe(64);
	expect(entries.has(kept.at(-1)!)).toBe(true);
	await forgetStalePictures(storage, "/vault", [], "build");
	expect(entries.size).toBe(64);
});

test("canonical scenes survive reload only under their exact key and refused storage still draws", async () => {
	const drawing = DRAWING;
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

/**
 * A store that was asked and never answers.
 * @returns An answer that never comes.
 */
function silent(): Promise<never> {
	return new Promise(() => undefined);
}

/**
 * Let what waits on the store reach its next wait, then end that wait.
 * @param to Where the clock goes.
 */
async function outwaitTheStore(to: number): Promise<void> {
	await new Promise((resolve) => setImmediate(resolve));
	clock.advanceTo(to);
}

test("a store that never answers does not hold a picture back", async () => {
	const storage: PictureStorage = { get: silent, set: silent, del: silent, keys: silent };
	const drawn = cachedModelDrawing(storage, "first-scene", async () => DRAWING);
	await outwaitTheStore(PICTURE_MS.storeWait);
	await outwaitTheStore(2 * PICTURE_MS.storeWait);
	expect(await drawn).toBe(DRAWING);
});
