import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { routeLabels, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import nearby from "#tests/runtime/support/fixtures/reserved-label-near-endpoints.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

test("an unrelated root card cannot displace a relationship from its reserved label", async () => {
	// The source formerly exchanged equal-size slots with Captures while its
	// reserved label stayed behind: 463px from endpoints only 219px apart.
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture(nearby),
		theme: "light",
	});
	const label = routeLabels(drawing.svg).get("25DiejPQ")!;
	const route = routePoints(drawing.svg).get("25DiejPQ")!;
	const from = route[0]!;
	const to = route.at(-1)!;
	const x = label.x + label.width / 2;
	const y = label.y + label.height / 2;
	const reach = Math.min(Math.hypot(x - from.x, y - from.y), Math.hypot(x - to.x, y - to.y));
	expect(reach).toBeLessThanOrEqual(Math.hypot(from.x - to.x, from.y - to.y));
});
