import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { describe, expect, test } from "bun:test";
import { SemanticPolicySchema } from "@archboard/model/policy";
import { themeColor } from "#runtime/store/theme/source.ts";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { groupOf } from "#tests/runtime/support/drawn-subjects.ts";
import { chromaOf, hueOf, paintedIn } from "#tests/runtime/support/drawn-colours.ts";

/**
 * A card's or a container's block as painted: the front edge is its body, the
 * first rect after its selection ring, and the face is the third, over the
 * highlight along its top edge.
 * @param markup The subject's group, painted in literals.
 * @returns The two colours.
 */
function blockOf(markup: string): { edge: string; face: string } {
	const [edge, , face] = opaqueRects(markup);
	return { edge: edge!, face: face! };
}

/**
 * The opaque rects a subject paints after its selection ring, in order.
 * @param markup The subject's group, painted in literals.
 * @returns Their colours.
 */
function opaqueRects(markup: string): string[] {
	const afterHalo = markup.slice(markup.indexOf('class="ab-halo"'));
	return [...afterHalo.matchAll(/<rect[^>]* fill="(#[0-9a-f]{6})"\/>/gu)].map((found) => found[1]!);
}

/**
 * Every opaque colour of a frame: its tray, its floor and its tab.
 * @param markup The frame's group, painted in literals.
 * @returns Their colours.
 */
function frameFills(markup: string): string[] {
	const afterHalo = markup.slice(markup.indexOf('class="ab-halo"'));
	return [...afterHalo.matchAll(/ fill="(#[0-9a-f]{6})"/gu)].map((found) => found[1]!);
}

/**
 * One number attribute of a drawn tag.
 * @param tag The tag.
 * @param name The attribute.
 * @returns Its value.
 */
function read(tag: string, name: string): number {
	return Number(new RegExp(` ${name}="([^"]+)"`, "u").exec(tag)![1]);
}

/**
 * Whether two hues are within a few degrees of each other, round the circle.
 * @param a One hue.
 * @param b The other.
 * @returns True when they are.
 */
function sameHue(a: number, b: number): boolean {
	const apart = Math.abs(a - b) % 360;
	return Math.min(apart, 360 - apart) <= 15;
}

/**
 * The ink a card's type glyph is drawn in.
 * @param markup The card's group, painted in literals.
 * @returns The ink.
 */
function glyphOf(markup: string): string {
	return /data-type-icon="[^"]+"><svg[^>]* fill="(#[0-9a-f]{6})"/u.exec(markup)![1]!;
}

/**
 * The colour a relationship's line is stroked in: the path that ends in its arrowhead.
 * @param markup The relationship's group.
 * @returns The stroke colour.
 */
function lineStroke(markup: string): string {
	return /<path d="[^"]*" marker-end="[^"]*" fill="none" stroke="(#[0-9a-f]{6})"/u.exec(
		markup,
	)![1]!;
}

const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: {
		azure: { name: "Azure", icon: "RiCloudLine", color: "blue" },
		aws: { name: "AWS", icon: "RiCloudLine", color: "yellow" },
		kubernetes: { name: "Kubernetes", icon: "RiShipLine", color: "green" },
		api: { name: "API", icon: "RiCodeLine", color: "violet" },
		plain: { name: "Plain", icon: "RiBox3Line" },
	},
	relationshipKinds: {
		call: { name: "Request", color: "rose", dash: "dotted", arrowhead: "open" },
	},
});
const nodes = [
	{ id: "cloud", name: "Azure", kind: "azure" },
	{ id: "cluster", name: "Kubernetes", kind: "kubernetes", parent: "cloud" },
	{ id: "plain", name: "Plain", kind: "plain", parent: "cluster" },
	{ id: "api", name: "API", kind: "api", parent: "plain" },
];

test("the cards of a group stand together on the board", async () => {
	const nodes = ["a", "b", "c", "d", "e", "f"].map((id, at) => ({
		id,
		name: `Card ${id}`,
		kind: "plain",
		groups: [at % 2 === 0 ? "first" : "second"],
	}));
	const drawn = await renderArchitecture({
		content: orderedFixture({ nodes }),
		policy: SemanticPolicySchema.parse({
			...policy,
			groups: {
				first: { name: "First", color: "green" },
				second: { name: "Second", color: "orange" },
			},
		}),
	});
	const order = nodes.toSorted((one, other) => {
		const [a, b] = [drawn.atlas.nodes[one.id]!, drawn.atlas.nodes[other.id]!];
		return a.y - b.y || a.x - b.x;
	});
	const changes = order.filter((node, at) => at > 0 && node.groups[0] !== order[at - 1]!.groups[0]);
	expect(changes).toHaveLength(1);
});

