import { describe, expect, test } from "bun:test";
import type { VariantContent } from "@archboard/model/content";
import { defaultSemanticPolicy, type SemanticPolicy } from "@archboard/model/policy";
import type { DiagramTheme } from "@archboard/model/render-reply";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import type { RenderedDiagram, StatedStandings } from "#shared/protocol/render-request.ts";
import { pointsOf } from "#tests/runtime/support/drawn-routes.ts";
import { drawnTexts } from "#tests/runtime/support/drawn-text.ts";

/**
 * Each line of words a document sets, in document order.
 * @param svg The document.
 * @returns The words.
 */
function wordsIn(svg: string): string[] {
	return drawnTexts(svg).map(({ text }) => text);
}
import { groupOf, strokesOf } from "#tests/runtime/support/drawn-subjects.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

// A line's colour says how its relationship travels, and the marks at its ends
// what it does (TASK-663.10): a mutation ends in a solid wedge with an imprint
// on its target, a query in an eye with a ring at its caller, a compute in an
// "=" and a small point, and a dependency that states none is broken and
// thinner with a detached chevron. Every body but the declared one is solid.

const policy = defaultSemanticPolicy();

/** Two parts in each of two modules, and a line of each effect between them. */
const LINES: VariantContent = orderedFixture({
	nodes: [
		{ id: "app", name: "App", kind: "service" },
		{ id: "ui", name: "Page", kind: "ui", parent: "app" },
		{ id: "api", name: "Client", kind: "module", parent: "app" },
		{ id: "back", name: "Back end", kind: "service" },
		{ id: "routes", name: "Routes", kind: "route", parent: "back" },
		{ id: "db", name: "Rows", kind: "datastore", parent: "back" },
	],
	edges: [
		{ id: "write", from: "api", to: "routes", kind: "http", effect: "mutation", label: "save" },
		{ id: "read", from: "routes", to: "db", kind: "storage", effect: "query", label: "rows" },
		{ id: "format", from: "ui", to: "api", kind: "sync", effect: "compute", label: "format" },
		{ id: "needs", from: "routes", to: "api", kind: "dependency", label: "types" },
	],
});

/**
 * Draw some content.
 * @param content What to draw.
 * @param options The policy, the theme and how each subject stands.
 * @param options.with The policy; the built-in one when absent.
 * @param options.theme The ground.
 * @param options.standing How each subject stands, for a comparison.
 * @param options.legend Whether the picture carries its legend.
 * @returns The drawn document.
 */
function drawn(
	content: VariantContent,
	options: {
		readonly with?: SemanticPolicy;
		readonly theme?: DiagramTheme;
		readonly standing?: StatedStandings;
		readonly legend?: boolean;
	} = {},
): Promise<RenderedDiagram> {
	return renderArchitecture({
		policy: options.with ?? policy,
		content,
		theme: options.theme ?? "light",
		standing: options.standing,
		...(options.legend === true ? { frame: { legend: "vertical" } } : {}),
	});
}

/**
 * What a line's group says of how it was drawn.
 * @param svg The document.
 * @param id The relationship.
 * @returns Its dash, head and effect, the dash its stroke is broken by, and its marks.
 */
function lineOf(svg: string, id: string) {
	const group = groupOf(svg, "edge", id);
	if (group === undefined) throw new Error(`nothing drew ${id}`);
	const start = /^<g[^>]*>/.exec(group.markup)![0];
	const fact = (name: string): string | undefined =>
		new RegExp(` ${name}="([^"]*)"`).exec(start)?.[1];
	return {
		dash: fact("data-line-dash"),
		arrowhead: fact("data-arrowhead"),
		effect: fact("data-line-effect"),
		color: fact("data-line-color"),
		stroke: strokesOf(group).at(-1)?.dash,
		markup: group.markup,
	};
}

/**
 * The marker a line's group defines for one end, by the end's attribute.
 * @param markup The line's group.
 * @param end `marker-end` or `marker-start`.
 * @returns The marker's markup, or undefined when that end has none.
 */
function markerAt(markup: string, end: "marker-end" | "marker-start"): string | undefined {
	const id = new RegExp(`${end}="url\\(#([^)]+)\\)"`, "u").exec(markup)?.[1];
	return id === undefined
		? undefined
		: new RegExp(`<marker id="${id}"[\\s\\S]*?</marker>`, "u").exec(markup)?.[0];
}

/**
 * A line's group without the ports it draws in its cards' walls.
 * @param markup The line's group.
 * @returns The rest of its markup.
 */
function outside(markup: string): string {
	return markup.replaceAll(/<g class="ab-port">.*?<\/g>/gsu, "");
}

