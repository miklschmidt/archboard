import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import { expect, test } from "bun:test";
import fixture from "#tests/runtime/support/fixtures/channel-projection.json";
import { renderArchitecture } from "#runtime/operations/render.ts";
import type { ChangeKind } from "@archboard/board/comparison";
import { corridorPoints, routeLabels, routeCrosses } from "#tests/runtime/support/drawn-routes.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

// Six real cards retain the incoming/outgoing channel conflict and the
// diagonal relationship whose reserved label used to add a return loop.
test("label waypoints and distinct channels share clear direct approaches", async () => {
	const drawing = await renderArchitecture({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: orderedFixture(fixture.content),
		standing: fixture.standing as Record<string, ChangeKind>,
		theme: "dark",
	});
	const routes = corridorPoints(drawing.svg);
	const direct = routes.get("d7kqpa89")!;
	expect(
		Math.max(...direct.map((point) => point.x)) - Math.min(...direct.map((point) => point.x)),
	).toBeLessThan(0.01);
	const diagonal = routes.get("TR9Ic6TU")!;
	// A downward route may turn around the neighboring card, but must not
	// double back toward the off-route label before returning to its target.
	for (let index = 1; index < diagonal.length; index++)
		expect(diagonal[index]!.x).toBeLessThanOrEqual(diagonal[index - 1]!.x + 0.01);
	for (const [id, box] of routeLabels(drawing.svg))
		for (const [other, points] of routes)
			if (id !== other) expect(routeCrosses(points, box)).toBe(false);
});
