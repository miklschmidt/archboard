// A fan-in takes one deterministic solve and reaches its original target.
import { expect, test } from "bun:test";
import type { VariantContent } from "@archboard/board/content";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { installBunHost } from "#runtime/services/bun-host.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { installRendererHost, rendererHost } from "#shared/rules/render/host.ts";
import { endsOffCards } from "#tests/runtime/support/drawn-parents.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * Source blocks of two cards each, every card's line joining on its way into
 * one card of another block.
 * @param sources The source blocks.
 * @param tag Words that keep this board's layouts apart from another test's.
 * @returns The content.
 */
function joining(sources: readonly string[], tag: string): VariantContent {
	return orderedFixture({
		nodes: [
			...sources.map((id) => ({ id, name: `${id} ${tag}`, kind: "service" })),
			{ id: "target", name: "Target", kind: "service" },
			{ id: "dest", name: "Destination", kind: "module", parent: "target" },
			...sources.flatMap((parent) =>
				[1, 2].map((index) => ({
					id: `${parent}${index}`,
					name: `Source ${parent} ${index}`,
					kind: "module",
					parent,
				})),
			),
		],
		edges: sources.flatMap((source) =>
			[1, 2].map((index) => ({
				id: `${source}e${index}`,
				from: `${source}${index}`,
				to: "dest",
				kind: "call",
			})),
		),
	});
}

test.each([2, 3])("%i source blocks fan in with one solve", async (count) => {
	const sources = ["a", "b", "c"].slice(0, count);
	installBunHost();
	const host = rendererHost();
	let asked = 0;
	installRendererHost({
		...host,
		solve: (graph, signal) => {
			asked += 1;
			return host.solve(graph, signal);
		},
	});
	try {
		const content = joining(sources, "deterministic join");
		const drawing = await renderArchitecture({
			content,
			policy: DEFAULT_SEMANTIC_POLICY,
			layout: "blocks",
			theme: "light",
		});
		expect(asked).toBe(1);
		expect(endsOffCards(drawing, content)).toEqual([]);
	} finally {
		installRendererHost(host);
	}
});
