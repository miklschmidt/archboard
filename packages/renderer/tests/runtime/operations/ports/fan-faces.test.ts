// Lines leave and enter cards by the faces the reading runs through. A line
// to a card beside and below its own once dropped out of the bottom and ran
// under the trunk its siblings leave along, so every sibling hopped it
// (Skill evaluation's "One author run", cut down to the view's cards and
// relationships). A fan from one card to the cards below it once left by the
// card's sides, dropped through the gaps between its targets and entered
// them from the side (Skill evaluation's "Grading").

import { expect, test } from "bun:test";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { roundBridges, routePoints } from "#tests/runtime/support/drawn-routes.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import gradingFan from "#tests/runtime/support/fixtures/grading-fan.json";
import sideExit from "#tests/runtime/support/fixtures/side-exit.json";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

test.each(["track"] as const)(
	"lines to cards beside their source leave along the shared trunk without hops (%s)",
	async (layout) => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: orderedFixture(sideExit),
			theme: "light",
			layout,
		});
		const hops = [...drawing.svg.matchAll(/ d="([^"]+)"/gu)].flatMap(([, path]) =>
			roundBridges(path!),
		);
		expect(hops).toHaveLength(0);
	},
);

test.each(["track"] as const)(
	"a fan from one card to the cards below it leaves by the bottom and enters their tops (%s)",
	async (layout) => {
		const content = orderedFixture(gradingFan);
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout,
		});
		const routes = routePoints(drawing.svg);
		const fan = content.nodes.find(({ name }) => name === "Grading session")!.id;
		const across = content.edges.flatMap(({ id, from }) => {
			if (from !== fan) return [];
			const points = routes.get(id)!;
			const [leaving, entering] = [points.slice(0, 2), points.slice(-2)];
			return [leaving, entering]
				.filter(([one, other]) => Math.abs(one!.y - other!.y) < 0.01)
				.map(() => id);
		});
		expect(across).toEqual([]);
	},
);
