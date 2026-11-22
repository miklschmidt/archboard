import { describe, expect, test } from "bun:test";
import type { VariantContent } from "@archboard/model/content";
import { defaultSemanticPolicy, type SemanticPolicy } from "@archboard/model/policy";
import type { DiagramTheme } from "@archboard/model/render-reply";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import type { RenderedDiagram, StatedStandings } from "#shared/protocol/render-request.ts";
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

// A line's colour says how its relationship travels and its dash what it does
// (TASK-663): solid for a mutation, dashed for a query, dotted for a compute,
// and a dash and a dot for a dependency that states none. Every head is filled
// and says only the direction.

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
		{ id: "format", from: "ui", to: "api", kind: "call", effect: "compute", label: "format" },
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
 * @returns Its dash, head, effect and rails, and the dash its stroke is broken by.
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
		rails: fact("data-line-rails") === "true",
		color: fact("data-line-color"),
		stroke: strokesOf(group).at(-1)?.dash,
		markup: group.markup,
	};
}

describe("a line's dash says its effect", () => {
	for (const theme of ["light", "dark"] as const) {
		test(`each effect draws its own line type with a filled head, on the ${theme} ground`, async () => {
			const { svg } = await drawn(LINES, { theme });
			const read = (id: string) => {
				const { dash, arrowhead, effect, stroke } = lineOf(svg, id);
				return { dash, arrowhead, effect, stroke };
			};
			expect(read("write")).toEqual({
				dash: "solid",
				arrowhead: "filled",
				effect: "mutation",
				stroke: undefined,
			});
			expect(read("read")).toEqual({
				dash: "dashed",
				arrowhead: "filled",
				effect: "query",
				stroke: "6 4",
			});
			expect(read("format")).toEqual({
				dash: "dotted",
				arrowhead: "filled",
				effect: "compute",
				stroke: "1.5 3.5",
			});
			expect(read("needs")).toEqual({
				dash: "declared",
				arrowhead: "filled",
				effect: "declared",
				stroke: "7 3 1.5 3",
			});
		});
	}

	test("a coloured line names its kind on its label, and a call does not", async () => {
		const texts = wordsIn((await drawn(LINES)).svg);
		expect(texts).toContain("HTTP · save");
		expect(texts).toContain("Storage · rows");
		expect(texts).toContain("Dependency · types");
		expect(texts).toContain("format");
		expect(texts.some((text) => text.startsWith("Call"))).toBe(false);
	});

	test("a compared line wears its standing's ink, and its dash still says its effect", async () => {
		const plain = lineOf((await drawn(LINES)).svg, "read");
		const added = lineOf((await drawn(LINES, { standing: { read: "added" } })).svg, "read");
		const stroked = (markup: string): string =>
			/<path [^>]*style="fill:none;stroke:([^"]+)"[^>]*stroke-dasharray="6 4"/.exec(markup)![1]!;
		expect(stroked(plain.markup)).toContain("--semantic-emerald");
		expect(stroked(added.markup)).toContain("--standing-added");
		expect(stroked(added.markup)).not.toContain("--semantic-emerald");
		expect(added.dash).toBe("dashed");
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
	const entries = [
		...svg.matchAll(
			/<g data-legend-entry="(relationship|effect)">[\s\S]*?<text[^>]*>([^<]*)<\/text>/gu,
		),
	].map((found) => `${found[1]}: ${found[2]}`);
	expect(entries).toEqual([
		"relationship: HTTP",
		"relationship: Storage",
		"relationship: Call",
		"relationship: Dependency",
		"effect: Mutation",
		"effect: Query",
		"effect: Compute",
		"effect: Declared only",
	]);
});