describe("a group shows as a tag, and a card's face stays neutral", () => {
	const grouped = SemanticPolicySchema.parse({
		...policy,
		groups: { core: { name: "Core", color: "green" }, shell: { name: "Shell", color: "orange" } },
	});
	const members = [
		{ id: "cloud", name: "Azure", kind: "azure", groups: ["shell"] },
		{ id: "gate", name: "Gateway", kind: "api", parent: "cloud", groups: ["core"] },
		{ id: "work", name: "Worker", kind: "plain", parent: "cloud", groups: ["core", "shell"] },
		{ id: "side", name: "Sidecar", kind: "api", parent: "cloud" },
		{ id: "lone", name: "Lone", kind: "kubernetes", groups: ["core"] },
	];
	for (const theme of ["light", "dark"] as const) {
		test(`members, a card no group places, a container and a lone member on ${theme}`, async () => {
			const drawn = paintedIn(
				(await renderArchitecture({ content: orderedFixture({ nodes: members }), policy: grouped }))
					.svg,
				theme,
			);
			for (const id of ["gate", "work", "lone", "side"]) {
				const { edge, face } = blockOf(groupOf(drawn, "node", id)!.markup);
				expect(chromaOf(face), id).toBeLessThan(0.012);
				expect(chromaOf(edge), id).toBeLessThan(0.012);
			}
			// A member's tag stands in its near view. Its far view draws no button.
			const finishes = (id: string, color: string) =>
				groupOf(drawn, "node", id)!.markup.split(`url(#ab-door-${color})`).length - 1;
			expect(finishes("gate", "green")).toBe(1);
			expect(finishes("lone", "green")).toBe(1);
			expect(finishes("work", "green")).toBe(1);
			expect(finishes("work", "orange")).toBe(1);
			expect(groupOf(drawn, "node", "side")!.markup).not.toContain("url(#ab-door-");
			// A container holds its parts: it takes no colour and no tag of its groups.
			const frame = groupOf(drawn, "region", "cloud")!.markup;
			expect(frame).not.toContain("url(#ab-door-");
			const fills = frameFills(frame);
			expect(fills.length).toBeGreaterThan(0);
			for (const well of fills) expect(chromaOf(well), well).toBeLessThan(0.012);
			// The chip keeps its type's colour.
			expect(groupOf(drawn, "node", "gate")!.markup).toContain('data-type-color="violet"');
			expect(groupOf(drawn, "node", "lone")!.markup).toContain('data-type-color="green"');
			expect(groupOf(drawn, "region", "cloud")!.markup).toContain('data-type-color="blue"');
			const unknown = await renderArchitecture({
				content: orderedFixture({ nodes: [{ id: "u", name: "Old kind", kind: "retired" }] }),
				policy: grouped,
			});
			expect(unknown.svg).toContain('data-type-color="neutral"');
			expect(unknown.svg).toContain('data-type-icon="RiQuestionLine"');
		});
	}

	test("comparison borders the face while preserving the block's face, edge and type chip", async () => {
		const rendered = await renderArchitecture({
			content: orderedFixture({ nodes }),
			policy,
			standing: { api: "changed" },
		});
		const api = groupOf(paintedIn(rendered.svg), "node", "api")!.markup;
		const unmarked = await renderArchitecture({ content: orderedFixture({ nodes }), policy });
		const before = groupOf(paintedIn(unmarked.svg), "node", "api")!.markup;
		// The face and the front edge keep the group's colours (TASK-421).
		expect(blockOf(api)).toEqual(blockOf(before));
		// The standing takes over the face's outline: one dashed border in its ink,
		// inside the top face and flush with it, the front edge below it.
		const borders = [...api.matchAll(/<rect (?!class="ab-halo")[^>]*fill="none"[^>]*>/gu)].map(
			([tag]) => tag,
		);
		const border = borders.find((tag) => tag.includes("stroke-dasharray"));
		expect(border).toBeDefined();
		expect(border).toContain(`stroke="${themeColor("light", "--standing-changed")}"`);
		const body = /<rect [^>]*fill="#[0-9a-f]{6}"[^>]*>/u.exec(
			api.slice(api.indexOf('class="ab-halo"')),
		)![0];
		const half = read(border!, "stroke-width") / 2;
		expect(read(border!, "x") - half).toBeCloseTo(read(body, "x"), 3);
		expect(read(border!, "y") - half).toBeCloseTo(read(body, "y"), 3);
		expect(read(border!, "width") + 2 * half).toBeCloseTo(read(body, "width"), 3);
		expect(read(border!, "height") + 2 * half).toBeLessThan(read(body, "height"));
		expect(glyphOf(api)).toBe(glyphOf(before));
		expect(
			sameHue(hueOf(glyphOf(api)), hueOf(themeColor("light", "--semantic-violet"))),
		).toBeTrue();
		expect(api).toContain('class="ab-halo"');
		expect(api).toContain('data-semantic-standing="changed"');
	});

	test("relationship policy owns color, dash and arrowhead; emphasis changes only weight", async () => {
		const content = orderedFixture({
			nodes: nodes.slice(0, 2),
			edges: [{ id: "e", from: "cloud", to: "cluster", kind: "call" }],
		});
		const normal = await renderArchitecture({ content, policy });
		const emphasized = structuredClone(content);
		for (const edge of emphasized.edges) edge.emphasis = "hero";
		const hero = await renderArchitecture({ content: emphasized, policy });
		const edge = groupOf(paintedIn(normal.svg), "edge", "e")!.markup;
		// The line is drawn at its line strength: the kind's colour, weaker.
		const rose = hueOf(themeColor("light", "--semantic-rose"));
		expect(Math.abs(hueOf(lineStroke(edge)) - rose)).toBeLessThan(6);
		expect(edge).toContain('stroke-dasharray="1.5 3.5"');
		expect(edge).toContain('data-arrowhead="open"');
		expect(hero.svg).not.toContain("<animateMotion");
		expect(lineStroke(groupOf(paintedIn(hero.svg), "edge", "e")!.markup)).toBe(lineStroke(edge));
	});
});

