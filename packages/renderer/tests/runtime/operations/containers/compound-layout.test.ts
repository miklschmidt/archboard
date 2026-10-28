import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import nearMiss from "#tests/runtime/support/fixtures/near-miss-columns.json";
import { describe, expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import {
	distanceToFrame,
	routeCrosses,
	routeLabels,
	routePoints,
} from "#tests/runtime/support/drawn-routes.ts";
import { headerCards } from "#tests/runtime/support/drawn-parents.ts";
import { expectDrawingIntact } from "#tests/runtime/support/drawing-integrity.ts";
import { headerFoot } from "#tests/runtime/support/drawn-subjects.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const NESTED = orderedFixture({
	nodes: [
		{ id: "outer", name: "System", kind: "service" },
		{ id: "entry", name: "Entry point", kind: "module", parent: "outer" },
		{ id: "inner", name: "Nested service", kind: "service", parent: "outer" },
		{ id: "worker", name: "Worker", kind: "module", parent: "inner" },
		{ id: "sink", name: "Storage", kind: "datastore" },
	],
	edges: [
		{ id: "begin", from: "outer", to: "entry", kind: "call", label: "accept request" },
		{ id: "nested", from: "entry", to: "worker", kind: "call", label: "dispatch work" },
		{ id: "report", from: "worker", to: "inner", kind: "event", label: "report status" },
		{ id: "write", from: "worker", to: "sink", kind: "data", label: "persist result" },
	],
});

describe("compound architecture layout", () => {
	test("boundary routes avoid cards around nested content", async () => {
		const content = orderedFixture({
			nodes: [
				...NESTED.nodes,
				{ id: "added", name: "Additional processing", kind: "module", parent: "inner" },
			],
			edges: [
				...NESTED.edges,
				{ id: "newedge", from: "worker", to: "added", kind: "call" },
				{ id: "newout", from: "added", to: "sink", kind: "call" },
			],
		});
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
		});
		const routes = routePoints(drawing.svg);
		for (const edge of content.edges) {
			for (const id of ["entry", "worker", "added", "sink"]) {
				if (id === edge.from || id === edge.to) continue;
				expect(routeCrosses(routes.get(edge.id)!, drawing.atlas.nodes[id]!)).toBe(false);
			}
		}
	});

	test("ancestor and cross-container routes attach to their own semantic endpoints", async () => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: NESTED,
			theme: "light",
		});
		const routes = routePoints(drawing.svg);
		expect(Object.keys(drawing.atlas.nodes).toSorted()).toEqual(
			NESTED.nodes.map((node) => node.id).toSorted(),
		);
		expect(Object.keys(drawing.atlas.edges).toSorted()).toEqual(
			NESTED.edges.map((edge) => edge.id).toSorted(),
		);
		expect([...routeLabels(drawing.svg).keys()].toSorted()).toEqual(
			NESTED.edges.map((edge) => edge.id).toSorted(),
		);
		for (const edge of NESTED.edges) {
			const points = routes.get(edge.id);
			const endpoints = [
				[points?.[0], edge.from],
				[points?.at(-1), edge.to],
			] as const;
			// A frame and its own descendant connect at the visible title divider;
			// external relationships touch the card or frame outline.
			for (const [point, id] of endpoints) {
				const box = drawing.atlas.nodes[id];
				expect(point).toBeDefined();
				expect(box).toBeDefined();
				if (point === undefined || box === undefined) throw new Error(`Missing endpoint ${id}`);
				const other = id === edge.from ? edge.to : edge.from;
				if (ancestorsOf(other).includes(id)) {
					expect(point.y).toBeCloseTo(headerFoot(drawing.svg, id), 1);
				} else expect(distanceToFrame(point, box)).toBeLessThan(0.02);
				expect(point.x).toBeGreaterThanOrEqual(box.x - 0.02);
				expect(point.x).toBeLessThanOrEqual(box.x + box.width + 0.02);
				expect(point.y).toBeGreaterThanOrEqual(box.y - 0.02);
				expect(point.y).toBeLessThanOrEqual(box.y + box.height + 0.02);
			}
		}
	});

	test("concurrent requests on the layout worker retain deterministic independent drawings", async () => {
		const other = orderedFixture({
			nodes: [{ id: "solo", name: "Another board", kind: "module" }],
		});
		const [first, separate, concurrent] = await Promise.all([
			renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content: NESTED, theme: "light" }),
			renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content: other, theme: "dark" }),
			renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content: NESTED, theme: "light" }),
		]);
		expect(first).toEqual(concurrent);
		expect(Object.keys(separate.atlas.nodes)).toEqual(["solo"]);
		expect(separate.atlas.edges).toEqual({});
		const subsequent = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: NESTED,
			theme: "light",
		});
		expect(subsequent).toEqual(first);
	});
});

