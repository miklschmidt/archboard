// A label belongs to one line, visibly: the pill sits on the run it names and
// does not lie across the neighbour's run. Either alone leaves a reader
// guessing, which is what a photographed pair of opposed labelled arrows did.
// Measured on a rendered page, because the gap, the ports and the settling
// together decide where a pill lands.

import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routeLabels, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import {
	detached,
	covering,
	overlaps,
	masking,
} from "@/runtime/semantic-renderer/tests/drawn-labels";

/** The reported shape: a pane and its routes, wired both ways and labelled both ways. */
const PAIRED: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "pane", name: "Pane", kind: "external", responsibility: "Shows a board" },
		{ id: "routes", name: "Routes", kind: "module" },
		{
			id: "store",
			name: "Store",
			kind: "module",
			responsibility: "The one place a board is written",
		},
	],
	edges: [
		{ id: "asks", from: "pane", to: "routes", kind: "http", label: "asks", emphasis: "hero" },
		{ id: "reads", from: "routes", to: "store", kind: "call", label: "reads" },
		{ id: "drawing", from: "routes", to: "pane", kind: "data", label: "the drawing" },
		{ id: "dep", from: "store", to: "routes", kind: "dependency" },
	],
});

/** Three labelled crossings of one gap, which is more than any pair of cards. */
const THREE_WAYS: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "boundary", name: "Write boundary", kind: "service" },
		{ id: "write", name: "Board write", kind: "module" },
	],
	edges: [
		{ id: "lease", from: "boundary", to: "write", kind: "call", label: "under lease" },
		{ id: "settled", from: "write", to: "boundary", kind: "event", label: "settled" },
		{ id: "delta", from: "boundary", to: "write", kind: "data", label: "the delta" },
	],
});

/** The renderer proposal's labelled fork: one branch skips the middle card. */
const LABELLED_FORK: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "graph", name: "Layout graph", kind: "module" },
		{ id: "measure", name: "Card measurement", kind: "module" },
		{ id: "layout", name: "Compound layout", kind: "module" },
	],
	edges: [
		{ id: "graphout", from: "graph", to: "layout", kind: "data", label: "compound graph" },
		{ id: "subjects", from: "graph", to: "measure", kind: "data", label: "subjects to measure" },
		{ id: "sizes", from: "measure", to: "layout", kind: "data", label: "card and label sizes" },
	],
});

/** A real fanout whose longest run is crowded but another segment can host its label. */
const LIFECYCLE: VariantContent = VariantContentSchema.parse({
	nodes: [
		{
			id: "life",
			name: "Lifecycle transitions",
			kind: "function",
			responsibility: "Defines board lifecycle changes",
		},
		{
			id: "edit",
			name: "Edit semantic content",
			kind: "function",
			responsibility: "Resolves names into stable subjects",
		},
		{
			id: "drafts",
			name: "Propagate descendant edits",
			kind: "function",
			responsibility: "Carries parent changes into drafts",
		},
		{
			id: "adopt",
			name: "Settle and adopt",
			kind: "function",
			responsibility: "Resolves proposals into current",
		},
	],
	edges: [
		{ id: "apply", from: "life", to: "edit", kind: "call", label: "apply content edit" },
		{ id: "merge", from: "life", to: "drafts", kind: "call", label: "reconcile descendants" },
		{ id: "resolve", from: "life", to: "adopt", kind: "call", label: "resolve lifecycle" },
	],
});

/** A long container route must leave the short camera crossing its only label space. */
const CAMERA_FOCUS: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "viewer", name: "Semantic viewer", kind: "module" },
		{ id: "fetch", name: "Fetch semantic reads", kind: "function", parent: "viewer" },
		{ id: "stage", name: "Render stage states", kind: "function", parent: "viewer" },
		{ id: "camera", name: "Control camera", kind: "function", parent: "viewer" },
		{ id: "select", name: "Select semantic subjects", kind: "function", parent: "viewer" },
		{ id: "focus", name: "Drive walkthrough focus", kind: "function", parent: "viewer" },
		{ id: "refresh", name: "Refresh changed boards", kind: "function", parent: "viewer" },
	],
	edges: [
		{
			id: "request",
			from: "viewer",
			to: "fetch",
			kind: "call",
			label: "request authoritative bytes",
			emphasis: "hero",
		},
		{ id: "pick", from: "stage", to: "select", kind: "call", label: "pick attention" },
		{ id: "advance", from: "stage", to: "focus", kind: "call", label: "advance explanation" },
		{ id: "fit", from: "focus", to: "camera", kind: "call", label: "fit beat subjects" },
		{
			id: "refresh",
			from: "refresh",
			to: "fetch",
			kind: "event",
			label: "invalidate matching queries",
		},
	],
});

