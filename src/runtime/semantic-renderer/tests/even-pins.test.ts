// libavoid charges a pin its distance from its card's centre, so a line to a
// card beside and below its own dropped out of the bottom and ran under the
// trunk its siblings leave along, and every sibling hopped it. Evened pins let
// it leave along that trunk (Skill evaluation's "One author run", cut down to
// the view's cards and relationships). Evened pins may not make a card's side
// as cheap as its face in the reading direction: a fan from one card to the
// cards below it left by the card's sides, dropped through the gaps between
// its targets and entered them from the side (Skill evaluation's "Grading").
// A settlement is kept only with no more of any defect a reader sees: ranked
// on crossings alone, evened pins kept Command interface's 450 px trunk of
// two unrelated lines, and two lines from one card turning head to head
// (Auditlog's "ApplyOffsets"), for the crossings they saved; and a crossing
// saved does not pay for two ports beside a card's corner (IIS Ingress
// Migration's "US steering").

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

/**
 * Two long lines that cross twice where they start at the page's left, and never where they start right of it.
 * @param left Whether they start at the left.
 * @returns The lines.
 */
function long(left: boolean): Line[] {
	const x = left ? 500 : 3000;
	return [
		{ id: "down", from: "p", to: "q", points: at([x, 0], [x, 2000]) },
		{ id: "across", from: "r", to: "s", points: at([400, 1000], [2400, 1000]) },
		{ id: "under", from: "t", to: "u", points: at([400, 1500], [2400, 1500]) },
	];
}

test("a longer trunk of unrelated lines is not kept for the crossings it saves", async () => {
	const plain = sketch({}, [
		{ id: "one", from: "a", to: "b", points: at([0, 0], [100, 0], [100, 40], [200, 40]) },
		{ id: "other", from: "c", to: "d", points: at([300, 5], [100, 5], [100, 25], [0, 25]) },
		...long(true),
	]);
	const even = sketch({}, [
		{ id: "one", from: "a", to: "b", points: at([0, 0], [100, 0], [100, 300], [200, 300]) },
		{ id: "other", from: "c", to: "d", points: at([300, 50], [100, 50], [100, 250], [0, 250]) },
		...long(false),
	]);
	expect(await kept(plain, even)).toBe("plain");
});

test("two lines from one card that turn head to head are not kept for the crossing they save", async () => {
	const turning = at([0, 0], [0, 100], [-100, 100], [-100, 200]);
	const plain = sketch({}, [
		{ id: "turning", from: "s", to: "t", points: turning },
		{ id: "apart", from: "s", to: "u", points: at([-150, 0], [-150, 300], [0, 300]) },
		...long(true).slice(0, 2),
	]);
	const even = sketch({}, [
		{ id: "turning", from: "s", to: "t", points: turning },
		{ id: "facing", from: "s", to: "u", points: at([-150, 0], [-150, 100], [0, 100], [0, 200]) },
		...long(false).slice(0, 2),
	]);
	expect(await kept(plain, even)).toBe("plain");
});

test("a crossing saved does not pay for two ports beside a card's corner", async () => {
	const cards = {
		source: { x: 0, y: 0, width: 100, height: 50 },
		target: { x: 0, y: 200, width: 100, height: 50 },
	};
	const plain = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: at([50, 50], [50, 200]) },
		...long(true).slice(0, 2),
	]);
	const even = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: at([5, 50], [5, 200]) },
		...long(false).slice(0, 2),
	]);
	expect(await kept(plain, even)).toBe("plain");
});
