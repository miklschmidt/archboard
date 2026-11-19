import { expect, test } from "bun:test";
import { defaultSemanticPolicy } from "@archboard/model/policy";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { labelsAcrossWalls } from "#tests/runtime/support/drawn-checks.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import fixture from "#tests/runtime/support/fixtures/leaving-label-frame.json";

test("a leaving relationship's label stays wholly on one side of its parent frame", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(fixture),
		policy: {
			...defaultSemanticPolicy(),
			groups: {
				g: { name: "Worker group", color: "teal" },
				h: { name: "State", color: "orange" },
			},
		},
		layout: "track",
		theme: "light",
	});
	expect(labelsAcrossWalls(drawing)).toEqual([]);
});