/** An architecture whose corridors carry labelled traffic in both directions. */
const CROWDED: VariantContent = VariantContentSchema.parse({
	nodes: [
		{ id: "edge", name: "Edge", kind: "service", responsibility: "Public entry points" },
		{ id: "gw", name: "API Gateway", kind: "route", parent: "edge" },
		{ id: "web", name: "Operator Console", kind: "ui", parent: "edge" },
		{ id: "core", name: "Board Runtime", kind: "service", responsibility: "Owns every write" },
		{ id: "io", name: "board-io", kind: "module", parent: "core" },
		{ id: "queue", name: "Edit Queue", kind: "queue", parent: "core" },
		{ id: "store", name: "Vault", kind: "datastore" },
	],
	edges: [
		{ id: "e1", from: "web", to: "gw", kind: "http", label: "REST" },
		{ id: "e2", from: "gw", to: "io", kind: "call", label: "read board", emphasis: "hero" },
		{ id: "e3", from: "io", to: "gw", kind: "event", label: "settled" },
		{ id: "e4", from: "gw", to: "queue", kind: "event", label: "enqueue" },
		{ id: "e5", from: "queue", to: "io", kind: "call", label: "drain" },
		{ id: "e6", from: "io", to: "store", kind: "data", label: "writes" },
		{ id: "e7", from: "store", to: "io", kind: "data", label: "the board" },
		{ id: "e8", from: "store", to: "web", kind: "data", label: "the picture" },
	],
});

