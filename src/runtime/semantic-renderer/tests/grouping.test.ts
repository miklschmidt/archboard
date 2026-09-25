import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { describe, expect, test } from "bun:test";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { themeColor } from "@/shared/theme/server";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";
import { hueOf, paintedIn } from "@/runtime/semantic-renderer/tests/drawn-colours";

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

describe("a card's body takes its group's colour and its chip its type's", () => {
	const grouped = SemanticPolicySchema.parse({
		...policy,
		groups: { core: { name: "Core", color: "green" } },
	});
	const members = [
		{ id: "cloud", name: "Azure", kind: "azure" },
		{ id: "gate", name: "Gateway", kind: "api", parent: "cloud", groups: ["core"] },
		{ id: "work", name: "Worker", kind: "plain", parent: "cloud", groups: ["core"] },
		{ id: "side", name: "Sidecar", kind: "api", parent: "cloud" },
		{ id: "lone", name: "Lone", kind: "kubernetes", groups: ["core"] },
	];
	for (const theme of ["light", "dark"] as const) {
		test(`group members, a card no group places, a container and a lone member on ${theme}`, async () => {
			const drawn = paintedIn(
				(await renderArchitecture({ content: orderedFixture({ nodes: members }), policy: grouped }))
					.svg,
				theme,
			);
			for (const id of ["gate", "work"]) {
				const markup = groupOf(drawn, "node", id)!.markup;
				const body = markup.match(/<rect(?![^>]*class="ab-halo")[^>]*>/)![0];
				expect(body).toContain(`fill="${themeColor(theme, "--semantic-green")}"`);
				expect(body).toContain('fill-opacity="0.07"');
				expect(markup).toContain('data-body-color="green"');
			}
			// Each card and region carries its name, for a viewer that keeps it readable when small.
			expect(groupOf(drawn, "node", "gate")!.markup).toContain('data-caption="Gateway"');
			expect(groupOf(drawn, "region", "cloud")!.markup).toContain('data-caption="Azure"');
			// A container colours nothing inside it, however its own kind is coloured.
			expect(groupOf(drawn, "node", "side")!.markup).toContain('data-body-color="neutral"');
			expect(groupOf(drawn, "region", "cloud")!.markup).toContain('data-body-color="neutral"');
			// A group with one member among its siblings places nobody.
			expect(groupOf(drawn, "node", "lone")!.markup).toContain('data-body-color="neutral"');
			// The chip keeps its type's colour.
			expect(groupOf(drawn, "node", "gate")!.markup).toContain('data-type-color="violet"');
			expect(groupOf(drawn, "node", "lone")!.markup).toContain('data-type-color="green"');
			expect(groupOf(drawn, "region", "cloud")!.markup).toContain('data-type-color="blue"');
			const unknown = await renderArchitecture({
				content: orderedFixture({ nodes: [{ id: "u", name: "Old kind", kind: "retired" }] }),
				policy: grouped,
			});
			expect(unknown.svg).toContain('data-body-color="neutral"');
			expect(unknown.svg).toContain('data-type-color="neutral"');
			expect(unknown.svg).toContain('data-type-icon="RiQuestionLine"');
		});
	}

	test("the current policy restyles unchanged meaning: a group's colour, not the board, decides", async () => {
		const content = orderedFixture({ nodes: members });
		const green = await renderArchitecture({ content, theme: "light", policy: grouped });
		const yellow = await renderArchitecture({
			content,
			theme: "light",
			policy: SemanticPolicySchema.parse({
				...policy,
				groups: { core: { name: "Core", color: "yellow" } },
			}),
		});
		expect(groupOf(green.svg, "node", "gate")!.markup).toContain('data-body-color="green"');
		expect(groupOf(yellow.svg, "node", "gate")!.markup).toContain('data-body-color="yellow"');
	});

	test("comparison overrides the border while preserving body tint and type chips", async () => {
		const rendered = await renderArchitecture({
			content: orderedFixture({ nodes }),
			policy,
			standing: { api: "changed" },
		});
		const api = groupOf(paintedIn(rendered.svg), "node", "api")!.markup;
		const unmarked = await renderArchitecture({ content: orderedFixture({ nodes }), policy });
		const before = groupOf(paintedIn(unmarked.svg), "node", "api")!.markup;
		expect(api.match(/rx="6" fill="([^"]+)"/)?.[1]).toBe(
			before.match(/rx="6" fill="([^"]+)"/)?.[1],
		);
		expect(api).toContain(`stroke="${themeColor("light", "--semantic-violet")}"`);
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
