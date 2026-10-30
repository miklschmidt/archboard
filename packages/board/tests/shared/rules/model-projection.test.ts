import { describe, expect, test } from "bun:test";
import { projectModel, type Model } from "#shared/rules/model-projection.ts";

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
			kind: "call",
			emphasis: "normal",
			order,
			...edge,
		})),
		collections: [],
	} as unknown as Model;
}

const binding = (path: string) => ({ repo: "github.com/acme/shop", path });

/**
 * The lines a reading draws, as their two ends.
 * @param projection The reading.
 * @returns One `from>to` for each line.
 */
function lines(projection: ReturnType<typeof projectModel>): string[] {
	return projection.content.edges.map((edge) => `${edge.from}>${edge.to}`);
}

describe("lines", () => {
	const model = modelOf(
		[{ id: "a" }, { id: "b" }],
		[
			{ id: "one", from: "a", to: "b", kind: "http", label: "ask" },
			{ id: "two", from: "a", to: "b", kind: "event", label: "tell" },
			{ id: "back", from: "b", to: "a", kind: "http", label: "answer" },
		],
	);

	test("one line joins a directed pair, and a reciprocal pair keeps two", () => {
		expect(lines(projectModel(model)).toSorted()).toEqual(["a>b", "b>a"]);
	});

	test("a line of one kind wears it, and a line of mixed kinds names neither", () => {
		const [joined, lone] = projectModel(model).content.edges;
		expect(lone).toMatchObject({ kind: "http", label: "answer" });
		expect(joined?.kind).not.toBe("http");
		expect(joined?.kind).not.toBe("event");
		expect(joined?.label).toBeUndefined();
		expect(projectModel(model).connections[0]?.joins.map((edge) => edge.id)).toEqual([
			"one",
			"two",
		]);
	});

	test("hiding a kind leaves the relationships of every other kind on their line", () => {
		const reading = projectModel(model, null, null, { hideKinds: ["event"] });
		expect(reading.content.edges[0]).toMatchObject({ id: "one", kind: "http", label: "ask" });
		expect(reading.connections[0]?.joins.map((edge) => edge.id)).toEqual(["one"]);
		expect(reading.allConnections[0]?.joins.map((edge) => edge.id)).toEqual(["one", "two"]);
	});
});

describe("doors", () => {
	const model = modelOf(
		[
			{ id: "open" },
			{ id: "part", parent: "open", binding: binding("src/part.ts") },
			{ id: "other", parent: "open" },
			{ id: "inner", parent: "part" },
			{ id: "lone", responsibility: "Reached by one part", binding: binding("src/lone.ts") },
			{ id: "shared", responsibility: "Reached by two parts" },
		],
		[
			{ id: "single", from: "inner", to: "lone", label: "words" },
			{ id: "first", from: "part", to: "shared" },
			{ id: "second", from: "other", to: "shared" },
			{ id: "answer", from: "shared", to: "other" },
		],
	);
	const reading = projectModel(model, "open");

	test("a door is a card with a name only", () => {
		const door = reading.content.nodes.find((node) => node.id === "lone");
		expect(door).toMatchObject({ name: "lone" });
		expect(door?.responsibility).toBeUndefined();
		expect(door).not.toHaveProperty("codePath");
	});

	test("a line ends on the one part that reaches a door, otherwise on the frame", () => {
		expect(lines(reading).toSorted()).toEqual(["open>shared", "part>lone", "shared>other"]);
		const single = reading.content.edges.find((edge) => edge.id === "single");
		expect(single?.label).toBe("words");
	});

	test("a line on the frame keeps every relationship with its authored ends", () => {
		const onFrame = reading.connections.find(({ line }) => line.from === "open");
		expect(onFrame?.joins.map((edge) => edge.from)).toEqual(["part", "other"]);
	});
});

