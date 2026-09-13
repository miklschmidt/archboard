import { describe, expect, test } from "bun:test";
import type { DiagramBox, DiagramTheme } from "@/shared/semantic-board/index";
import {
	renderArchitecture,
	SemanticRenderError,
	type RenderedDiagram,
} from "@/runtime/semantic-renderer/index";
import {
	drawnSpan,
	drawnWidth,
	drawnTexts,
	labelPlates,
	registeredFaces,
	spanFits,
} from "@/runtime/semantic-renderer/tests/drawn-text";
import {
	distanceToFrame,
	routeCrosses,
	routeEnds,
	routePoints,
} from "@/runtime/semantic-renderer/tests/drawn-routes";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";

/**
 * One architecture, as its own contract reads it.
 *
 * Written through the schema rather than as a literal, so that a test says what
 * an architecture means and nothing about what else a variant happens to carry.
 * @param nodes The nodes.
 * @param edges The relationships between them.
 * @returns The content.
 */
function architecture(nodes: readonly unknown[], edges: readonly unknown[] = []): VariantContent {
	return VariantContentSchema.parse({ nodes, edges });
}

const SAMPLE: VariantContent = architecture(
	[
		{ id: "edge", name: "Edge", kind: "service", responsibility: "Public entry points" },
		{ id: "gw", name: "API Gateway", kind: "route", parent: "edge" },
		{
			id: "web",
			name: "Operator Console",
			kind: "ui",
			responsibility: "The canvas",
			parent: "edge",
		},
		{ id: "core", name: "Board Runtime", kind: "service" },
		{ id: "io", name: "board-io", kind: "module", parent: "core" },
		{ id: "lease", name: "Write Lease", kind: "module", parent: "core" },
		{ id: "store", name: "Storage", kind: "datastore" },
		{ id: "vault", name: "Vault", kind: "datastore", parent: "store" },
		{ id: "solo", name: "Codex app-server", kind: "external" },
	],
	[
		{ id: "e1", from: "web", to: "gw", kind: "http", label: "REST", emphasis: "normal" },
		{ id: "e2", from: "gw", to: "io", kind: "call", label: "read board", emphasis: "hero" },
		{ id: "e3", from: "gw", to: "lease", kind: "call", emphasis: "normal" },
		{ id: "e4", from: "io", to: "vault", kind: "data", label: "atomic write", emphasis: "hero" },
		{ id: "e5", from: "lease", to: "vault", kind: "data", emphasis: "muted" },
		{ id: "e6", from: "solo", to: "gw", kind: "event", label: "agent edit", emphasis: "normal" },
		{
			id: "e7",
			from: "core",
			to: "store",
			kind: "dependency",
			label: "persists to",
			emphasis: "normal",
		},
	],
);

/**
 * Render the sample, or a variation of it.
 * @param content What to draw.
 * @param theme Which ground to draw it on.
 * @returns The rendered architecture.
 */
function render(content: VariantContent = SAMPLE, theme: DiagramTheme = "light"): RenderedDiagram {
	return renderArchitecture({ content, theme });
}

/**
 * The atlas box of whichever subject a piece of drawn text belongs to.
 * @param rendered The rendered architecture.
 * @param subject Which subject.
 * @returns Its box, or undefined when the atlas does not know it.
 */
function boxOf(
	rendered: RenderedDiagram,
	subject: { kind: string; id: string },
): DiagramBox | undefined {
	if (subject.kind === "node") {
		return rendered.atlas.nodes[subject.id];
	}
	if (subject.kind === "edge") {
		return rendered.atlas.edges[subject.id];
	}
	return rendered.atlas.regions[subject.id];
}

/**
 * Whether one box sits wholly inside another, allowing a hair of rounding.
 * @param inner The box that should be inside.
 * @param outer The box that should contain it.
 * @returns True when it does.
 */
function within(inner: DiagramBox, outer: DiagramBox): boolean {
	const slack = 0.01;
	return (
		inner.x >= outer.x - slack &&
		inner.y >= outer.y - slack &&
		inner.x + inner.width <= outer.x + outer.width + slack &&
		inner.y + inner.height <= outer.y + outer.height + slack
	);
}

