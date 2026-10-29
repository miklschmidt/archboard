// A line between two cards stacked one above the other with a shared span once
// left one card by its side and entered the other by its side, although a
// straight drop through the shared span was free (Agent workbench's "Board
// changes reach the workhorse", IIS Ingress Migration's "Today: DNS points
// here").

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import sharedSpan from "#tests/runtime/support/fixtures/shared-span.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** The narrowest shared span a straight line keeps its nudging distance in. */
const SHARED_SPAN = 24;

test.each(["track"] as const)(
	"a line between stacked cards with a shared span leaves neither by its side (%s)",
	async (layout) => {
		const content = orderedFixture(sharedSpan);
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout,
		});
		const cards = new Map(
			Object.entries(drawing.atlas.nodes).filter(([id]) => !(id in drawing.atlas.regions)),
		);
		const routes = routePoints(drawing.svg);
		const sideExits = content.edges.flatMap(({ id, from, to }) => {
			const [one, other] = [cards.get(from), cards.get(to)];
			if (one === undefined || other === undefined) return [];
			const shared = Math.min(one.x + one.width, other.x + other.width) - Math.max(one.x, other.x);
			const stacked = one.y + one.height <= other.y || other.y + other.height <= one.y;
			if (!stacked || shared < SHARED_SPAN) return [];
			const points = routes.get(id)!;
			return [points, points.toReversed()]
				.filter(([end, next]) => Math.abs(end!.y - next!.y) < 0.01)
				.map(() => id);
		});
		expect(sideExits).toEqual([]);
	},
);