/**
 * Every frame a node sits inside, nearest first.
 * @param id The node.
 * @returns Its ancestors' ids.
 */
function ancestorsOf(id: string): string[] {
	const found: string[] = [];
	let at = NESTED.nodes.find((node) => node.id === id)?.parent;
	while (at !== undefined) {
		found.push(at);
		at = NESTED.nodes.find((node) => node.id === at)?.parent;
	}
	return found;
}

// A direct parent relationship names its painted header, not a descendant portal.
test("a container's direct dependency leaves its painted header", async () => {
	const content = orderedFixture({
		nodes: [
			{ id: "frame", name: "Service", kind: "service" },
			{ id: "one", name: "Worker one", kind: "module", parent: "frame" },
			{ id: "two", name: "Worker two", kind: "module", parent: "frame" },
			{ id: "store", name: "Storage", kind: "datastore" },
		],
		edges: [{ id: "write", from: "frame", to: "store", kind: "data" }],
	});
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "blocks",
	});

	const route = routePoints(drawing.svg).get("write")!;
	expect(distanceToFrame(route[0]!, headerCards(drawing).get("frame")!)).toBeLessThan(1);
	expectDrawingIntact(drawing, content, "blocks");
});

// A chain inside a container once stepped sideways a few dozen points per
// card, its lines off both centres and its container that much wider: every
// member was held under the container's title, and each hold passed beside
// the cards above it.
test.each(LayoutEngineSchema.options)(
	"a chain inside a container stands in one column (%s)",
	async (layout) => {
		const stages = ["a", "b", "c", "d"];
		const content = orderedFixture({
			nodes: [
				{ id: "box", name: "Service", kind: "service" },
				...stages.map((id) => ({ id, name: `Stage ${id}`, kind: "module", parent: "box" })),
			],
			edges: stages
				.slice(1)
				.map((to, index) => ({ id: `e${index}`, from: stages[index]!, to, kind: "call" })),
		});
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout,
		});
		const cards = stages.map((id) => drawing.atlas.nodes[id]!);
		expect(new Set(cards.map(({ x }) => x)).size).toBe(1);
		const frame = drawing.atlas.nodes["box"]!;
		// The container keeps no more than its insets beside the column.
		expect(frame.width - cards[0]!.width).toBeLessThanOrEqual(2 * 24);
	},
);

// Reduced from the dogfood Semantic renderer board: a line through its label
// let its two stacked ends stand 9 to 10 points out of one column, so their
// edges almost lined up and the line jogged or sat off both centres. Stacked
// ends stand in one column or clearly apart, never a near miss.
test("stacked cards joined through a label share a column or stand clearly apart", async () => {
	const content = orderedFixture(nearMiss);
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content,
		theme: "light",
		layout: "track",
	});
	const [one, other] = [drawing.atlas.nodes["CtoOMxca"]!, drawing.atlas.nodes["wLF1X11D"]!];
	expect(one.y + one.height).toBeLessThan(other.y);
	const offset = Math.abs(one.x + one.width / 2 - (other.x + other.width / 2));
	expect(offset < 0.05 || offset > 16).toBe(true);
});

// A page kept its placement's slack: under Graphviz a frame's trimmed title
// margin left 52 points above the drawing against 24 below it, and under the
// block engines a frame at the board's edge stood 32 points in on one side.
test.each(LayoutEngineSchema.options)(
	"a %s page keeps the same margin on every side of what it draws",
	async (layout) => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: NESTED,
			theme: "light",
			layout,
		});
		const boxes = [
			...Object.values(drawing.atlas.nodes),
			...routeLabels(drawing.svg).values(),
			...[...routePoints(drawing.svg).values()]
				.flat()
				.map(({ x, y }) => ({ x, y, width: 0, height: 0 })),
		];
		const margins = [
			Math.min(...boxes.map(({ x }) => x)),
			Math.min(...boxes.map(({ y }) => y)),
			drawing.width - Math.max(...boxes.map(({ x, width }) => x + width)),
			drawing.height - Math.max(...boxes.map(({ y, height }) => y + height)),
		];
		for (const margin of margins) expect(Math.abs(margin - margins[0]!)).toBeLessThanOrEqual(2);
	},
);
