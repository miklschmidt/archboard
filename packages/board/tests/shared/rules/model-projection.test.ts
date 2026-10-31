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

	test("a pair with relationships in both directions draws one line with an arrow at each end", () => {
		const reading = projectModel(model);
		expect(lines(reading)).toEqual(["a>b"]);
		expect(reading.content.edges[0]?.twoWay).toBe(true);
		expect(reading.connections[0]?.joins.map((edge) => edge.id)).toEqual(["one", "two", "back"]);
	});

	test("a line of one kind wears it, and a line of mixed kinds names neither", () => {
		const [joined] = projectModel(model).content.edges;
		expect(joined?.kind).not.toBe("http");
		expect(joined?.kind).not.toBe("event");
		const [shared] = projectModel(model, null, null, { hideKinds: ["event"] }).content.edges;
		expect(shared?.kind).toBe("http");
	});

	test("hiding a kind leaves the relationships of every other kind on their line", () => {
		const reading = projectModel(model, null, null, { hideKinds: ["http"] });
		expect(reading.content.edges[0]).toMatchObject({ id: "two", kind: "event", label: "tell" });
		expect(reading.content.edges[0]).not.toHaveProperty("twoWay");
		expect(reading.connections[0]?.joins.map((edge) => edge.id)).toEqual(["two"]);
		expect(reading.allConnections[0]?.joins.map((edge) => edge.id)).toEqual(["one", "two", "back"]);
	});
});

describe("a relationship between a module and a part that it holds", () => {
	const modules = [
		{ id: "root" },
		{ id: "open", parent: "root" },
		{ id: "near", parent: "open" },
		{ id: "beside", parent: "open" },
		{ id: "far", parent: "near" },
	];
	const relationships = [
		{ id: "down", from: "open", to: "near" },
		{ id: "up", from: "far", to: "open" },
		{ id: "own", from: "open", to: "open" },
		{ id: "from-door", from: "root", to: "near" },
	];
	const model = modelOf(modules, relationships);

	test("draws no line from the open module, near or far, either way, and keeps the others", () => {
		expect(lines(projectModel(model, "open"))).toEqual(["open>open", "root>near"]);
	});

	test("stays in what the panel and About list", () => {
		const listed = projectModel(model, "open").allConnections.flatMap(({ joins }) =>
			joins.map((edge) => edge.id),
		);
		expect(listed.toSorted()).toEqual(["down", "from-door", "own", "up"]);
	});

	test("draws no line in a comparison, in a focus or in an exact view", () => {
		const base = modelOf(modules, [{ id: "own", from: "open", to: "open" }]);
		const compared = projectModel(model, "open", null, {}, base);
		expect(lines(compared)).toEqual(["open>open", "root>near"]);
		expect(compared.held?.edges.map((edge) => edge.id)).toEqual(["own", "from-door"]);
		expect(lines(projectModel(model, "open", ["down"]))).toEqual([]);
		const visibility = { modules: ["open", "near"], relationships: ["down"], flows: [] };
		expect(lines(projectModel(model, "open", null, {}, undefined, visibility))).toEqual([]);
	});
});

describe("two-way lines", () => {
	const reached = [{ id: "open" }, { id: "p", parent: "open" }, { id: "q", parent: "open" }];

	test("distinct comparison states stay separate lines", () => {
		const base = modelOf([{ id: "a" }, { id: "b" }], [{ id: "there", from: "a", to: "b" }]);
		const after = modelOf(
			[{ id: "a" }, { id: "b" }],
			[
				{ id: "there", from: "a", to: "b" },
				{ id: "back", from: "b", to: "a" },
			],
		);
		const reading = projectModel(after, null, null, {}, base);
		expect(lines(reading).toSorted()).toEqual(["a>b", "b>a"]);
		expect(reading.content.edges.some((edge) => edge.twoWay === true)).toBe(false);
	});

	test("a door folds only when both directions end on the same two drawn parts", () => {
		const reading = projectModel(
			modelOf(
				[...reached, { id: "one" }, { id: "both" }],
				[
					{ id: "out", from: "p", to: "one" },
					{ id: "in", from: "one", to: "p" },
					{ id: "from-p", from: "p", to: "both" },
					{ id: "from-q", from: "q", to: "both" },
					{ id: "back", from: "both", to: "q" },
				],
			),
			"open",
		);
		const twoWay = reading.content.edges.filter((edge) => edge.twoWay === true);
		expect(lines(reading).toSorted()).toEqual(["p>both", "p>one", "q>both"]);
		expect(twoWay.map((edge) => `${edge.from}>${edge.to}`).toSorted()).toEqual(["p>one", "q>both"]);
	});
});

