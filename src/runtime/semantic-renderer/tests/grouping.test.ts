import { describe, expect, test } from "bun:test";
import { VariantContentSchema } from "@/shared/semantic-board/index";
import { SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { themeColor } from "@/shared/theme/server";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";

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

describe("containment and type have independent visual channels", () => {
	for (const theme of ["light", "dark"] as const) {
		test(`expanded, inherited, collapsed and unknown types on ${theme}`, async () => {
			const expanded = await renderArchitecture({
				content: VariantContentSchema.parse({ nodes }),
				theme,
				policy,
			});
			const cluster = groupOf(expanded.svg, "region", "cluster")!.markup;
			const plain = groupOf(expanded.svg, "region", "plain")!.markup;
			const api = groupOf(expanded.svg, "node", "api")!.markup;
			const cloud = groupOf(expanded.svg, "region", "cloud")!.markup;
			// Nested surfaces must composite over their parents, not replace them
			// with a color preblended against an opaque card background.
			for (const [markup, color] of [
				[cloud, "blue"],
				[cluster, "green"],
				[plain, "green"],
				[api, "green"],
			] as const) {
				const body = markup.match(/<rect(?![^>]*class="ab-halo")[^>]*>/)![0];
				expect(body).toContain(`fill="${themeColor(theme, `--semantic-${color}`)}"`);
				expect(body).toContain('fill-opacity="0.07"');
				expect(body).not.toMatch(/(?:^|\s)opacity=/);
			}
			expect(expanded.svg.indexOf(cloud)).toBeLessThan(expanded.svg.indexOf(cluster));
			expect(expanded.svg.indexOf(cluster)).toBeLessThan(expanded.svg.indexOf(plain));
			expect(expanded.svg.indexOf(plain)).toBeLessThan(expanded.svg.indexOf(api));
			expect(cluster).toContain('data-body-color="green"');
			expect(cluster).toContain('data-type-color="green"');
			expect(plain).toContain('data-body-color="green"');
			expect(plain).toContain('data-type-color="neutral"');
			expect(api).toContain('data-body-color="green"');
			expect(api).toContain('data-type-color="violet"');
			expect(api).toContain(`stroke="${themeColor(theme, "--semantic-green")}"`);
			expect(api).toContain(`stroke="${themeColor(theme, "--semantic-violet")}"`);
			const collapsed = await renderArchitecture({
				content: VariantContentSchema.parse({ nodes: nodes.slice(0, 2) }),
				theme,
				policy,
			});
			const card = groupOf(collapsed.svg, "node", "cluster")!.markup;
			expect(card).toContain('data-body-color="blue"');
			expect(card).toContain('data-type-color="green"');
			expect(card).toContain('data-type-icon="RiShipLine"');
			const unknown = await renderArchitecture({
				content: VariantContentSchema.parse({
					nodes: [{ id: "u", name: "Old kind", kind: "retired" }],
				}),
				theme,
				policy,
			});
			expect(unknown.svg).toContain('data-body-color="neutral"');
			expect(unknown.svg).toContain('data-type-color="neutral"');
			expect(unknown.svg).toContain('data-type-icon="RiQuestionLine"');
		});
	}

	test("groups do not affect appearance and current policy can restyle unchanged meaning", async () => {
		const content = VariantContentSchema.parse({ nodes });
		const plain = await renderArchitecture({ content, theme: "light", policy });
		const groupedContent = structuredClone(content);
		for (const node of groupedContent.nodes) node.groups = ["migration"];
		const grouped = await renderArchitecture({
			content: groupedContent,
			theme: "light",
			policy,
		});
		expect(grouped).toEqual(plain);
		const aws = await renderArchitecture({
			content: VariantContentSchema.parse({ nodes: [{ ...nodes[0], kind: "aws" }, nodes[1]] }),
			theme: "light",
			policy,
		});
		expect(groupOf(aws.svg, "node", "cluster")!.markup).toContain('data-body-color="yellow"');
	});

	test("comparison overrides the border while preserving body tint and type chips", async () => {
		const rendered = await renderArchitecture({
			content: VariantContentSchema.parse({ nodes }),
			theme: "light",
			policy,
			standing: { api: "changed" },
		});
		const api = groupOf(rendered.svg, "node", "api")!.markup;
		const unmarked = await renderArchitecture({
			content: VariantContentSchema.parse({ nodes }),
			theme: "light",
			policy,
		});
		const before = groupOf(unmarked.svg, "node", "api")!.markup;
		expect(api.match(/rx="6" fill="([^"]+)"/)?.[1]).toBe(
			before.match(/rx="6" fill="([^"]+)"/)?.[1],
		);
		expect(api).toContain(`stroke="${themeColor("light", "--semantic-violet")}"`);
		expect(api).toContain('class="ab-halo"');
		expect(api).toContain('data-semantic-standing="changed"');
	});

	test("relationship policy owns color, dash and arrowhead; emphasis changes only weight", async () => {
		const content = VariantContentSchema.parse({
			nodes: nodes.slice(0, 2),
			edges: [{ id: "e", from: "cloud", to: "cluster", kind: "call" }],
		});
		const normal = await renderArchitecture({ content, theme: "light", policy });
		const emphasized = structuredClone(content);
		for (const edge of emphasized.edges) edge.emphasis = "hero";
		const hero = await renderArchitecture({
			content: emphasized,
			theme: "light",
			policy,
		});
		const edge = groupOf(normal.svg, "edge", "e")!.markup;
		expect(edge).toContain(`stroke="${themeColor("light", "--semantic-rose")}"`);
		expect(edge).toContain('stroke-dasharray="1.5 3.5"');
		expect(edge).toContain('data-arrowhead="open"');
		expect(hero.svg).not.toContain("<animateMotion");
		expect(groupOf(hero.svg, "edge", "e")!.markup).toContain(
			`stroke="${themeColor("light", "--semantic-rose")}"`,
		);
	});
});

test("inline panes never reuse an arrowhead ID for different appearance", async () => {
	const content = VariantContentSchema.parse({
		nodes: nodes.slice(0, 2),
		edges: [{ id: "e", from: "cloud", to: "cluster", kind: "call" }],
	});
	const current = await renderArchitecture({ content, theme: "light", policy });
	const proposal = await renderArchitecture({
		content,
		theme: "light",
		policy,
		standing: { e: "changed" },
	});
	const currentHead = groupOf(current.svg, "edge", "e")!.markup.match(
		/marker-end="url\(#([^)]+)\)"/,
	)![1]!;
	const proposedHead = groupOf(proposal.svg, "edge", "e")!.markup.match(
		/marker-end="url\(#([^)]+)\)"/,
	)![1]!;
	expect(currentHead).not.toBe(proposedHead);
	for (const [svg, head] of [
		[current.svg, currentHead],
		[proposal.svg, proposedHead],
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
		const content = VariantContentSchema.parse({
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