describe("a line's ends say its effect", () => {
	for (const theme of ["light", "dark"] as const) {
		test(`each effect draws its own head, and only a declared line is broken, on the ${theme} ground`, async () => {
			const { svg } = await drawn(LINES, { theme });
			const read = (id: string) => {
				const { dash, arrowhead, effect, stroke } = lineOf(svg, id);
				return { dash, arrowhead, effect, stroke };
			};
			expect(read("write")).toEqual({
				dash: "solid",
				arrowhead: "wedge",
				effect: "mutation",
				stroke: undefined,
			});
			expect(read("read")).toEqual({
				dash: "solid",
				arrowhead: "eye",
				effect: "query",
				stroke: undefined,
			});
			expect(read("format")).toEqual({
				dash: "solid",
				arrowhead: "equals",
				effect: "compute",
				stroke: undefined,
			});
			expect(read("needs")).toEqual({
				dash: "declared",
				arrowhead: "detached",
				effect: "declared",
				stroke: "11 6",
			});
		});
	}

	test("a query rings its caller, and a mutation leaves an imprint on its target", async () => {
		const { svg } = await drawn(LINES);
		const query = lineOf(svg, "read").markup;
		expect(markerAt(query, "marker-start")).toContain("<circle");
		expect(markerAt(query, "marker-end")).toContain("<circle");
		expect(markerAt(lineOf(svg, "write").markup, "marker-start")).toBeUndefined();
		// The imprint is a short bar across the end of the line, beside the
		// line's ports.
		expect(outside(lineOf(svg, "write").markup)).toContain("<line ");
		expect(outside(query)).not.toContain("<line ");
	});

	test("a mutation's imprint lies wholly in front of its target's edge, on a glow in its ink", async () => {
		const { markup } = lineOf((await drawn(LINES)).svg, "write");
		// The halo runs to the tip, which touches the target's edge.
		const tip = pointsOf(/<path class="ab-halo" d="([^"]*)"/u.exec(markup)![1]!).at(-1)!;
		const lines = [...outside(markup).matchAll(/<line ([^>]*)\/>/gu)].map(([, attributes]) => {
			const number = (name: string) =>
				Number(new RegExp(` ?${name}="([^"]*)"`, "u").exec(attributes!)![1]);
			const style = /style="([^"]*)"/u.exec(attributes!)![1]!;
			return {
				middle: [(number("x1") + number("x2")) / 2, (number("y1") + number("y2")) / 2],
				width: number("stroke-width"),
				style,
				ink: /stroke:([^;]*)/u.exec(style)![1]!,
			};
		});
		const imprint = lines.find(({ style }) => !style.includes("filter"))!;
		const glow = lines.find(({ style }) => style.includes("filter:blur("))!;
		// Its far side touches the tip, so the card drawn over the line hides none of it.
		const fromTip = Math.hypot(imprint.middle[0]! - tip.x, imprint.middle[1]! - tip.y);
		expect(fromTip).toBeCloseTo(imprint.width / 2, 1);
		// The glow is the imprint's ink, at a strength of its own on each ground.
		expect(glow.ink).toContain(imprint.ink);
		expect(glow.width).toBeGreaterThan(imprint.width);
	});

	test("a line's body stops short of its head, and its halo runs to the tip", async () => {
		const { svg } = await drawn(LINES);
		const { markup } = lineOf(svg, "format");
		const halo = pointsOf(/<path class="ab-halo" d="([^"]*)"/u.exec(markup)![1]!).at(-1)!;
		const body = pointsOf(/<path d="([^"]*)"[^>]*marker-end=/u.exec(markup)![1]!).at(-1)!;
		expect(Math.hypot(halo.x - body.x, halo.y - body.y)).toBeGreaterThan(10);
	});

	test("a coloured line names its kind on its label, and a sync line does not", async () => {
		const texts = wordsIn((await drawn(LINES)).svg);
		expect(texts).toContain("HTTP · save");
		expect(texts).toContain("Storage · rows");
		expect(texts).toContain("Dependency · types");
		expect(texts).toContain("format");
		expect(texts.some((text) => text.startsWith("Sync"))).toBe(false);
	});

	test("a compared line wears its standing's ink, and its head still says its effect", async () => {
		const plain = lineOf((await drawn(LINES)).svg, "read");
		const added = lineOf((await drawn(LINES, { standing: { read: "added" } })).svg, "read");
		const [plainInk, addedInk] = [plain, added].map(
			({ markup }) =>
				/<path [^>]*marker-end="[^"]*" style="fill:none;stroke:([^"]+)"/u.exec(markup)![1]!,
		);
		expect(plainInk).toContain("--semantic-emerald");
		expect(addedInk).toContain("--standing-added");
		expect(addedInk).not.toContain("--semantic-emerald");
		expect(added.arrowhead).toBe("eye");
	});

	test("a reading from before effects keeps the dash and the head its policy recorded", async () => {
		const recorded: SemanticPolicy = {
			...policy,
			relationshipKinds: {
				call: { name: "Call", dash: "solid", arrowhead: "filled" },
				event: { name: "Event", color: "amber", dash: "dashed", arrowhead: "open" },
			},
		};
		const old = orderedFixture({
			nodes: [
				{ id: "a", name: "A", kind: "service" },
				{ id: "b", name: "B", kind: "service" },
			],
			edges: [{ id: "told", from: "a", to: "b", kind: "event", label: "changed" }],
		});
		const { svg } = await drawn(old, { with: recorded });
		expect(lineOf(svg, "told")).toMatchObject({
			dash: "dashed",
			arrowhead: "open",
			effect: undefined,
		});
		expect(wordsIn(svg)).toContain("changed");
	});
});

test("the legend keys each kind solid and lists the effects the picture draws", async () => {
	const { svg } = await drawn(LINES, { legend: true });
	const rows = [
		...svg.matchAll(
			/<g data-legend-entry="(relationship|effect)">([\s\S]*?)<text[^>]*>([^<]*)<\/text>/gu,
		),
	];
	const entries = rows.map((found) => `${found[1]}: ${found[3]}`);
	expect(entries).toEqual([
		"relationship: HTTP",
		"relationship: Storage",
		"relationship: Sync",
		"relationship: Dependency",
		"effect: Mutation",
		"effect: Query",
		"effect: Compute",
		"effect: Declared only",
	]);
	const sample = (name: string) => rows.find((row) => row[3] === name)?.[2] ?? "";
	expect(sample("Mutation")).toContain("filter:blur(");
	expect(sample("Query").match(/<circle\b/gu)).toHaveLength(2);
});