describe("the words on a joined line", () => {
	const closed = (card: string, parts: string[]) => [
		{ id: card },
		...parts.map((id) => ({ id, name: `the ${id}`, parent: card })),
	];
	const model = modelOf(
		[
			...closed("user", []),
			...closed("store", ["s1", "s2", "s3", "s4"]),
			...closed("worker", ["w1", "w2", "w3"]),
			...closed("sink", []),
			...closed("loud", []),
			...closed("quiet", []),
			...closed("bare", []),
			...closed("void", []),
			...closed("reader", []),
		],
		[
			{ id: "shared-1", from: "reader", to: "s1", label: "reads" },
			{ id: "shared-2", from: "reader", to: "s2", label: "reads" },
			{ id: "to-1", from: "user", to: "s1", label: "one" },
			{ id: "to-2", from: "user", to: "s3", label: "two" },
			{ id: "to-3", from: "user", to: "s3" },
			{ id: "to-4", from: "user", to: "s2" },
			{ id: "to-5", from: "user", to: "s4" },
			{ id: "from-1", from: "w1", to: "sink", label: "one" },
			{ id: "from-2", from: "w3", to: "sink" },
			{ id: "labels-1", from: "loud", to: "quiet", label: "first" },
			{ id: "labels-2", from: "loud", to: "quiet", label: "second" },
			{ id: "labels-3", from: "loud", to: "quiet", label: "third" },
			{ id: "labels-4", from: "loud", to: "quiet", label: "first" },
			{ id: "plain-1", from: "bare", to: "void" },
			{ id: "plain-2", from: "bare", to: "void" },
		],
	);

	test("say the one shared label, then the parts reached, then the first label", () => {
		const said = new Map(
			projectModel(model).content.edges.map((edge) => [`${edge.from}>${edge.to}`, edge.label]),
		);
		expect(said.get("reader>store")).toBe("reads");
		expect(said.get("user>store")).toBe("to the s3, the s1 +2");
		expect(said.get("worker>sink")).toBe("from the w1, the w3");
		expect(said.get("loud>quiet")).toBe("first +2");
		expect(said.get("bare>void")).toBeUndefined();
	});

	test("on a two-way line, name the card with more parts reached", () => {
		const [line] = projectModel(
			modelOf(
				[...closed("left", ["l1"]), ...closed("right", ["r1", "r2", "r3"])],
				[
					{ id: "there", from: "right", to: "l1", label: "ask" },
					{ id: "back", from: "l1", to: "r1" },
					{ id: "again", from: "l1", to: "r2" },
					{ id: "more", from: "l1", to: "r3" },
				],
			),
		).content.edges;
		expect(line?.label).toBe("with the r1, the r2 +1");
	});

	test("skip an end that the content does not hold", () => {
		const reading = projectModel(
			modelOf(
				[{ id: "a" }, { id: "b" }],
				[
					{ id: "known", from: "a", to: "b", label: "first" },
					{ id: "gone", from: "a", to: "removed", label: "second" },
				],
			),
		);
		expect(reading.connections.map(({ line }) => line.id)).toEqual(["known", "gone"]);
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

	test("a line ends on the part that reaches a door", () => {
		expect(lines(reading).toSorted()).toEqual(["other>shared", "part>lone", "part>shared"]);
		const single = reading.content.edges.find((edge) => edge.id === "single");
		expect(single?.label).toBe("words");
	});

	test("a relationship authored on the open module ends on its frame", () => {
		const own = modelOf(
			[{ id: "open" }, { id: "part", parent: "open" }, { id: "door" }],
			[{ id: "self", from: "open", to: "door" }],
		);
		expect(lines(projectModel(own, "open"))).toEqual(["open>door"]);
	});

	test("lines to one door of one kind keep their words", () => {
		const many = modelOf(
			[{ id: "open" }, ...["a", "b", "c"].map((id) => ({ id, parent: "open" })), { id: "door" }],
			["a", "b", "c"].map((from) => ({ id: from, from, to: "door", label: "reads" })),
		);
		expect(projectModel(many, "open").content.edges.map((edge) => edge.label)).toEqual([
			"reads",
			"reads",
			"reads",
		]);
	});
});

test("a crowded picture draws every relationship", () => {
	const parts = Array.from({ length: 8 }, (_, index) => ({ id: `p${index}` }));
	const edges = parts.flatMap((from, start) =>
		parts.slice(start + 1).map((to) => ({ id: `${from.id}-${to.id}`, from: from.id, to: to.id })),
	);
	expect(projectModel(modelOf(parts, edges)).content.edges).toHaveLength(edges.length);
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