describe("a label belongs to one line", () => {
	test("badges keep twelve units of whitespace from cards while remaining on their routes", () => {
		for (const content of [LABELLED_FORK, LIFECYCLE, PAIRED, CAMERA_FOCUS]) {
			for (const theme of ["light", "dark"] as const) {
				const drawn = renderArchitecture({ content, theme });
				const frames = new Set(content.nodes.map((node) => node.parent));
				const cards = Object.entries(drawn.atlas.nodes).filter(([id]) => !frames.has(id));
				const cramped: string[] = [];
				for (const [id, pill] of routeLabels(drawn.svg)) {
					for (const [node, card] of cards) {
						const gap = Math.max(
							card.x - pill.x - pill.width,
							pill.x - card.x - card.width,
							card.y - pill.y - pill.height,
							pill.y - card.y - card.height,
						);
						if (gap < 11.9) {
							cramped.push(`${id} sits ${gap.toFixed(1)} from ${node}`);
						}
					}
				}
				expect(cramped).toEqual([]);
				expect(detached(drawn)).toEqual([]);
			}
		}
	});

	for (const returning of [false, true]) {
		test(`labelled fork${returning ? " with a return" : ""} branches keep separate departures and clear pills`, () => {
			for (const order of [
				[0, 1, 2],
				[0, 2, 1],
				[1, 0, 2],
				[1, 2, 0],
				[2, 0, 1],
				[2, 1, 0],
			]) {
				const content = VariantContentSchema.parse({
					...LABELLED_FORK,
					edges: [
						...order.flatMap((index) => LABELLED_FORK.edges[index] ?? []),
						...(returning
							? [
									{
										id: "return",
										from: "layout",
										to: "graph",
										kind: "data" as const,
										label: "SVG and subject atlas",
									},
								]
							: []),
					],
				});
				for (const theme of ["light", "dark"] as const) {
					const drawn = renderArchitecture({ content, theme });
					const routes = routePoints(drawn.svg);
					expect(routeLabels(drawn.svg).size).toBe(returning ? 4 : 3);
					expect(detached(drawn)).toEqual([]);
					expect(covering(drawn)).toEqual([]);
					expect(overlaps(drawn, content)).toEqual([]);
					expect(masking(drawn)).toEqual([]);
					expect(routes.get("graphout")?.[0]).toBeDefined();
					expect(routes.get("subjects")?.[0]).toBeDefined();
					expect(routes.get("graphout")?.[0]).not.toEqual(routes.get("subjects")?.[0]);
					const graph = drawn.atlas.nodes["graph"]!;
					const layout = drawn.atlas.nodes["layout"]!;
					const forward = routes.get("graphout")!;
					expect(forward[0]?.x).toBeCloseTo(graph.x, 1);
					expect(forward.at(-1)?.x).toBeCloseTo(layout.x, 1);
					expect(Math.min(...forward.map((point) => point.x))).toBeLessThan(
						Math.min(graph.x, layout.x),
					);
					if (returning) {
						const returnPath = routes.get("return")!;
						expect(returnPath[0]?.x).toBeCloseTo(layout.x + layout.width, 1);
						expect(returnPath.at(-1)?.x).toBeCloseTo(graph.x + graph.width, 1);
						expect(Math.max(...returnPath.map((point) => point.x))).toBeGreaterThan(
							Math.max(graph.x + graph.width, layout.x + layout.width),
						);
					}
				}
			}
		});
	}

	test("parallel labelled skips reserve measured room beside their tracks", () => {
		const content = VariantContentSchema.parse({
			...LABELLED_FORK,
			edges: [
				...LABELLED_FORK.edges,
				{
					id: "other",
					from: "graph",
					to: "layout",
					kind: "data",
					label: "alternate compound graph",
				},
			],
		});
		for (const theme of ["light", "dark"] as const) {
			const drawn = renderArchitecture({ content, theme });
			expect(routeLabels(drawn.svg).size).toBe(4);
			expect(detached(drawn)).toEqual([]);
			expect(covering(drawn)).toEqual([]);
			expect(overlaps(drawn, content)).toEqual([]);
			expect(masking(drawn)).toEqual([]);
		}
	});

	for (const [what, content] of [
		["the reported pair", PAIRED],
		["three crossings of one gap", THREE_WAYS],
		["a crowded architecture", CROWDED],
		["the lifecycle fanout", LIFECYCLE],
	] as const) {
		test(`every pill of ${what} is drawn on its own route`, () => {
			for (const theme of ["light", "dark"] as const) {
				const drawn = renderArchitecture({ content, theme });
				expect(routeLabels(drawn.svg).size).toBeGreaterThan(1);
				expect(detached(drawn)).toEqual([]);
			}
		});

		test(`no pill of ${what} covers another pill or a card`, () => {
			expect(overlaps(renderArchitecture({ content, theme: "light" }), content)).toEqual([]);
		});
	}

	for (const [what, content] of [
		["the reported pair", PAIRED],
		["three crossings of one gap", THREE_WAYS],
	] as const) {
		test(`no pill of ${what} lies across a line it does not name`, () => {
			// Sitting on its own line is not enough: a pill wide enough to cover the
			// neighbour's line names both of them as far as a reader can tell.
			for (const theme of ["light", "dark"] as const) {
				expect(covering(renderArchitecture({ content, theme }))).toEqual([]);
			}
		});
	}

	test("no pill of the reported pair sits on its own arrowhead", () => {
		// A head hidden under the words stops saying which way the line runs.
		for (const theme of ["light", "dark"] as const) {
			expect(masking(renderArchitecture({ content: PAIRED, theme }))).toEqual([]);
		}
	});

	test("a forward adjacent connection is direct and its return travels to the right", () => {
		const drawn = renderArchitecture({ content: PAIRED, theme: "light" });
		const up = routePoints(drawn.svg).get("drawing") ?? [];
		const down = routePoints(drawn.svg).get("asks") ?? [];
		expect(up.length).toBeGreaterThan(1);
		expect(down.length).toBeGreaterThan(1);
		const pane = drawn.atlas.nodes["pane"]!;
		const routes = drawn.atlas.nodes["routes"]!;
		expect(down.every((point) => point.x === down[0]?.x)).toBe(true);
		expect(up[0]?.x).toBeCloseTo(routes.x + routes.width, 1);
		expect(up.at(-1)?.x).toBeCloseTo(pane.x + pane.width, 1);
		expect(Math.max(...up.map((point) => point.x))).toBeGreaterThan(
			Math.max(pane.x + pane.width, routes.x + routes.width),
		);
		expect(detached(drawn)).toEqual([]);
		expect(covering(drawn)).toEqual([]);
		expect(overlaps(drawn, PAIRED)).toEqual([]);
		expect(masking(drawn)).toEqual([]);
	});
});
