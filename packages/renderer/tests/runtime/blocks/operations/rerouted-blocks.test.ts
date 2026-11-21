import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import settledWall from "#tests/runtime/support/fixtures/settled-wall.json";
import { wallHugs } from "#tests/runtime/support/drawn-checks.ts";
import { fixtureDocument } from "#tests/runtime/support/model-documents.ts";

test("settling a container's ports keeps its routes clear of its wall", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(settledWall.content),
		policy: fixtureDocument("semanticPolicy", settledWall.policy),
		theme: "light",
		layout: "track",
	});
	expect(wallHugs(drawing)).toEqual([]);
});
