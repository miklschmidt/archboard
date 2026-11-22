// Which relationships a reading draws as lines: lines join only relationships of one kind and one
// effect, and the lens, the hidden kinds and the hidden effects choose what draws (TASK-663).

import { describe, expect, test } from "bun:test";
import { projectModel, type Model, type ModelFilters } from "#shared/rules/model-projection.ts";
import { DEFAULT_SEMANTIC_POLICY } from "#shared/schemas/semantic-policy.ts";

type Module = Partial<Model["modules"][number]> & { id: string };
type Relationship = Pick<Model["relationships"][number], "id" | "from" | "to"> &
	Partial<Model["relationships"][number]>;

/**
 * A coherent reading of a small model.
 * @param modules Its modules, with any field the case needs.
 * @param relationships Its relationships, with any field the case needs.
 * @returns The reading that the projection receives.
 */
function modelOf(modules: Module[], relationships: Relationship[]): Model {
	return {
		modules: modules.map((module, order) => ({
			name: module.id,
			kind: "module",
			order,
			...module,
		})),
		relationships: relationships.map((edge, order) => ({
			kind: "sync",
			emphasis: "normal",
			order,
			...edge,
		})),
		collections: [],
		policy: DEFAULT_SEMANTIC_POLICY,
	} as unknown as Model;
}

/**
 * The lines a reading draws, as their two ends.
 * @param projection The reading.
 * @returns One `from>to` for each line.
 */
function lines(projection: ReturnType<typeof projectModel>): string[] {
	return projection.content.edges.map((edge) => `${edge.from}>${edge.to}`);
}

/**
 * The cards a reading draws, by id.
 * @param reading The reading.
 * @returns Their ids.
 */
function cards(reading: ReturnType<typeof projectModel>): string[] {
	return reading.content.nodes.map((node) => node.id);
}

/**
 * Every relationship a reading draws, by id, sorted.
 * @param reading The reading.
 * @returns Their ids.
 */
function drawn(reading: ReturnType<typeof projectModel>): string[] {
	return reading.connections.flatMap(({ joins }) => joins.map((edge) => edge.id)).toSorted();
}

/**
 * The relationships each drawn line joins, by id.
 * @param reading The reading.
 * @returns One list of ids for each line.
 */
function joinedIds(reading: ReturnType<typeof projectModel>): string[][] {
	return reading.connections.map(({ joins: edges }) => edges.map((edge) => edge.id));
}

describe("lines", () => {
	const model = modelOf(
		[{ id: "a" }, { id: "b" }],
		[
			{ id: "one", from: "a", to: "b", kind: "http", effect: "query", label: "ask" },
			{ id: "two", from: "a", to: "b", kind: "event", effect: "mutation", label: "tell" },
			{ id: "back", from: "b", to: "a", kind: "http", effect: "query", label: "answer" },
			{ id: "save", from: "a", to: "b", kind: "http", effect: "mutation", label: "save" },
		],
	);
	test("relationships of one kind and one effect join one line, with an arrow at each end when they run both ways", () => {
		const reading = projectModel(model, null, null, { lens: "all" });
		expect(joinedIds(reading)).toEqual([["one", "back"], ["two"], ["save"]]);
		expect(reading.content.edges.map((edge) => edge.twoWay ?? false)).toEqual([true, false, false]);
	});

	test("relationships that differ in kind or effect draw as separate lines, each wearing its own", () => {
		const reading = projectModel(model, null, null, { lens: "all" });
		expect(lines(reading)).toEqual(["a>b", "a>b", "a>b"]);
		expect(reading.content.edges.map((edge) => [edge.kind, edge.effect])).toEqual([
			["http", "query"],
			["event", "mutation"],
			["http", "mutation"],
		]);
	});

	test("hiding a kind or an effect takes off its lines and leaves the others whole", () => {
		const reading = projectModel(model, null, null, { lens: "all", hideKinds: ["http"] });
		expect(joinedIds(reading)).toEqual([["two"]]);
		expect(reading.allConnections.map(({ joins: edges }) => edges.length)).toEqual([2, 1, 1]);
		const effects = projectModel(model, null, null, { lens: "all", hideEffects: ["mutation"] });
		expect(joinedIds(effects)).toEqual([["one", "back"]]);
		expect(effects.leftOut).toBe(2);
	});
});

describe("a hidden kind", () => {
	const model = modelOf(
		[
			{ id: "system" },
			{ id: "a", parent: "system" },
			{ id: "b", parent: "system" },
			{ id: "c", parent: "system" },
			{ id: "alone", parent: "system" },
		],
		[
			{ id: "ask", from: "a", to: "b", kind: "http" },
			{ id: "tell", from: "b", to: "c", kind: "event" },
		],
	);

	test("takes off the cards that drew only its lines, and keeps a card that never drew one", () => {
		const reading = projectModel(model, "system", null, { hideKinds: ["event"] });
		expect(cards(reading)).toEqual(["system", "a", "b", "alone"]);
		expect(reading.children.map((node) => node.id)).toEqual(["a", "b", "alone"]);
	});

	test("leaves the subjects of a focus, which the reader named", () => {
		const reading = projectModel(model, "system", ["a", "b", "c"], { hideKinds: ["event"] });
		expect(cards(reading)).toEqual(["a", "b", "c"]);
	});
});

