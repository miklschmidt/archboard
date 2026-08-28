import { afterAll, describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";

const previousVault = process.env.ARCHBOARD_VAULT;
const vault = fs.mkdtempSync(join(os.tmpdir(), "archboard-library-"));
process.env.ARCHBOARD_VAULT = vault;

const {
	curatedSets,
	libraryFilePath,
	parseLibraryFile,
	readLibrary,
	resetLibraryCache,
	writeLibrary,
} = await import("../library.ts");
const resolvedLibraryPath = libraryFilePath();
assert.ok(resolvedLibraryPath, "library test requires a vault-backed library path");
assert.equal(
	resolve(resolvedLibraryPath),
	resolve(vault, ".archboard", "library.excalidrawlib"),
	"library test refuses to read or write outside its owned temporary vault",
);
const { AmbiguousStencilError, UnknownStencilError, chooseStencil, remapElements } =
	await import("../library-catalogue.ts");

afterAll(() => {
	resetLibraryCache();
	fs.rmSync(vault, { recursive: true, force: true });
	if (previousVault === undefined) delete process.env.ARCHBOARD_VAULT;
	else process.env.ARCHBOARD_VAULT = previousVault;
});

describe("library file parsing", () => {
	test("version 1 keeps elements, publishes by default, and derives deterministic set-specific ids", () => {
		const fixture = JSON.stringify({
			type: "excalidrawlib",
			version: 1,
			library: [
				[
					{ id: "a", type: "rectangle" },
					{ id: "b", type: "text" },
				],
				[{ id: "c", type: "ellipse" }],
			],
		});

		const items = parseLibraryFile(fixture, "fixture");
		expect(items).toHaveLength(2);
		expect(items[0]?.elements).toHaveLength(2);
		expect(items[0]?.status).toBe("published");
		expect(items[0]?.id).not.toBe(items[1]?.id);
		expect(parseLibraryFile(fixture, "fixture")[0]?.id).toBe(items[0]?.id);
		expect(parseLibraryFile(fixture, "other")[0]?.id).not.toBe(items[0]?.id);
	});

	test("version 2 keeps published metadata and drops empty or deleted-only items", () => {
		const fixture = JSON.stringify({
			type: "excalidrawlib",
			version: 2,
			libraryItems: [
				{
					id: "kept-id",
					name: "Slack",
					status: "published",
					created: 17,
					elements: [{ id: "a" }],
				},
				{ id: "empty", status: "published", created: 18, elements: [] },
				{
					id: "deleted-only",
					status: "published",
					created: 19,
					elements: [{ id: "x", isDeleted: true }],
				},
			],
		});

		const items = parseLibraryFile(fixture, "fixture");
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ id: "kept-id", name: "Slack", created: 17 });
	});
});

describe("curated library persistence", () => {
	test("all seven curated sets contain 111 usable stencils", () => {
		const sets = curatedSets();
		expect(sets).toHaveLength(7);
		expect(sets.reduce((total, set) => total + set.items.length, 0)).toBe(111);
		expect(sets.every((set) => set.items.every((item) => item.elements.length > 0))).toBe(true);
	});

	test("the first read seeds every set with stable ids and attribution", () => {
		const seeded = readLibrary();
		expect(seeded.items).toHaveLength(111);
		expect(seeded.seeded).toHaveLength(7);
		expect(seeded.vaultBacked).toBe(true);
		expect(fs.existsSync(resolvedLibraryPath)).toBe(true);
		expect(Object.keys(seeded.origins)).toHaveLength(111);

		resetLibraryCache();
		const reread = readLibrary();
		expect(reread.items.map((item) => item.id)).toEqual(seeded.items.map((item) => item.id));
	});

	test("a deleted stencil and its attribution stay deleted", () => {
		const before = readLibrary();
		const removedId = before.items[0]!.id;
		writeLibrary(before.items.slice(1));
		resetLibraryCache();

		const after = readLibrary();
		expect(after.items).toHaveLength(110);
		expect(after.items.some((item) => item.id === removedId)).toBe(false);
		expect(after.origins[removedId]).toBeUndefined();
		expect(Object.keys(after.origins)).toHaveLength(110);
	});

	test("a curated set absent from seeded reaches an existing vault", () => {
		const before = readLibrary();
		before.seeded.splice(before.seeded.indexOf("cloud"), 1);
		writeLibrary(before.items.filter((item) => before.origins[item.id] !== "cloud"));
		resetLibraryCache();

		const after = readLibrary();
		expect(after.seeded).toContain("cloud");
		expect(Object.values(after.origins).filter((set) => set === "cloud").length).toBeGreaterThan(0);
	});
});

