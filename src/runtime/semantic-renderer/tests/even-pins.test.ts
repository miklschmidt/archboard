// libavoid charges a pin its distance from its card's centre, so a line to a
// card beside and below its own dropped out of the bottom and ran under the
// trunk its siblings leave along, and every sibling hopped it. Evened pins let
// it leave along that trunk (Skill evaluation's "One author run", cut down to
// the view's cards and relationships). Evened pins may not make a card's side
// as cheap as its face in the reading direction: a fan from one card to the
// cards below it left by the card's sides, dropped through the gaps between
// its targets and entered them from the side (Skill evaluation's "Grading").

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import { tidierSettlement, type ArchitectureDrawing } from "@/runtime/semantic-renderer/layout";
import { roundBridges, routePoints } from "@/runtime/semantic-renderer/tests/drawn-routes";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { at, sketch, type Line } from "@/runtime/semantic-renderer/tests/sketched-drawings";
import gradingFan from "./grading-fan.json";
import sideExit from "./side-exit.json";

test("lines to cards beside their source leave along the shared trunk without hops", async () => {
	const drawing = await renderArchitecture({
		content: orderedFixture(sideExit),
		theme: "light",
		layout: "graphviz",
	});
	const hops = [...drawing.svg.matchAll(/ d="([^"]+)"/gu)].flatMap(([, path]) =>
		roundBridges(path!),
	);
	expect(hops).toHaveLength(0);
});

test("a fan from one card to the cards below it leaves by the bottom and enters their tops", async () => {
	const content = orderedFixture(gradingFan);
	const drawing = await renderArchitecture({ content, theme: "light", layout: "graphviz" });
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
});

/**
 * The settlement kept of a plain one and an evened one.
 * @param plain The drawing with plain pins.
 * @param even The drawing with evened pins.
 * @returns Which one is kept.
 */
async function kept(plain: ArchitectureDrawing, even: ArchitectureDrawing): Promise<string> {
	const chosen = await tidierSettlement(
		Promise.resolve({ name: "plain", drawing: plain }),
		Promise.resolve({ name: "even", drawing: even }),
	);
	return chosen.name;
}

test("two unrelated lines on one stroke count against a settlement as a crossing would", async () => {
	const apart = at([300, 300], [400, 300], [400, 400], [500, 400], [500, 500]);
	const stacked = at([300, 60], [100, 60], [100, 140], [0, 140]);
	const shared = at([0, 50], [100, 50], [100, 150], [200, 150]);
	const plain = sketch({}, [
		{ id: "one", from: "a", to: "b", points: shared },
		{ id: "other", from: "c", to: "d", points: apart },
	]);
	const even = sketch({}, [
		{ id: "one", from: "a", to: "b", points: shared },
		{ id: "other", from: "c", to: "d", points: stacked },
	]);
	expect(await kept(plain, even)).toBe("plain");
});

/**
 * One line across and two down, which cross it when they start above it.
 * @param top Where the two lines down start.
 * @returns The lines.
 */
function crossing(top: number): Line[] {
	return [
		{ id: "across", from: "a", to: "b", points: at([0, 50], [200, 50]) },
		{ id: "one", from: "c", to: "d", points: at([100, top], [100, 100]) },
		{ id: "other", from: "e", to: "f", points: at([150, top], [150, 100]) },
	];
}

test("crossings saved buy only so much more page", async () => {
	const plain = sketch({}, crossing(0));
	const taller = sketch({}, crossing(60), { width: 1000, height: 1300 });
	const alike = sketch({}, crossing(60), { width: 1000, height: 1050 });
	expect(await kept(plain, taller)).toBe("plain");
	expect(await kept(plain, alike)).toBe("even");
});

test("a line leaves a card in the reading direction rather than save a bend by its side", async () => {
	const cards = {
		source: { x: 0, y: 0, width: 100, height: 50 },
		target: { x: 200, y: 200, width: 100, height: 50 },
	};
	const down = at([50, 50], [50, 120], [250, 120], [250, 200]);
	const aside = at([100, 25], [250, 25], [250, 200]);
	const plain = sketch(cards, [{ id: "line", from: "source", to: "target", points: down }]);
	const even = sketch(cards, [{ id: "line", from: "source", to: "target", points: aside }]);
	expect(await kept(plain, even)).toBe("plain");
});
