import { describe, expect, test } from "bun:test";
import { overviewLines, scopedContent } from "#shared/rules/scope.ts";
import { VariantContentSchema, type VariantContent } from "#shared/schemas/content.ts";
import { withFixtureOrders } from "#tests/shared/support/fixture-orders.ts";

/**
 * A variant's content, as a document holds it.
 * @param stated What is on it.
 * @returns The parsed content.
 */
const content = (stated: Record<string, unknown>): VariantContent =>
	VariantContentSchema.parse(withFixtureOrders(stated));

const PLATFORM = { id: "pl", name: "Platform", kind: "service" };
const GATEWAY = { id: "gw", name: "Gateway", kind: "module", parent: "pl" };
const LEDGER = { id: "ld", name: "Ledger", kind: "service" };

// Two ways the gateway reaches the ledger: directly, and through a queue.
const DIRECT = { id: "e1", from: "gw", to: "ld", kind: "call", label: "posts" };
const QUEUED = { id: "e2", from: "gw", to: "ld", kind: "queue", label: "retries" };

const BOARD = content({ nodes: [PLATFORM, GATEWAY, LEDGER], edges: [DIRECT, QUEUED] });

describe("what a view shows", () => {
	test("naming one relationship shows that relationship and not the other one beside it", () => {
		const shown = scopedContent(BOARD, { kind: "selection", nodes: [], edges: ["e1"], flows: [] });
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e1"]);
		// Both its ends are there, and the container the near end sits inside.
		expect(shown.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "ld", "pl"]);
	});

	test("naming no relationship shows every one between the nodes it kept", () => {
		const shown = scopedContent(BOARD, {
			kind: "selection",
			nodes: ["gw", "ld"],
			edges: [],
			flows: [],
		});
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e1", "e2"]);
	});

	test("a relationship with an end the view does not keep is not drawn", () => {
		const shown = scopedContent(BOARD, { kind: "selection", nodes: ["ld"], edges: [], flows: [] });
		expect(shown.edges).toEqual([]);
		expect(shown.nodes.map((node) => node.id)).toEqual(["ld"]);
	});

	test("a named relationship whose ends are not named still brings them, with their containers", () => {
		const shown = scopedContent(BOARD, { kind: "selection", nodes: [], edges: ["e2"], flows: [] });
		expect(shown.nodes.map((node) => node.id)).toEqual(["pl", "gw", "ld"]);
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e2"]);
	});

	test("draws no container that holds every part the view asked for", () => {
		const ROUTER = { id: "rt", name: "Router", kind: "function", parent: "gw" };
		const AUDIT = { id: "au", name: "Audit", kind: "function", parent: "gw" };
		const nested = content({ nodes: [PLATFORM, GATEWAY, ROUTER, AUDIT, LEDGER] });
		const shown = scopedContent(nested, {
			kind: "selection",
			nodes: ["rt", "au"],
			edges: [],
			flows: [],
		});
		expect(shown.nodes.map((node) => [node.id, node.parent])).toEqual([
			["rt", undefined],
			["au", undefined],
		]);
		// A container that separates one asked-for part from another is drawn.
		const across = scopedContent(nested, {
			kind: "selection",
			nodes: ["rt", "ld"],
			edges: [],
			flows: [],
		});
		expect(across.nodes.map((node) => node.id)).toEqual(["pl", "gw", "rt", "ld"]);
	});

	test("a view of everything is the variant itself, relationships and all", () => {
		expect(scopedContent(BOARD, { kind: "all" })).toBe(BOARD);
	});
});

describe("a flow a view selects", () => {
	const WITH_FLOW = content({
		nodes: [PLATFORM, GATEWAY, LEDGER],
		edges: [DIRECT, QUEUED],
		flows: [
			{
				id: "f1",
				name: "Posting",
				participants: ["gw", "ld"],
				steps: [{ id: "s1", from: "gw", to: "ld", label: "post" }],
			},
		],
	});

	test("brings every node it names, and no relationship it did not ask for", () => {
		const shown = scopedContent(WITH_FLOW, {
			kind: "selection",
			nodes: [],
			edges: ["e1"],
			flows: ["f1"],
		});
		expect(shown.flows.map((flow) => flow.id)).toEqual(["f1"]);
		expect(shown.nodes.map((node) => node.id).toSorted()).toEqual(["gw", "ld", "pl"]);
		expect(shown.edges.map((edge) => edge.id)).toEqual(["e1"]);
	});

	test("a flow the view did not select is not drawn even when all its nodes survive", () => {
		const shown = scopedContent(WITH_FLOW, {
			kind: "selection",
			nodes: ["gw", "ld"],
			edges: [],
			flows: [],
		});
		expect(shown.flows).toEqual([]);
	});
});

