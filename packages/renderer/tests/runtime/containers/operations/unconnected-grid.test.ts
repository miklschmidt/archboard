// What this catches: a container of cards nothing connects drawn as one long
// row again, or as a grid whose rows do not line up or whose frame stands wide of it.

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";

/** The most room a container keeps beside what it holds. */
const FRAME_ROOM = 24;

test("a container of cards nothing connects sets them out as a grid", async () => {
	const apps = Array.from({ length: 11 }, (_, index) => `app${index}`);
	const portfolio = orderedFixture({
		nodes: [
			{ id: "apps", name: "Application portfolio", kind: "service" },
			...apps.map((id) => ({
				id,
				name: `Application ${id}`,
				kind: "module",
				parent: "apps",
			})),
		],
		edges: [],
	});
	const drawing = await renderArchitecture({
		policy: defaultSemanticPolicy(),
		content: portfolio,
		theme: "light",
	});
	const cards = apps.map((id) => drawing.atlas.nodes[id]!);
	const rows = new Set(cards.map(({ y }) => y));
	const columns = new Set(cards.map(({ x }) => x));
	expect(rows.size).toBeGreaterThan(1);
	// Every row lines up under the first: no card stands off the grid's columns.
	expect(columns.size).toBe(Math.ceil(cards.length / rows.size));
	// And the container hugs its grid, with no more than its insets beside it.
	const frame = drawing.atlas.nodes["apps"]!;
	const span =
		Math.max(...cards.map(({ x, width }) => x + width)) - Math.min(...cards.map(({ x }) => x));
	expect(frame.width - span).toBeLessThanOrEqual(2 * FRAME_ROOM);
});