const catalogue = [
	{ id: "one", name: "Database", source: "cloud", elements: 6, width: 66, height: 101, text: null },
	{
		id: "two",
		name: "Database",
		source: "drwnio",
		elements: 4,
		width: 199,
		height: 253,
		text: null,
	},
	{
		id: "three",
		name: "Server rack",
		source: "cloud",
		elements: 104,
		width: 224,
		height: 287,
		text: null,
	},
];

describe("stencil selection", () => {
	test("names match case-insensitively and source or id settles a unique choice", () => {
		expect(chooseStencil(catalogue, { name: "server rack" }).id).toBe("three");
		expect(chooseStencil(catalogue, { name: "Database", source: "drwnio" }).id).toBe("two");
		expect(chooseStencil(catalogue, { itemId: "one" }).id).toBe("one");
	});

	test("a shared name refuses with every candidate and source", () => {
		expect(() => chooseStencil(catalogue, { name: "Database" })).toThrow(AmbiguousStencilError);
		try {
			chooseStencil(catalogue, { name: "Database" });
		} catch (error) {
			expect(error).toBeInstanceOf(AmbiguousStencilError);
			const refusal = error as InstanceType<typeof AmbiguousStencilError>;
			expect(refusal.candidates).toHaveLength(2);
			expect(refusal.message).toContain("cloud");
			expect(refusal.message).toContain("drwnio");
		}
	});

	test("unknown names, ids, and source combinations refuse", () => {
		expect(() => chooseStencil(catalogue, { name: "Nothing" })).toThrow(UnknownStencilError);
		expect(() => chooseStencil(catalogue, { itemId: "nope" })).toThrow(UnknownStencilError);
		expect(() => chooseStencil(catalogue, { name: "Database", source: "system-design" })).toThrow(
			UnknownStencilError,
		);
	});
});

describe("stencil placement", () => {
	test("a placed copy remaps ids, bindings, groups, position, and attribution without mutation", () => {
		const stencil = [
			{ id: "a", type: "rectangle", x: 500, y: 400, width: 100, height: 50, groupIds: ["g"] },
			{
				id: "b",
				type: "draw",
				x: 520,
				y: 460,
				width: 10,
				height: 10,
				groupIds: ["g"],
				startBinding: { elementId: "a", focus: 0 },
				endBinding: { elementId: "a", focus: 1 },
			},
			{
				id: "c",
				type: "text",
				x: 505,
				y: 405,
				width: 40,
				height: 20,
				containerId: "a",
				groupIds: [],
			},
		];
		const placed = remapElements(stencil, 0, 0, { library: { item: "Fixture" } }) as Array<
			Record<string, unknown>
		>;
		const shape = placed[0]!;
		const arrow = placed[1]!;
		const label = placed[2]!;

		expect(placed.map((element) => element.id)).not.toContainAnyValues(["a", "b", "c"]);
		expect(new Set(placed.map((element) => element.id))).toHaveLength(3);
		expect([shape.x, shape.y]).toEqual([0, 0]);
		expect([arrow.x, arrow.y]).toEqual([20, 60]);
		expect(arrow.type).toBe("arrow");
		expect(arrow.startBinding).toMatchObject({ elementId: shape.id, focus: 0 });
		expect(arrow.endBinding).toMatchObject({ elementId: shape.id, focus: 1 });
		expect(arrow.start).toBeUndefined();
		expect(arrow.end).toBeUndefined();
		expect(label.containerId).toBe(shape.id);
		expect((shape.groupIds as string[])[0]).toBe((arrow.groupIds as string[])[0]);
		expect((shape.groupIds as string[])[0]).not.toBe("g");
		expect(shape.customData).toMatchObject({ library: { item: "Fixture" } });
		expect(stencil[0]).toMatchObject({ id: "a", x: 500 });
	});
});