describe("the overview a board opens on", () => {
	// A service whose gateway holds a router, and a ledger beside it.
	const ROUTER = { id: "rt", name: "Router", kind: "function", parent: "gw" };
	const AUDIT = { id: "au", name: "Audit", kind: "function", parent: "gw" };
	const DEEP = content({
		nodes: [PLATFORM, GATEWAY, ROUTER, AUDIT, LEDGER],
		edges: [
			{ id: "e1", from: "rt", to: "ld", kind: "call", label: "posts" },
			{ id: "e2", from: "au", to: "ld", kind: "queue", label: "records" },
			{ id: "e3", from: "gw", to: "ld", kind: "queue", label: "retries" },
			{ id: "e4", from: "rt", to: "au", kind: "call", label: "logs" },
		],
		flows: [
			{
				id: "f1",
				name: "Posting",
				participants: ["rt", "ld"],
				steps: [{ id: "s1", from: "rt", to: "ld", label: "post" }],
			},
		],
	});
	const overview = scopedContent(DEEP, { kind: "overview" });

	test("draws the root parts with every container closed", () => {
		expect(overview.nodes.map((node) => node.id)).toEqual(["pl", "ld"]);
	});

	test("joins every relationship between two drawn parts into one line of the commonest kind", () => {
		expect(overview.edges).toHaveLength(1);
		expect(overview.edges[0]).toMatchObject({ id: "e1", from: "pl", to: "ld", kind: "queue" });
	});

	test("stacks the labels of a joined line's relationships, each once, in board order", () => {
		const calls = content({
			nodes: [PLATFORM, GATEWAY, ROUTER, AUDIT, LEDGER],
			edges: [
				{
					id: "e1",
					from: "rt",
					to: "ld",
					kind: "call",
					label: "posts",
					description: "Posts one entry.",
					emphasis: "hero",
					traffic: {},
					anchor: { repo: "shop", path: "router.ts", symbol: "post" },
				},
				{ id: "e2", from: "au", to: "ld", kind: "call", label: "records" },
				{ id: "e3", from: "gw", to: "ld", kind: "call" },
				{ id: "e4", from: "au", to: "ld", kind: "call", label: "posts" },
			],
		});
		const [line] = scopedContent(calls, { kind: "overview" }).edges;
		// What only the first relationship says is not said of the line.
		expect(line).toEqual({
			id: "e1",
			order: calls.edges[0]!.order,
			from: "pl",
			to: "ld",
			kind: "call",
			label: "posts\nrecords",
			emphasis: "normal",
		});
	});

	test("draws a joined line of unlabelled relationships without a label", () => {
		const bare = content({
			nodes: [PLATFORM, GATEWAY, ROUTER, LEDGER],
			edges: [
				{ id: "e1", from: "rt", to: "ld", kind: "call" },
				{ id: "e2", from: "gw", to: "ld", kind: "call" },
			],
		});
		expect(scopedContent(bare, { kind: "overview" }).edges[0]?.label).toBeUndefined();
	});

	test("names the relationships each joined line stands for, as they were stated", () => {
		const [line] = overviewLines(DEEP);
		expect(line?.line.id).toBe("e1");
		expect(line?.joins).toEqual([DEEP.edges[0]!, DEEP.edges[1]!, DEEP.edges[2]!]);
	});

	test("draws no relationship inside a closed card, and no flow", () => {
		expect(overview.edges.some((edge) => edge.id === "e4")).toBe(false);
		expect(overview.flows).toEqual([]);
	});

	test("draws no relationship between a container and a part it holds", () => {
		const held = content({
			nodes: [PLATFORM, GATEWAY, ROUTER, LEDGER],
			edges: [
				{ id: "e1", from: "pl", to: "rt", kind: "call", label: "mounts" },
				{ id: "e2", from: "gw", to: "pl", kind: "call", label: "reports" },
			],
		});
		expect(scopedContent(held, { kind: "overview" }).edges).toEqual([]);
	});

	test("keeps a lone relationship as it was stated", () => {
		const lone = content({
			nodes: [PLATFORM, GATEWAY, ROUTER, LEDGER],
			edges: [{ id: "e1", from: "rt", to: "ld", kind: "call", label: "posts" }],
		});
		expect(scopedContent(lone, { kind: "overview" }).edges).toEqual([
			{ ...lone.edges[0]!, from: "pl" },
		]);
	});
});