describe("renderArchitecture", () => {
	test("the same content and theme produce the same bytes", () => {
		expect(render().svg).toBe(render().svg);
	});

	test("content that differs semantically renders differently", () => {
		const renamed: VariantContent = {
			...SAMPLE,
			nodes: SAMPLE.nodes.map((node) =>
				node.id === "io" ? { ...node, name: "board-notes" } : node,
			),
		};
		expect(render(renamed).svg).not.toBe(render().svg);

		const unlinked: VariantContent = {
			...SAMPLE,
			edges: SAMPLE.edges.filter((edge) => edge.id !== "e5"),
		};
		expect(render(unlinked).svg).not.toBe(render().svg);
	});

	test("every node and every edge lands somewhere on the page", () => {
		const rendered = render();
		const page: DiagramBox = { x: 0, y: 0, width: rendered.width, height: rendered.height };

		for (const node of SAMPLE.nodes) {
			const box = rendered.atlas.nodes[node.id];
			expect(box).toBeDefined();
			expect(box!.width).toBeGreaterThan(0);
			expect(box!.height).toBeGreaterThan(0);
			expect(within(box!, page)).toBe(true);
		}

		for (const edge of SAMPLE.edges) {
			const box = rendered.atlas.edges[edge.id];
			expect(box).toBeDefined();
			expect(box!.width).toBeGreaterThan(0);
			expect(box!.height).toBeGreaterThan(0);
			expect(within(box!, page)).toBe(true);
		}
	});

	test("a container's children are drawn inside its region", () => {
		const rendered = render();
		expect(Object.keys(rendered.atlas.regions).toSorted()).toEqual(["core", "edge", "store"]);

		for (const [container, children] of [
			["edge", ["gw", "web"]],
			["core", ["io", "lease"]],
			["store", ["vault"]],
		] as const) {
			const region = rendered.atlas.regions[container];
			expect(region).toBeDefined();
			for (const child of children) {
				expect(within(rendered.atlas.nodes[child]!, region!)).toBe(true);
			}
		}
	});

	test("containment is drawn at every level, not flattened to the topmost one", () => {
		const rendered = render(
			architecture([
				{ id: "sys", name: "Platform", kind: "service" },
				{ id: "svc", name: "Data Plane", kind: "package", parent: "sys" },
				{ id: "mod", name: "Postgres", kind: "datastore", parent: "svc" },
				{ id: "other", name: "Redis", kind: "cache", parent: "svc" },
				{ id: "direct", name: "Public API", kind: "route", parent: "sys" },
			]),
		);

		// The middle level is a subject of its own, not a card and not lost.
		const outer = rendered.atlas.regions["sys"];
		const middle = rendered.atlas.regions["svc"];
		expect(outer).toBeDefined();
		expect(middle).toBeDefined();
		expect(rendered.atlas.regions["mod"]).toBeUndefined();

		// And it is really nested: strictly inside the one above, strictly around
		// the ones below, and the sibling card is inside the outer box but outside
		// the middle one.
		expect(within(middle!, outer!)).toBe(true);
		expect(middle!.width).toBeLessThan(outer!.width);
		for (const child of ["mod", "other"]) {
			expect(within(rendered.atlas.nodes[child]!, middle!)).toBe(true);
		}
		expect(within(rendered.atlas.nodes["direct"]!, outer!)).toBe(true);
		expect(within(rendered.atlas.nodes["direct"]!, middle!)).toBe(false);
	});

	test("a container's box holds its own contents and nothing else", () => {
		const rendered = render(
			architecture([
				{ id: "one", name: "First", kind: "service" },
				{ id: "a", name: "Inside First", kind: "module", parent: "one" },
				{ id: "two", name: "Second", kind: "service" },
				{ id: "b", name: "Inside Second", kind: "module", parent: "two" },
			]),
		);
		expect(within(rendered.atlas.nodes["a"]!, rendered.atlas.regions["one"]!)).toBe(true);
		expect(within(rendered.atlas.nodes["b"]!, rendered.atlas.regions["two"]!)).toBe(true);
		expect(within(rendered.atlas.nodes["b"]!, rendered.atlas.regions["one"]!)).toBe(false);
		expect(within(rendered.atlas.nodes["a"]!, rendered.atlas.regions["two"]!)).toBe(false);
	});

	test("a route between boxes that stand one inside the other goes round the cards", () => {
		// Every one of these sits on the same row: the outer box, the box inside
		// it, and the card inside that. A run straight from one to the next would
		// be drawn through the card, and under it, since lines are painted below
		// cards — a line that appears to stop in mid-air.
		const rendered = render(
			architecture(
				[
					{ id: "sys", name: "Platform", kind: "service" },
					{ id: "svc", name: "Data Plane", kind: "package", parent: "sys" },
					{ id: "mod", name: "Postgres", kind: "datastore", parent: "svc" },
				],
				[
					{ id: "e1", from: "sys", to: "svc", kind: "call" },
					{ id: "e2", from: "svc", to: "mod", kind: "call" },
				],
			),
		);
		const card = rendered.atlas.nodes["mod"]!;
		const clear = { x: card.x + 1, y: card.y + 1, width: card.width - 2, height: card.height - 2 };
		const drawn = routePoints(rendered.svg);

		expect(routeCrosses(drawn.get("e1") ?? [], clear)).toBe(false);
		// The route that ends on the card may touch its frame and nothing more.
		expect(routeCrosses((drawn.get("e2") ?? []).slice(0, -1), clear)).toBe(false);
	});

	test("no route crosses a container's title band", () => {
		const rendered = render(
			architecture(
				[
					{ id: "sys", name: "Platform", kind: "service" },
					{ id: "a", name: "API", kind: "route", parent: "sys" },
					{
						id: "svc",
						name: "Data Plane With A Long Meaningful Name",
						responsibility: "A responsibility longer than the box is wide is still cut to fit",
						kind: "package",
						parent: "sys",
					},
					{ id: "mod", name: "Postgres", kind: "datastore", parent: "svc" },
				],
				[{ id: "e1", from: "a", to: "mod", kind: "call" }],
			),
		);
		// The band is the strip between a container's top edge and the first thing
		// inside it: its title's, and nothing else's.
		const box = rendered.atlas.regions["svc"]!;
		const card = rendered.atlas.nodes["mod"]!;
		const band = { x: box.x, y: box.y, width: box.width, height: card.y - box.y - 1 };

		expect(band.height).toBeGreaterThan(10);
		expect(routeCrosses(routePoints(rendered.svg).get("e1") ?? [], band)).toBe(false);
	});

	test("nesting widens the column rather than squeezing the card at the bottom of it", () => {
		const chain = architecture(
			Array.from({ length: 12 }, (_, level) => ({
				id: `d${level}`,
				name: `Level ${level}`,
				kind: "module",
				...(level === 0 ? {} : { parent: `d${level - 1}` }),
			})),
		);
		const deep = render(chain);
		const shallow = render(architecture([{ id: "one", name: "Level 0", kind: "module" }]));

		// The card at the bottom of a twelve-deep chain is as wide as a card that
		// is in nothing at all, and every box the atlas knows is a box a click can
		// land in.
		expect(deep.atlas.nodes["d11"]!.width).toBe(shallow.atlas.nodes["one"]!.width);
		for (const box of [...Object.values(deep.atlas.nodes), ...Object.values(deep.atlas.regions)]) {
			expect(box.width).toBeGreaterThan(0);
			expect(box.height).toBeGreaterThan(0);
		}
	});

	test("an edge naming a container arrives on that container's frame", () => {
		const rendered = render();
		const arrival = routeEnds(rendered.svg).get("e7");
		expect(arrival).toBeDefined();

		// The arrowhead touches the box the reader sees, rather than landing well
		// inside it on a strip of title the router happens to find convenient.
		const box = rendered.atlas.regions["store"]!;
		expect(distanceToFrame(arrival!, box)).toBeLessThan(2);
		expect(arrival!.x).toBeGreaterThanOrEqual(box.x - 2);
		expect(arrival!.y).toBeGreaterThanOrEqual(box.y - 2);
	});

	test("nodes belonging to nothing spread instead of stacking in one column", () => {
		const loose = ["Ingest", "Normaliser", "Scheduler", "Worker Pool", "Metrics", "Object Store"];
		const rendered = render(
			architecture(loose.map((name, index) => ({ id: `n${index}`, name, kind: "service" }))),
		);
		const boxes = loose.map((_, index) => rendered.atlas.nodes[`n${index}`]!);
		const columns = new Set(boxes.map((box) => box.x));

		expect(columns.size).toBeGreaterThan(2);
		expect(rendered.width).toBeGreaterThan(rendered.height);
		// None of them belongs to a container, so none of them draws one.
		expect(Object.keys(rendered.atlas.regions)).toHaveLength(0);
	});

	test("a chain of uncontained nodes still reads down the page", () => {
		const rendered = render(
			architecture(
				[
					{ id: "a", name: "Ingest", kind: "service" },
					{ id: "b", name: "Normaliser", kind: "module" },
					{ id: "c", name: "Warehouse", kind: "datastore" },
				],
				[
					{ id: "e1", from: "a", to: "b", kind: "call" },
					{ id: "e2", from: "b", to: "c", kind: "data" },
				],
			),
		);
		const boxes = ["a", "b", "c"].map((id) => rendered.atlas.nodes[id]!);
		expect(new Set(boxes.map((box) => box.x)).size).toBe(1);
		expect(boxes[0]!.y).toBeLessThan(boxes[1]!.y);
		expect(boxes[1]!.y).toBeLessThan(boxes[2]!.y);
	});

	test("a node with no container and no children is still drawn", () => {
		const rendered = render();
		expect(rendered.atlas.nodes["solo"]).toBeDefined();
		expect(rendered.svg).toContain('data-semantic-id="solo"');
		// It belongs to no container, so it contributes no region of its own.
		expect(rendered.atlas.regions["solo"]).toBeUndefined();
	});

	test("every subject carries the hooks a viewer selects by", () => {
		const rendered = render();
		expect(rendered.svg).toContain('data-semantic-kind="node" data-semantic-id="io"');
		expect(rendered.svg).toContain('data-semantic-kind="edge" data-semantic-id="e2"');
		expect(rendered.svg).toContain('data-semantic-kind="region" data-semantic-id="core"');
		expect(rendered.svg).toContain(".is-selected");
		expect(rendered.svg).not.toContain("<script");
	});

	test("a name longer than its card is cut rather than allowed to overflow", () => {
		const long = "Extremely Long Architecture Node Name That Cannot Possibly Fit On One Card";
		const rendered = render(
			architecture([
				{ id: "box", name: "Box", kind: "service" },
				{ id: "long", name: long, kind: "module", parent: "box" },
			]),
		);
		const faces = registeredFaces(rendered.svg);
		const title = drawnTexts(rendered.svg).find((drawn) => drawn.text.startsWith("Extremely"));

		expect(title).toBeDefined();
		expect(title!.text).not.toBe(long);
		expect(title!.text.endsWith("…")).toBe(true);
		expect(long.startsWith(title!.text.slice(0, 10))).toBe(true);
		expect(spanFits(drawnSpan(title!, faces), rendered.atlas.nodes["long"]!)).toBe(true);
	});

	test("every drawn word fits its subject, measured in the face it is drawn in", () => {
		const rendered = render();
		const faces = registeredFaces(rendered.svg);
		const drawn = drawnTexts(rendered.svg);
		const plates = labelPlates(rendered.svg);

		// Cards, band headers, kind glyphs and label pills: if any of them were
		// measured in one face and drawn in another, one of these overflows.
		expect(drawn.length).toBeGreaterThan(15);
		for (const text of drawn) {
			const box = boxOf(rendered, text.subject);
			expect(box).toBeDefined();
			expect([400, 500]).toContain(text.weight);
			expect(spanFits(drawnSpan(text, faces), box!)).toBe(true);
		}

		// A label is also checked against its own plate, which the atlas was
		// derived from and so cannot vouch for. Every plate is its label's width
		// plus the same padding, and a plate sized in a face other than the one
		// its words are set in would leave a different amount of room on a short
		// label than on a long one.
		const slack = drawn
			.filter((one) => one.subject.kind === "edge")
			.map((one) => {
				const plate = plates.get(one.subject.id)!;
				expect(spanFits(drawnSpan(one, faces), plate)).toBe(true);
				return Math.round((plate.width - drawnWidth(one, faces)) * 100) / 100;
			});
		expect(slack.length).toBeGreaterThan(3);
		expect(new Set(slack).size).toBe(1);
		expect(slack[0]!).toBeGreaterThan(0);
	});

	test("the document registers every face it draws in", () => {
		const rendered = render();
		const faces = registeredFaces(rendered.svg);
		expect(faces.size).toBe(4);
		for (const text of drawnTexts(rendered.svg)) {
			expect(faces.has(`${text.family}|${text.weight}`)).toBe(true);
		}
		// A synthesised weight would be wider than anything that was measured.
		expect(rendered.svg).toContain("font-synthesis:none");
		expect(rendered.svg).not.toMatch(/font-weight="(600|700|bold)"/);
	});

	test("an embedded render carries its faces instead of pointing at them", () => {
		const linked = renderArchitecture({ content: SAMPLE, theme: "light" });
		const embedded = renderArchitecture({ content: SAMPLE, theme: "light", fonts: "embedded" });

		expect(linked.svg).toContain('url("/assets/diagram-fonts/');
		expect(embedded.svg).not.toContain("/assets/diagram-fonts/");
		expect(embedded.svg).toContain('url("data:font/ttf;base64,');
		expect(embedded.svg.length).toBeGreaterThan(linked.svg.length);
		// Same picture either way: only where the bytes come from changed.
		expect(embedded.atlas).toEqual(linked.atlas);
		expect(embedded.width).toBe(linked.width);
	});

	test("a label belongs to its edge, in the markup and in the atlas", () => {
		const rendered = render();
		const labelled = drawnTexts(rendered.svg).filter((text) => text.text === "read board");

		expect(labelled).toHaveLength(1);
		expect(labelled[0]!.subject).toEqual({ kind: "edge", id: "e2" });

		const faces = registeredFaces(rendered.svg);
		const span = drawnSpan(labelled[0]!, faces);
		const box = rendered.atlas.edges["e2"]!;
		expect(spanFits(span, box)).toBe(true);
		// And inside the plate it is printed on, which is sized independently of
		// the atlas: a pill measured in the wrong face overflows this, not that.
		expect(spanFits(span, labelPlates(rendered.svg).get("e2")!)).toBe(true);

		// The atlas holds both the route and its pill. Widening a corridor for a
		// label can put the pill inside the route's bounding rectangle already.
		const pill = labelPlates(rendered.svg).get("e2")!;
		const points = routePoints(rendered.svg).get("e2")!;
		expect(points.length).toBeGreaterThan(1);
		for (const point of [...points, pill, { x: pill.x + pill.width, y: pill.y + pill.height }]) {
			expect(point.x).toBeGreaterThanOrEqual(box.x - 0.1);
			expect(point.y).toBeGreaterThanOrEqual(box.y - 0.1);
			expect(point.x).toBeLessThanOrEqual(box.x + box.width + 0.1);
			expect(point.y).toBeLessThanOrEqual(box.y + box.height + 0.1);
		}
	});

	test("content with nothing in it is refused rather than drawn", () => {
		let thrown: unknown;
		try {
			render(architecture([]));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(SemanticRenderError);
		expect((thrown as SemanticRenderError).code).toBe("NOTHING_TO_RENDER");
	});

	test("the two themes are different pictures of the same geometry", () => {
		const light = render(SAMPLE, "light");
		const dark = render(SAMPLE, "dark");
		expect(dark.svg).not.toBe(light.svg);
		expect(dark.width).toBe(light.width);
		expect(dark.height).toBe(light.height);
		expect(dark.atlas).toEqual(light.atlas);
	});
});
