import { describe, expect, test } from "bun:test";
import type { DiagramBox, DiagramTheme } from "@/shared/semantic-board/index";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import {
	renderDataFlow,
	renderSemanticView,
	SemanticRenderError,
	type RenderedDiagram,
} from "@/runtime/semantic-renderer/index";
import {
	drawnSpan,
	drawnTexts,
	labelPlates,
	registeredFaces,
	spanFits,
} from "@/runtime/semantic-renderer/tests/drawn-text";
import { routeEnds } from "@/runtime/semantic-renderer/tests/drawn-routes";

/**
 * One variant, as its own contract reads it.
 * @param content The nodes, relationships and flows.
 * @returns The content.
 */
function variant(content: {
	nodes: readonly unknown[];
	edges?: readonly unknown[];
	flows?: readonly unknown[];
}): VariantContent {
	return VariantContentSchema.parse(content);
}

/**
 * One content both grammars can draw: an architecture, and an exchange between
 * the same nodes.
 */
const SAMPLE: VariantContent = variant({
	nodes: [
		{ id: "agent", name: "Agent", kind: "external", responsibility: "Claude, through the CLI" },
		{ id: "cli", name: "archboard CLI", kind: "app", responsibility: "One command, one write" },
		{ id: "canvas", name: "Canvas Server", kind: "service", responsibility: "Holds the leases" },
		{ id: "io", name: "board-io", kind: "module", responsibility: "Reads and writes the note" },
		{ id: "vault", name: "Obsidian Vault", kind: "datastore", responsibility: "The note on disk" },
	],
	edges: [
		{ id: "x1", from: "agent", to: "cli", kind: "call", label: "invokes" },
		{ id: "x2", from: "cli", to: "canvas", kind: "http", label: "HTTP" },
		{ id: "x3", from: "canvas", to: "io", kind: "call", label: "read and write" },
		{ id: "x4", from: "io", to: "vault", kind: "data", label: "atomic write" },
	],
	flows: [
		{
			id: "claim",
			name: "An agent claims a board and edits it",
			summary: "One writer at a time, and the note still decides",
			participants: ["agent", "cli", "canvas", "io", "vault"],
			steps: [
				{ id: "s1", from: "agent", to: "cli", label: "draw --doing", kind: "sync" },
				{ id: "s2", from: "cli", to: "canvas", label: "POST /claim", kind: "sync" },
				{ id: "s3", from: "canvas", to: "canvas", label: "retry once", kind: "self" },
				{ id: "s4", from: "canvas", to: "cli", label: "claim held", kind: "return" },
				{ id: "s5", from: "canvas", to: "io", label: "read the note", kind: "sync" },
				{ id: "s6", from: "io", to: "vault", label: "readFileSync", kind: "sync", repeat: 2 },
				{ id: "s7", from: "vault", to: "io", label: "note bytes", kind: "return" },
				{ id: "s8", from: "canvas", to: "agent", label: "written at v42", kind: "async" },
				{
					id: "s9",
					from: "io",
					to: "vault",
					label: "an unusually long label for a short hop between columns",
					kind: "async",
				},
			],
		},
	],
});

/**
 * Draw the sample, or a variation of it, as a message sequence.
 * @param content What to draw.
 * @param theme Which ground to draw it on.
 * @returns The rendered sequence.
 */
function render(content: VariantContent = SAMPLE, theme: DiagramTheme = "light"): RenderedDiagram {
	return renderDataFlow({ content, theme });
}

/**
 * Whether two boxes share any area at all.
 * @param one The first box.
 * @param other The second.
 * @returns True when they overlap.
 */
