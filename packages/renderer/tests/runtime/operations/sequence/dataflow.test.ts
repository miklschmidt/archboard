import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { describe, expect, test } from "bun:test";
import type { DiagramBox, DiagramTheme } from "@archboard/board/render-reply";
import type { VariantContent } from "@archboard/board/content";
import { renderSemanticView } from "#runtime/operations/render.ts";
import { SemanticRenderError, type RenderedDiagram } from "#shared/protocol/render-request.ts";
import { drawnSpan, drawnTexts, labelPlates, spanFits } from "#tests/runtime/support/drawn-text.ts";
import { routeEnds } from "#tests/runtime/support/drawn-routes.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const policy = DEFAULT_SEMANTIC_POLICY;

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
	return orderedFixture(content);
}

/**
 * One content both grammars can draw: an architecture, and an exchange between
 * the same nodes.
 */
const SAMPLE: VariantContent = variant({
	nodes: [
		{ id: "agent", name: "Agent", kind: "external", responsibility: "Claude, through the CLI" },
		{ id: "cli", name: "archboard CLI", kind: "app", responsibility: "One command, one write" },
		{ id: "server", name: "Archboard server", kind: "service", responsibility: "Holds the leases" },
		{ id: "io", name: "board-io", kind: "module", responsibility: "Reads and writes the note" },
		{ id: "vault", name: "Obsidian Vault", kind: "datastore", responsibility: "The note on disk" },
	],
	edges: [
		{ id: "x1", from: "agent", to: "cli", kind: "call", label: "invokes" },
		{ id: "x2", from: "cli", to: "server", kind: "http", label: "HTTP" },
		{ id: "x3", from: "server", to: "io", kind: "call", label: "read and write" },
		{ id: "x4", from: "io", to: "vault", kind: "data", label: "atomic write" },
	],
	flows: [
		{
			id: "claim",
			name: "An agent claims a board and edits it",
			summary: "One writer at a time, and the note still decides",
			participants: ["agent", "cli", "server", "io", "vault"],
			steps: [
				{ id: "s1", from: "agent", to: "cli", label: "draw --doing", kind: "sync" },
				{ id: "s2", from: "cli", to: "server", label: "POST /claim", kind: "sync" },
				{ id: "s3", from: "server", to: "server", label: "retry once", kind: "self" },
				{ id: "s4", from: "server", to: "cli", label: "claim held", kind: "return" },
				{ id: "s5", from: "server", to: "io", label: "read the note", kind: "sync" },
				{ id: "s6", from: "io", to: "vault", label: "readFileSync", kind: "sync", repeat: 2 },
				{ id: "s7", from: "vault", to: "io", label: "note bytes", kind: "return" },
				{ id: "s8", from: "server", to: "agent", label: "written at v42", kind: "async" },
				{
					id: "s9",
					from: "io",
					to: "vault",
					label: "an unusually long label for a short hop between two columns",
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
async function render(
	content: VariantContent = SAMPLE,
	theme: DiagramTheme = "light",
): Promise<RenderedDiagram> {
	return await renderSemanticView({ policy, content, theme, grammar: "sequence" });
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

describe("a sequence render", () => {
	test("the same content and theme produce the same bytes", async () => {
		expect((await render()).svg).toBe((await render()).svg);
	});

	test("every participant and every step lands somewhere on the page", async () => {
		const rendered = await render();
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

	test("a participant is its card and the whole column of time under it", async () => {
		const rendered = await render();
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
			policy,
			content: SAMPLE,
			grammar: "sequence",
			theme: "light",
		});
		const architecture = await renderSemanticView({
			policy,
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

	test("messages are drawn in the order the flow states them", async () => {
		const rendered = await render();
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
		const after = await render(swapped);
		expect(rendered.atlas.edges["s1"]!.y).toBeLessThan(rendered.atlas.edges["s2"]!.y);
		expect(after.atlas.edges["s2"]!.y).toBeLessThan(after.atlas.edges["s1"]!.y);
	});

	test("a self message stays inside its own column's run", async () => {
		const rendered = await render();
		const loop = rendered.atlas.edges["s3"]!;
		const sender = rendered.atlas.nodes["server"]!;
		const neighbour = rendered.atlas.nodes["io"]!;

		// It leaves its own lifeline and comes back to it, so it starts inside its
		// sender's column and reaches to the right of the lifeline; a column is
		// wide enough that the loop need not leave it.
		expect(loop.x).toBeGreaterThanOrEqual(sender.x);
		expect(loop.x + loop.width).toBeGreaterThan(sender.x + sender.width / 2);

		// And a label of ordinary length lands in the air between the two columns
		// rather than over the next one. A label longer than that run rides over
		// the next lifeline, exactly as a long architecture label rides over a
		// card: the plate is opaque so that it stays readable when it does.
		expect(intersects(loop, neighbour)).toBe(false);

		// Its row is taller than a crossing message's, because the loop drops below
		// the row it turns back into.
		expect(loop.height).toBeGreaterThan(rendered.atlas.edges["s2"]!.height);
	});

	test("a message's words belong to the message, in the markup and in the atlas", async () => {
		const rendered = await render();
		const labelled = drawnTexts(rendered.svg).filter((text) => text.text === "read the note");

		expect(labelled).toHaveLength(1);
		expect(labelled[0]!.subject).toEqual({ kind: "step", id: "s5" });

		const span = drawnSpan(labelled[0]!);
		expect(spanFits(span, rendered.atlas.edges["s5"]!)).toBe(true);
		// And inside the plate it is printed on, which is sized independently of
		// the atlas: a plate measured in the wrong face overflows this, not that.
		expect(spanFits(span, labelPlates(rendered.svg, "step").get("s5")!)).toBe(true);

		// A label longer than the hop it names wraps onto lines of its own, and
		// every one of them is the message's words too, in the atlas and on the plate.
		const long = drawnTexts(rendered.svg).filter((text) => text.subject.id === "s9");
		expect(long.length).toBeGreaterThan(1);
		for (const line of long) {
			expect(spanFits(drawnSpan(line), rendered.atlas.edges["s9"]!)).toBe(true);
			expect(spanFits(drawnSpan(line), labelPlates(rendered.svg, "step").get("s9")!)).toBe(true);
		}
	});

	test("a repeated step says so rather than being drawn twice", async () => {
		const rendered = await render();
		const drawn = drawnTexts(rendered.svg).filter((text) => text.subject.id === "s6");
		expect(drawn.map((text) => text.text)).toEqual(["readFileSync ×2"]);
		expect(spanFits(drawnSpan(drawn[0]!), rendered.atlas.edges["s6"]!)).toBe(true);
	});

	test("every drawn word fits its subject, measured in the face it is drawn in", async () => {
		const rendered = await render();
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
			expect(spanFits(drawnSpan(text), box!)).toBe(true);
		}
	});

	test("a crossing message arrives at the lifeline it names", async () => {
		const rendered = await render();
		const arrival = routeEnds(rendered.svg, "step").get("s2");
		expect(arrival).toBeDefined();

		const receiver = rendered.atlas.nodes["server"]!;
		const lifeline = receiver.x + receiver.width / 2;
		// Short of the lifeline by the width of the bar it is busy with, less
		// than a column.
		expect(lifeline - arrival!.x).toBeGreaterThan(0);
		expect(lifeline - arrival!.x).toBeLessThan(16);
		expect(arrival!.y).toBeGreaterThan(rendered.atlas.edges["s1"]!.y);
	});

	test("every subject carries the hooks a viewer selects by", async () => {
		const rendered = await render();
		expect(rendered.svg).toContain('data-semantic-kind="node" data-semantic-id="io"');
		expect(rendered.svg).toContain('data-semantic-kind="step" data-semantic-id="s5"');
		expect(rendered.svg).toContain('data-semantic-kind="flow" data-semantic-id="claim"');
		// The flow's head of cards, which a viewer moves, over a ground the picture hides.
		expect(rendered.svg).toContain(
			'<g data-flow-head="claim"><g class="ab-head-shade" visibility="hidden">',
		);
		expect(rendered.svg).toContain(".is-selected");
		expect(rendered.svg).not.toContain("<script");
	});

	test("several flows stack down one page, each in its own frame", async () => {
		const flow = SAMPLE.flows[0]!;
		const two: VariantContent = {
			...SAMPLE,
			flows: [
				flow,
				{
					id: "stale",
					name: "A user's edit arrives stale",
					participants: ["cli", "server"],
					steps: [
						{ id: "t1", from: "cli", to: "server", label: "PATCH at v41", kind: "sync" },
						{ id: "t2", from: "server", to: "cli", label: "409 stale", kind: "return" },
					],
				},
			],
		};
		const rendered = await render(two);
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

	test("a flow with many participants and many steps is drawn, not refused", async () => {
		const rendered = await render(crowd(20, 120));

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

	test("a flow with one participant talking to itself is still a sequence", async () => {
		const rendered = await render(
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
		const loop = [...rendered.svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)]
			.map((match) => match[1]!)
			.find((path) => /\ba[\d.]+,/.test(path))!;
		expect(
			[...loop.matchAll(/\ba([\d.]+),([\d.]+)/g)].map((arc) => [Number(arc[1]), Number(arc[2])]),
		).toEqual([
			[8, 8],
			[8, 8],
		]);
	});

	test("content with no flow is refused rather than drawn", async () => {
		let thrown: unknown;
		try {
			await render(variant({ nodes: [{ id: "one", name: "Alone", kind: "service" }] }));
		} catch (error) {
			thrown = error;
		}
		expect(thrown).toBeInstanceOf(SemanticRenderError);
		expect((thrown as SemanticRenderError).code).toBe("NOTHING_TO_RENDER");
	});

	test("the two themes are different pictures of the same geometry", async () => {
		const light = await render(SAMPLE, "light");
		const dark = await render(SAMPLE, "dark");
		expect(dark.svg).not.toBe(light.svg);
		expect(dark.width).toBe(light.width);
		expect(dark.height).toBe(light.height);
		expect(dark.atlas).toEqual(light.atlas);
	});
	test("a participant's name is drawn complete however long it is", async () => {
		// The column cap keeps one long name from widening every column, and a
		// long name shrinks its title first; but a name is the one text a card
		// cannot wrap, so past the smallest title size the columns widen rather
		// than cut it. A cut name is a participant nobody can name.
		const long = variant({
			nodes: [
				{ id: "srv", name: "WSGI server", kind: "external" },
				{
					id: "push",
					name: "RequestContext.push",
					kind: "function",
					responsibility:
						"Binds the request and the session for one request, then matches the URL against the app's rules",
				},
				{ id: "match", name: "RequestContext.match_request", kind: "function" },
				{ id: "view", name: "View function", kind: "function" },
			],
			flows: [
				{
					id: "f",
					name: "Handle a request",
					participants: ["srv", "push", "match", "view"],
					steps: [
						{ id: "s1", from: "srv", to: "push", label: "push()", kind: "sync" },
						{ id: "s2", from: "push", to: "match", label: "match_request()", kind: "sync" },
						{ id: "s3", from: "match", to: "view", label: "view(**view_args)", kind: "sync" },
					],
				},
			],
		});
		const drawn = drawnTexts((await render(long)).svg);
		expect(drawn.map((text) => text.text)).toContain("RequestContext.match_request");
		expect(drawn.some((text) => text.text.endsWith("…"))).toBe(false);
		// The responsibility still wraps into lines under its card rather than
		// widening the columns to hold it whole.
		expect(drawn.filter((text) => text.subject.id === "push").length).toBeGreaterThan(2);
	});
});
