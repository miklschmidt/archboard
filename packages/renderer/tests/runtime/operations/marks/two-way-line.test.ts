// A line that runs both ways, as a reader sees it (reader redesign, rule 2).
//
// What this catches: a two-way line that loses the head at its start, in the
// document that the reader, the CLI and an export all draw.

import { expect, test } from "bun:test";

import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/model/policy";

test("a two-way line ends in the same head at each end, and a one-way line in one", async () => {
	const authored = orderedFixture({
		nodes: ["a", "b", "c"].map((id) => ({ id, name: id, kind: "module" })),
		edges: [
			{ id: "both", from: "a", to: "b", kind: "call" },
			{ id: "one", from: "b", to: "c", kind: "call" },
		],
	});
	// A reading words a line two-way, and a board stores no such field.
	const edges = authored.edges.map((edge) => ({ ...edge, twoWay: edge.id === "both" }));
	const { svg } = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: { ...authored, edges },
		theme: "light",
	});
	const lines = [...svg.matchAll(/data-semantic-kind="edge" data-semantic-id="(\w+)".*?<\/g>/gsu)];
	const heads = new Map(
		lines.map(([group, id]) => [
			id,
			/<path(?![^>]*ab-halo)[^>]*marker-end=[^>]*>/u.exec(group)?.[0],
		]),
	);
	const both = heads.get("both") ?? "";
	expect(/marker-start="([^"]*)"/u.exec(both)?.[1]).toBe(/marker-end="([^"]*)"/u.exec(both)?.[1]);
	expect(heads.get("one")).not.toContain("marker-start");
});