describe("a crowded picture", () => {
	const parts = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}` }));
	const chain = parts.slice(1).map((part, index) => ({
		id: `step${index}`,
		from: `p${index}`,
		to: part.id,
	}));
	const shortcuts = parts.flatMap((from, start) =>
		parts.slice(start + 2).map((to) => ({ id: `${from.id}-${to.id}`, from: from.id, to: to.id })),
	);
	const model = modelOf(parts, [...chain, ...shortcuts]);

	test("keeps its lines at the budget", () => {
		const small = modelOf(parts, [...chain, ...shortcuts.slice(0, 11)]);
		expect(projectModel(small).connections).toHaveLength(18);
		expect(projectModel(small).implied).toEqual([]);
	});

	test("above the budget, drops the lines that its paths imply, and counts them", () => {
		const reading = projectModel(model);
		expect(lines(reading)).toEqual(chain.map((edge) => `${edge.from}>${edge.to}`));
		expect(reading.implied).toHaveLength(shortcuts.length);
		expect(reading.listed).toHaveLength(chain.length + shortcuts.length);
	});

	test("no connected part loses its last line", () => {
		const ring = parts.flatMap((from, start) =>
			parts.flatMap((to, end) =>
				start === end ? [] : [{ id: `${from.id}-${to.id}`, from: from.id, to: to.id }],
			),
		);
		const reading = projectModel(modelOf(parts, ring));
		const connected = new Set(reading.connections.flatMap(({ line }) => [line.from, line.to]));
		expect(connected.size).toBe(parts.length);
	});

	test("of two lines that imply each other, the weaker leaves", () => {
		const filler = Array.from({ length: 20 }, (_, index) => ({
			id: `filler${index}`,
			from: `x${index}`,
			to: `y${index}`,
		}));
		const cards = [...new Set(filler.flatMap((edge) => [edge.from, edge.to]))].map((id) => ({
			id,
		}));
		const reading = projectModel(
			modelOf(
				[...cards, { id: "s" }, { id: "t" }, { id: "u" }],
				[
					{ id: "weak", from: "s", to: "t" },
					{ id: "strong", from: "s", to: "u" },
					{ id: "stronger", from: "s", to: "u" },
					{ id: "there", from: "t", to: "u" },
					{ id: "back", from: "u", to: "t" },
					...filler,
				],
			),
		);
		expect(reading.implied.map(({ line }) => line.id)).toEqual(["weak"]);
	});

	test("one control draws every line again", () => {
		const reading = projectModel(model, null, null, { everyLine: true });
		expect(reading.content.edges).toHaveLength(chain.length + shortcuts.length);
		expect(reading.implied).toHaveLength(shortcuts.length);
	});

	test("a door keeps its line", () => {
		const held = parts.map((part) => ({ ...part, parent: "open" }));
		const door = { id: "door", from: "p0", to: "outside" };
		const reading = projectModel(
			modelOf([{ id: "open" }, { id: "outside" }, ...held], [...chain, ...shortcuts, door]),
			"open",
		);
		expect(lines(reading)).toContain("p0>outside");
	});

	test("a comparison keeps a changed line in the picture", () => {
		const base = modelOf(parts, chain);
		const after = { ...model, comparison: undefined } as Model;
		const reading = projectModel(after, null, null, {}, base);
		expect(reading.content.edges).toHaveLength(chain.length + shortcuts.length);
		expect(reading.implied).toEqual([]);
	});
});

test("group regions stay off until a reader turns one on", () => {
	const model = modelOf([{ id: "a", groups: ["edge", "core"] }], []);
	expect(projectModel(model).content.nodes[0]?.groups).toEqual([]);
	const shown = projectModel(model, null, null, { showGroups: ["core"] });
	expect(shown.content.nodes[0]?.groups).toEqual(["core"]);
});

/**
 * The code path that a root reading draws on one card.
 * @param model The reading.
 * @param id The card.
 * @returns Its path row.
 */
function drawnPath(model: Model, id: string): string | undefined {
	return projectModel(model).content.nodes.find((node) => node.id === id)?.codePath;
}

describe("code paths", () => {
	test("a binding shows as written, and stays out of what a picture holds", () => {
		const model = modelOf([{ id: "a", binding: binding("apps/web/src/main.tsx") }], []);
		expect(drawnPath(model, "a")).toBe("apps/web/src/main.tsx");
		expect(projectModel(model).content.nodes[0]).not.toHaveProperty("binding");
	});

	test("an unbound container shows the folder its parts share, with a count", () => {
		const model = modelOf(
			[
				{ id: "ui" },
				{ id: "one", parent: "ui", binding: binding("apps/web/src/ui/a.ts") },
				{ id: "two", parent: "ui" },
				{ id: "three", parent: "two", binding: binding("apps/web/src/ui/rules/b.ts") },
				{ id: "again", parent: "two", binding: binding("apps/web/src/ui/rules/b.ts") },
			],
			[],
		);
		expect(drawnPath(model, "ui")).toBe("apps/web/src/ui · 2 paths");
	});

	test("a container whose parts share no folder shows the count alone", () => {
		const model = modelOf(
			[
				{ id: "wide" },
				{ id: "one", parent: "wide", binding: binding("apps/a.ts") },
				{ id: "two", parent: "wide", binding: binding("packages/b.ts") },
			],
			[],
		);
		expect(drawnPath(model, "wide")).toBe("2 paths");
	});

	test("an external module and an unbound leaf show no path", () => {
		const model = modelOf(
			[{ id: "vendor", kind: "external", binding: binding("vendor/x") }, { id: "leaf" }],
			[],
		);
		expect(drawnPath(model, "vendor")).toBeUndefined();
		expect(drawnPath(model, "leaf")).toBeUndefined();
	});
});

describe("a chain of modules with one part each", () => {
	const model = modelOf(
		[
			{ id: "top" },
			{ id: "middle", parent: "top" },
			{ id: "end", parent: "middle" },
			{ id: "first", parent: "end" },
			{ id: "second", parent: "end" },
			{ id: "single" },
			{ id: "leaf", parent: "single" },
		],
		[],
	);

	test("folds to the module that holds a choice, and the trail keeps each step", () => {
		const reading = projectModel(model, "top");
		expect(reading.opened).toBe("end");
		expect(reading.trail.map((node) => node.id)).toEqual(["top", "middle", "end"]);
		expect(reading.children.map((node) => node.id)).toEqual(["first", "second"]);
	});

	test("stops at a part with nothing to open", () => {
		expect(projectModel(model, "single").opened).toBe("single");
	});

	test("leaves a focus where it is", () => {
		expect(projectModel(model, "top", ["first"]).opened).toBe("top");
	});
});

describe("focus", () => {
	const model = modelOf(
		[
			{ id: "system" },
			{ id: "a", parent: "system", responsibility: "Focused", binding: binding("src/a.ts") },
			{ id: "b", parent: "system" },
			{ id: "c", parent: "system", responsibility: "A neighbour" },
		],
		[
			{ id: "between", from: "a", to: "b" },
			{ id: "out", from: "a", to: "c" },
			{ id: "beside", from: "b", to: "c" },
		],
	);
	const reading = projectModel(model, null, ["a", "b"]);

	test("draws exactly the focused subjects, without their containers", () => {
		expect(reading.children.map((node) => node.id)).toEqual(["a", "b"]);
		expect(reading.content.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
		expect(reading.content.nodes.find((node) => node.id === "a")).not.toHaveProperty("parent");
	});

	test("makes the rest doors", () => {
		expect(reading.context.map((node) => node.id)).toEqual(["c"]);
		expect(reading.content.nodes.find((node) => node.id === "c")?.responsibility).toBeUndefined();
	});

	test("draws a line to a door from each focused subject that reaches it", () => {
		expect(lines(reading).toSorted()).toEqual(["a>b", "a>c", "b>c"]);
	});
});
