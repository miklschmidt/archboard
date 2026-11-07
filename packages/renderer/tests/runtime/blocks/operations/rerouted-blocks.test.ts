import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/bun-renderer/operations/render.ts";
import { SemanticPolicySchema } from "@archboard/model/policy";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import settledWall from "#tests/runtime/support/fixtures/settled-wall.json";
import { wallHugs } from "#tests/runtime/support/drawn-checks.ts";

test("settling a container's ports keeps its routes clear of its wall", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(settledWall.content),
		policy: SemanticPolicySchema.parse(settledWall.policy),
		theme: "light",
		layout: "track",
	});
	expect(wallHugs(drawing)).toEqual([]);
});
