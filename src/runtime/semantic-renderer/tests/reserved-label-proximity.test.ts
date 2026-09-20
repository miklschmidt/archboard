import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { routeLabels, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import nearby from "./reserved-label-near-endpoints.json";

test("an unrelated root card cannot displace a relationship from its reserved label", async () => {
	// The source formerly exchanged equal-size slots with Captures while its
	// reserved label stayed behind: 463px from endpoints only 219px apart.
	const drawing = await renderArchitecture({
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