function intersects(one: DiagramBox, other: DiagramBox): boolean {
	return (
		one.x < other.x + other.width &&
		other.x < one.x + one.width &&
		one.y < other.y + other.height &&
		other.y < one.y + one.height
	);
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

/**
 * A flow of any size, with every participant talking to the one after it.
 * @param participants How many columns.
 * @param steps How many messages.
 * @returns The content.
 */
function crowd(participants: number, steps: number): VariantContent {
	const ids = Array.from({ length: participants }, (_, index) => `p${index}`);
	return variant({
		nodes: ids.map((id, index) => ({ id, name: `Participant ${index}`, kind: "service" })),
		flows: [
			{
				id: "big",
				name: "A long exchange",
				participants: ids,
				steps: Array.from({ length: steps }, (_, index) => ({
					id: `m${index}`,
					from: ids[index % participants],
					to: ids[(index + 1) % participants],
					label: `step number ${index}`,
					kind: index % 3 === 0 ? "async" : "sync",
				})),
			},
		],
	});
}

describe("renderDataFlow", () => {
	test("the same content and theme produce the same bytes", () => {
		expect(render().svg).toBe(render().svg);
	});

	test("every participant and every step lands somewhere on the page", () => {
		const rendered = render();
		const page: DiagramBox = { x: 0, y: 0, width: rendered.width, height: rendered.height };
		const flow = SAMPLE.flows[0]!;

		for (const participant of flow.participants) {
			const box = rendered.atlas.nodes[participant];
			expect(box).toBeDefined();
			expect(box!.width).toBeGreaterThan(0);
			expect(box!.height).toBeGreaterThan(0);
			expect(within(box!, page)).toBe(true);
		}

		for (const step of flow.steps) {
			const box = rendered.atlas.edges[step.id];
			expect(box).toBeDefined();
			expect(box!.width).toBeGreaterThan(0);
			expect(box!.height).toBeGreaterThan(0);
			expect(within(box!, page)).toBe(true);
		}

		// The flow itself is a subject, and everything it holds is inside its frame.
		const frame = rendered.atlas.regions["claim"];
		expect(frame).toBeDefined();
		for (const participant of flow.participants) {
			expect(within(rendered.atlas.nodes[participant]!, frame!)).toBe(true);
		}
	});

	test("a participant is its card and the whole column of time under it", () => {
		const rendered = render();
		const column = rendered.atlas.nodes["io"]!;
		const frame = rendered.atlas.regions["claim"]!;

		// The column reaches from the card at the top of the flow to within the
		// bottom of its frame: a pane sent to a participant is being sent to
		// everything that participant does, not to the label naming it.
		expect(column.height).toBeGreaterThan(frame.height / 2);
		const last = rendered.atlas.edges["s7"]!;
		expect(column.y + column.height).toBeGreaterThan(last.y);
	});

	test("two grammars draw the same identities as two different pictures", async () => {
		const sequence = await renderSemanticView({
			content: SAMPLE,
			grammar: "data-flow",
			theme: "light",
		});
		const architecture = await renderSemanticView({
			content: SAMPLE,
			grammar: "architecture",
			theme: "light",
		});

		expect(sequence.svg).not.toBe(architecture.svg);

		// The same nodes, in both, under the same ids and in different places.
		for (const node of SAMPLE.nodes) {
			expect(sequence.atlas.nodes[node.id]).toBeDefined();
			expect(architecture.atlas.nodes[node.id]).toBeDefined();
			expect(sequence.atlas.nodes[node.id]).not.toEqual(architecture.atlas.nodes[node.id]);
		}

		// And each grammar knows only the relationships it draws: the architecture
		// draws the wiring, the sequence draws the exchange.
		expect(architecture.atlas.edges["x1"]).toBeDefined();
		expect(architecture.atlas.edges["s1"]).toBeUndefined();
		expect(sequence.atlas.edges["s1"]).toBeDefined();
		expect(sequence.atlas.edges["x1"]).toBeUndefined();
		expect(sequence.atlas.regions["claim"]).toBeDefined();
		expect(architecture.atlas.regions["claim"]).toBeUndefined();
	});

	test("messages are drawn in the order the flow states them", () => {
		const rendered = render();
		const order = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
		const tops = order.map((id) => rendered.atlas.edges[id]!.y);
		expect(tops).toEqual([...tops].toSorted((a, b) => a - b));

		// Swapping two of them swaps which is drawn above the other, which is the
		// whole of what "order is array position" means.
		const flow = SAMPLE.flows[0]!;
		const swapped: VariantContent = {
			...SAMPLE,
			flows: [
				{
					...flow,
					steps: [flow.steps[1]!, flow.steps[0]!, ...flow.steps.slice(2)],
				},
			],
		};
		const after = render(swapped);
		expect(rendered.atlas.edges["s1"]!.y).toBeLessThan(rendered.atlas.edges["s2"]!.y);
		expect(after.atlas.edges["s2"]!.y).toBeLessThan(after.atlas.edges["s1"]!.y);
	});

	test("a self message stays inside its own column's run", () => {
		const rendered = render();
		const loop = rendered.atlas.edges["s3"]!;
		const sender = rendered.atlas.nodes["canvas"]!;
		const neighbour = rendered.atlas.nodes["io"]!;

		// It leaves its own lifeline and comes back to it, so it starts inside its
		// sender's column and reaches to the right of it.
		expect(loop.x).toBeGreaterThanOrEqual(sender.x);
		expect(loop.x + loop.width).toBeGreaterThan(sender.x + sender.width);

		// And a label of ordinary length lands in the air between the two columns
		// rather than over the next one. A label longer than that run rides over
		// the next lifeline, exactly as a long architecture label rides over a
		// card: the plate is opaque so that it stays readable when it does.
		expect(intersects(loop, neighbour)).toBe(false);

		// Its row is taller than a crossing message's, because the loop drops below
		// the row it turns back into.
		expect(loop.height).toBeGreaterThan(rendered.atlas.edges["s2"]!.height);
	});

	test("a message's words belong to the message, in the markup and in the atlas", () => {
		const rendered = render();
		const faces = registeredFaces(rendered.svg);
		const labelled = drawnTexts(rendered.svg).filter((text) => text.text === "read the note");

		expect(labelled).toHaveLength(1);
		expect(labelled[0]!.subject).toEqual({ kind: "step", id: "s5" });

		const span = drawnSpan(labelled[0]!, faces);
		expect(spanFits(span, rendered.atlas.edges["s5"]!)).toBe(true);
		// And inside the plate it is printed on, which is sized independently of
		// the atlas: a plate measured in the wrong face overflows this, not that.
		expect(spanFits(span, labelPlates(rendered.svg, "step").get("s5")!)).toBe(true);

		// A label longer than the hop it names is the case that decides whether the
		// atlas box is really the line *and* its words: a label shorter than its
		// arrow is covered by the arrow alone, so it proves nothing.
		const long = drawnTexts(rendered.svg).find((text) => text.subject.id === "s9")!;
		const room = rendered.atlas.edges["s9"]!;
		const arrow = rendered.atlas.nodes["vault"]!.x - rendered.atlas.nodes["io"]!.x;
		expect(drawnSpan(long, faces).right - drawnSpan(long, faces).left).toBeGreaterThan(arrow);
		expect(spanFits(drawnSpan(long, faces), room)).toBe(true);
		expect(spanFits(drawnSpan(long, faces), labelPlates(rendered.svg, "step").get("s9")!)).toBe(
			true,
		);
	});

	test("a repeated step says so rather than being drawn twice", () => {
		const rendered = render();
		const drawn = drawnTexts(rendered.svg).filter((text) => text.subject.id === "s6");
		expect(drawn.map((text) => text.text)).toEqual(["readFileSync ×2"]);
		expect(
			spanFits(drawnSpan(drawn[0]!, registeredFaces(rendered.svg)), rendered.atlas.edges["s6"]!),
		).toBe(true);
	});

	test("every drawn word fits its subject, measured in the face it is drawn in", () => {
		const rendered = render();
		const faces = registeredFaces(rendered.svg);
		const drawn = drawnTexts(rendered.svg);

		expect(drawn.length).toBeGreaterThan(15);
		for (const text of drawn) {
			const box =
				text.subject.kind === "node"
					? rendered.atlas.nodes[text.subject.id]
					: text.subject.kind === "step"
						? rendered.atlas.edges[text.subject.id]
						: rendered.atlas.regions[text.subject.id];
			expect(box).toBeDefined();
			expect([400, 500]).toContain(text.weight);
			expect(faces.has(`${text.family}|${text.weight}`)).toBe(true);
			expect(spanFits(drawnSpan(text, faces), box!)).toBe(true);
		}
	});

	test("a crossing message arrives at the lifeline it names", () => {
		const rendered = render();
		const arrival = routeEnds(rendered.svg, "step").get("s2");
		expect(arrival).toBeDefined();

		const receiver = rendered.atlas.nodes["canvas"]!;
		const lifeline = receiver.x + receiver.width / 2;
		// Short of the lifeline by the width of the bar it is busy with, plus the
		// room the arrowhead needs of its own — a dozen units, not a column.
		expect(lifeline - arrival!.x).toBeGreaterThan(0);
		expect(lifeline - arrival!.x).toBeLessThan(16);
		expect(arrival!.y).toBeGreaterThan(rendered.atlas.edges["s1"]!.y);
	});

	test("every subject carries the hooks a viewer selects by", () => {
		const rendered = render();
		expect(rendered.svg).toContain('data-semantic-kind="node" data-semantic-id="io"');
		expect(rendered.svg).toContain('data-semantic-kind="step" data-semantic-id="s5"');
		expect(rendered.svg).toContain('data-semantic-kind="flow" data-semantic-id="claim"');
		expect(rendered.svg).toContain(".is-selected");
		expect(rendered.svg).not.toContain("<script");
	});

	test("several flows stack down one page, each in its own frame", () => {
		const flow = SAMPLE.flows[0]!;
		const two: VariantContent = {
			...SAMPLE,
			flows: [
				flow,
				{
					id: "stale",
					name: "A person's edit arrives stale",
					participants: ["cli", "canvas"],
					steps: [
						{ id: "t1", from: "cli", to: "canvas", label: "PATCH at v41", kind: "sync" },
						{ id: "t2", from: "canvas", to: "cli", label: "409 stale", kind: "return" },
					],
				},
			],
		};
		const rendered = render(two);
		const first = rendered.atlas.regions["claim"]!;
		const second = rendered.atlas.regions["stale"]!;

		expect(first.y + first.height).toBeLessThanOrEqual(second.y);
		expect(intersects(first, second)).toBe(false);
		expect(within(rendered.atlas.edges["t1"]!, second)).toBe(true);

		// A participant in both flows is one identity drawn twice, and its atlas box
		// covers both drawings of it.
		expect(rendered.atlas.nodes["cli"]!.height).toBeGreaterThan(first.height);

		// The columns line up across the stack: one width for every flow on a page,
		// so the second flow's first column stands exactly where the first flow's
		// first column does, whoever is standing in it.
		expect(second.x).toBe(first.x);
		expect(rendered.atlas.nodes["cli"]!.x).toBe(rendered.atlas.nodes["agent"]!.x);
	});

	test("a flow with many participants and many steps is drawn, not refused", () => {
		const rendered = render(crowd(20, 120));

		expect(rendered.width).toBeGreaterThan(3000);
		expect(rendered.height).toBeGreaterThan(4000);
		for (let index = 0; index < 20; index += 1) {
			expect(rendered.atlas.nodes[`p${index}`]).toBeDefined();
		}
		for (let index = 0; index < 120; index += 1) {
			const box = rendered.atlas.edges[`m${index}`];
			expect(box).toBeDefined();
			expect(box!.width).toBeGreaterThan(0);
			expect(box!.height).toBeGreaterThan(0);
		}
		expect(rendered.atlas.edges["m119"]!.y).toBeGreaterThan(rendered.atlas.edges["m0"]!.y);
	});

	test("a flow with one participant talking to itself is still a sequence", () => {
		const rendered = render(
			variant({
				nodes: [{ id: "job", name: "Nightly Reindex", kind: "job" }],
				flows: [
					{
						id: "solo",
						name: "What the job does",
						participants: ["job"],
						steps: [{ id: "a1", from: "job", to: "job", label: "rebuild", kind: "self" }],
					},
				],
			}),
		);
		expect(rendered.atlas.nodes["job"]).toBeDefined();
		expect(rendered.atlas.edges["a1"]!.width).toBeGreaterThan(0);
	});

	test("content with no flow is refused rather than drawn", () => {
		let thrown: unknown;
		try {
			render(variant({ nodes: [{ id: "one", name: "Alone", kind: "service" }] }));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(SemanticRenderError);
		expect((thrown as SemanticRenderError).code).toBe("NOTHING_TO_RENDER");
	});

	test("an embedded render carries its faces instead of pointing at them", () => {
		const linked = renderDataFlow({ content: SAMPLE, theme: "light" });
		const embedded = renderDataFlow({ content: SAMPLE, theme: "light", fonts: "embedded" });

		expect(linked.svg).toContain('url("/assets/diagram-fonts/');
		expect(embedded.svg).not.toContain("/assets/diagram-fonts/");
		expect(embedded.svg).toContain('url("data:font/ttf;base64,');
		expect(embedded.atlas).toEqual(linked.atlas);
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