test("inline panes never reuse an arrowhead ID for different appearance", async () => {
	const content = orderedFixture({
		nodes: nodes.slice(0, 2),
		edges: [{ id: "e", from: "cloud", to: "cluster", kind: "call" }],
	});
	const current = await renderArchitecture({ content, policy });
	const proposal = await renderArchitecture({ content, policy, standing: { e: "changed" } });
	const currentHead = groupOf(current.svg, "edge", "e")!.markup.match(
		/marker-end="url\(#([^)]+)\)"/,
	)![1]!;
	const proposedHead = groupOf(proposal.svg, "edge", "e")!.markup.match(
		/marker-end="url\(#([^)]+)\)"/,
	)![1]!;
	expect(currentHead).not.toBe(proposedHead);
	for (const [svg, head] of [
		[paintedIn(current.svg), currentHead],
		[paintedIn(proposal.svg), proposedHead],
	]) {
		const definition = svg!.match(new RegExp(`<marker id="${head}"[\\s\\S]*?</marker>`))![0];
		const lineInk = groupOf(svg!, "edge", "e")!.markup.match(
			/<path[^>]*marker-end="[^"]+"[^>]*stroke="([^"]+)"/,
		)![1]!;
		expect(definition).toContain(`stroke="${lineInk}"`);
	}
});

test("removed vocabulary keys matching object prototype names render neutral", async () => {
	for (const kind of ["constructor", "toString"]) {
		const content = orderedFixture({
			nodes: [
				{ id: "a", name: "A", kind },
				{ id: "b", name: "B", kind: "api" },
			],
			edges: [{ id: "e", from: "a", to: "b", kind }],
		});
		const drawing = await renderArchitecture({ content, theme: "light", policy });
		const node = groupOf(drawing.svg, "node", "a")!.markup;
		const edge = groupOf(drawing.svg, "edge", "e")!.markup;
		expect(node).toContain('data-type-icon="RiQuestionLine"');
		expect(node).toContain('data-type-color="neutral"');
		expect(edge).toContain('data-line-color="neutral"');
		expect(edge).toContain('data-line-dash="solid"');
		expect(edge).toContain('data-arrowhead="filled"');
	}
});