describe("a lens", () => {
	const model = modelOf(
		[
			{ id: "system" },
			{ id: "a", parent: "system" },
			{ id: "b", parent: "system" },
			{ id: "c", parent: "system" },
			{ id: "d", parent: "system" },
			{ id: "outside" },
		],
		[
			{ id: "write", from: "a", to: "b", kind: "sync", effect: "mutation" },
			{ id: "read", from: "a", to: "c", kind: "async", effect: "query" },
			{ id: "sum", from: "c", to: "d", kind: "sync", effect: "compute" },
			{ id: "fetch", from: "b", to: "c", kind: "http", effect: "query" },
			{ id: "needs", from: "d", to: "outside", kind: "dependency" },
			{ id: "tell", from: "b", to: "d", kind: "event", effect: "mutation" },
		],
	);
	const read = (lens?: string, hideKinds?: string[], hideEffects?: ModelFilters["hideEffects"]) =>
		projectModel(model, "system", null, { lens, hideKinds, hideEffects });

	test.each([
		["main", ["fetch", "tell", "write"], ["a", "b", "c", "d"]],
		["effects", ["tell", "write"], ["a", "b", "d"]],
		["sync-compute", ["sum"], ["c", "d"]],
		["network", ["fetch", "tell"], ["b", "c", "d"]],
		["reads", ["fetch", "read"], ["a", "b", "c"]],
		["dependencies", ["needs"], ["d"]],
		["all", ["fetch", "needs", "read", "sum", "tell", "write"], ["a", "b", "c", "d"]],
	])(
		"%s draws what its definition shows, and takes off the parts it left no line",
		(lens, ids, parts) => {
			const reading = read(lens);
			expect(drawn(reading)).toEqual(ids);
			expect(reading.children.map((node) => node.id)).toEqual(parts);
			expect(reading.lens.id).toBe(lens);
			expect(reading.leftOut).toBe(6 - ids.length);
		},
	);

	test("the default lens is main, and a lens the policy lacks reads as the default", () => {
		expect(read().lens).toEqual({ id: "main", name: "Main lines" });
		expect(read("nowhere").lens.id).toBe("main");
	});

	test("a hidden kind subtracts from the lens and counts among the lines left out", () => {
		const reading = read("main", ["event"]);
		expect(drawn(reading)).toEqual(["fetch", "write"]);
		expect(reading.leftOut).toBe(4);
		expect(reading.children.map((node) => node.id)).toEqual(["a", "b", "c"]);
	});

	test("the built-in lenses are offered in their order", () => {
		expect(Object.keys(DEFAULT_SEMANTIC_POLICY.lenses)).toEqual([
			"main",
			"effects",
			"sync-compute",
			"network",
			"reads",
			"dependencies",
			"all",
		]);
		expect(DEFAULT_SEMANTIC_POLICY.lenses["effects"]?.name).toBe("Side effects");
	});

	test("a hidden effect subtracts from the lens, and declared hides a dependency that states none", () => {
		expect(drawn(read("all", undefined, ["query", "declared"]))).toEqual(["sum", "tell", "write"]);
		expect(read("all", undefined, ["query", "declared"]).leftOut).toBe(3);
	});

	test("an old address that hides call hides sync and async", () => {
		expect(drawn(read("all", ["call"]))).toEqual(["fetch", "needs", "tell"]);
	});

	test("the default lens gives way to every relationship where it would draw no line", () => {
		const computing = modelOf(
			[{ id: "system" }, { id: "a", parent: "system" }, { id: "b", parent: "system" }],
			[
				{ id: "read", from: "a", to: "b", kind: "sync", effect: "query" },
				{ id: "sum", from: "b", to: "a", kind: "async", effect: "compute" },
			],
		);
		const fallen = projectModel(computing, "system");
		expect(fallen.lens.id).toBe("all");
		expect(fallen.emptyLens).toEqual({ id: "main", name: "Main lines" });
		expect(drawn(fallen)).toEqual(["read", "sum"]);
		expect(fallen.leftOut).toBe(0);
		const named = projectModel(computing, "system", null, { lens: "main" });
		expect(named.lens.id).toBe("main");
		expect(named.emptyLens).toBeUndefined();
		expect(named.connections).toHaveLength(0);
		expect(named.leftOut).toBe(2);
		const bare = projectModel(
			modelOf([{ id: "system" }, { id: "a", parent: "system" }], []),
			"system",
		);
		expect(bare.lens.id).toBe("main");
		expect(bare.emptyLens).toBeUndefined();
	});

	test("a focus is read through the lens too", () => {
		const reading = projectModel(model, "system", ["a", "b", "c"], { lens: "reads" });
		expect(drawn(reading)).toEqual(["fetch", "read"]);
		expect(reading.leftOut).toBe(3);
	});
});
