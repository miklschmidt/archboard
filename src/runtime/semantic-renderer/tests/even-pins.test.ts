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
// Migration's "US steering"), nor for a fan whose branches crowd into one
// blot (Skill evaluation's six lines out of Author run, branching 9 px apart);
// hooks cured do not pay for a crossing brought either. A stack of unrelated
// lines counts as the crossing it may hide, so a settlement may draw a
// crossing to part one (Board rasterizer); so do two lines of one card that
// leave it apart and meet on one stroke (Board persistence's Former names).
// Nor does a defect saved pay for
// more than two bends ("One browser, two uses" wound through its frame).
// A crossing within a lane of a bend counts twice, so no settlement cures a
// hook by knotting two lines at a corner (Agent workbench's Thread link),
// nor by running two unrelated lines nearer than a lane (Board persistence).
// Evening the charge
// counts the inset a side pin stands inside its card's routing box, so every
// pin of a card costs the same in all.

import { expect, test } from "bun:test";
import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	centreHandicap,
	tidierSettlement,
	type ArchitectureDrawing,
} from "@/runtime/semantic-renderer/layout";
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

test("two lines of one card that leave it apart and meet on one stroke count as a stack", async () => {
	// Board persistence's "take the new name's lease" left Place the file
	// apart from "does another board answer to it" and rode 2.2 px beside it
	// into the trunk to Former names: parting them is worth a crossing.
	const one = {
		id: "one",
		from: "a",
		to: "b",
		points: at([0, 50], [100, 50], [100, 150], [0, 150]),
	};
	const plain = sketch({}, [
		one,
		{
			id: "other",
			from: "a",
			to: "d",
			points: at([300, 60], [102.2, 60], [102.2, 140], [300, 140]),
		},
	]);
	const even = sketch({}, [
		one,
		{ id: "other", from: "a", to: "d", points: at([300, 100], [50, 100]) },
	]);
	expect(await kept(plain, even)).toBe("even");
});

test("a stack of unrelated lines counts as the crossing it may hide, so parting it may draw one", async () => {
	const cards = {
		source: { x: 0, y: 300, width: 100, height: 50 },
		target: { x: 200, y: 500, width: 200, height: 60 },
	};
	const shared = at([0, 50], [100, 50], [100, 150], [200, 150]);
	const stacked = at([300, 60], [100, 60], [100, 140], [0, 140]);
	const parted = at([300, 60], [150, 60], [150, 100], [0, 100]);
	const hooked = at([50, 350], [50, 400], [180, 400], [180, 530], [200, 530]);
	const entering = at([50, 350], [50, 400], [220, 400], [220, 500]);
	const plain = sketch(cards, [
		{ id: "one", from: "a", to: "b", points: shared },
		{ id: "other", from: "c", to: "d", points: stacked },
		{ id: "line", from: "source", to: "target", points: hooked },
	]);
	const even = sketch(cards, [
		{ id: "one", from: "a", to: "b", points: shared },
		{ id: "other", from: "c", to: "d", points: parted },
		{ id: "line", from: "source", to: "target", points: entering },
	]);
	expect(await kept(plain, even)).toBe("even");
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

/**
 * A long line along the page's foot, stepping down a few pixels at a time.
 * @param steps How many steps it takes, each two bends.
 * @returns The line.
 */
function stepping(steps: number): Line {
	const corners = Array.from({ length: steps }, (_, step) => [
		[1000 * (step + 1), 2000 + 4 * step],
		[1000 * (step + 1), 2004 + 4 * step],
	]).flat() as [number, number][];
	return {
		id: "foot",
		from: "g",
		to: "h",
		points: at([0, 2000], ...corners, [8000, 2000 + 4 * steps]),
	};
}

test("crossings saved buy only two more bends each", async () => {
	// Two crossings saved: four more bends are paid for, six are not.
	const plain = sketch({}, [...crossing(0), stepping(0)]);
	expect(await kept(plain, sketch({}, [...crossing(60), stepping(2)]))).toBe("even");
	expect(await kept(plain, sketch({}, [...crossing(60), stepping(3)]))).toBe("plain");
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

/**
 * Three lines from one card down a shared trunk, each branching off it to the left.
 * @param apart How far apart the branches leave the trunk.
 * @returns The lines.
 */
function branching(apart: number): Line[] {
	return ["one", "two", "three"].map((to, index) => ({
		id: `fan-${to}`,
		from: "hub",
		to,
		points: at([100, 0], [100, 40 + index * apart], [0, 40 + index * apart]),
	}));
}

test("a crossing saved does not pay for a fan whose branches crowd into one blot", async () => {
	const plain = sketch({}, [...branching(20), ...long(true).slice(0, 2)]);
	const even = sketch({}, [...branching(9), ...long(false).slice(0, 2)]);
	expect(await kept(plain, even)).toBe("plain");
});

test("a hook into a card's side is not kept for the crossings it saves", async () => {
	const cards = {
		source: { x: 0, y: 0, width: 100, height: 50 },
		target: { x: 200, y: 200, width: 200, height: 60 },
	};
	const entering = at([50, 50], [50, 100], [220, 100], [220, 200]);
	const hooked = at([50, 50], [50, 100], [180, 100], [180, 230], [200, 230]);
	const plain = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: entering },
		...long(true),
	]);
	const even = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: hooked },
		...long(false),
	]);
	expect(await kept(plain, even)).toBe("plain");
});

test("two lines whose end runs meet on one stroke are not a trunk that costs a settlement", async () => {
	const facing = [
		{ id: "left", from: "a", to: "b", points: at([100, 0], [0, 0], [0, 100]) },
		{ id: "right", from: "c", to: "d", points: at([50, 0], [200, 0], [200, 100]) },
	];
	const apart = [facing[0]!, { ...facing[1]!, points: at([50, 30], [200, 30], [200, 100]) }];
	const plain = sketch({}, [...apart, ...long(true).slice(0, 2)]);
	const even = sketch({}, [...facing, ...long(false).slice(0, 2)]);
	expect(await kept(plain, even)).toBe("even");
});

/**
 * A line from a source card to the target card below and right of it, shifted along the page.
 * @param shift How far right the pair stands: 0 or 500.
 * @param hooked Whether it hooks into the target's side rather than entering its top.
 * @returns The line.
 */
function intoTarget(shift: number, hooked: boolean): Line {
	return {
		id: `line${shift}`,
		from: shift === 0 ? "source" : "source2",
		to: shift === 0 ? "target" : "target2",
		points: (hooked
			? at([50, 50], [50, 100], [180, 100], [180, 230], [200, 230])
			: at([50, 50], [50, 100], [260, 100], [260, 200])
		).map(({ x, y }) => ({ x: x + shift, y })),
	};
}

test("hooks cured do not pay for a crossing brought", async () => {
	const cards = {
		source: { x: 0, y: 0, width: 100, height: 50 },
		target: { x: 200, y: 200, width: 200, height: 60 },
		source2: { x: 500, y: 0, width: 100, height: 50 },
		target2: { x: 700, y: 200, width: 200, height: 60 },
	};
	const plain = sketch(cards, [
		intoTarget(0, true),
		intoTarget(500, true),
		...long(false).slice(0, 2),
	]);
	const even = sketch(cards, [
		intoTarget(0, false),
		intoTarget(500, false),
		...long(true).slice(0, 2),
	]);
	expect(await kept(plain, even)).toBe("plain");
});

/**
 * A line across the page and a line down it that crosses it and turns a
 * given distance below the crossing.
 * @param turn How far below the crossing the line down turns.
 * @returns The two lines.
 */
function turningPast(turn: number): Line[] {
	return [
		{ id: "across", from: "a", to: "b", points: at([400, 100], [700, 100]) },
		{ id: "down", from: "c", to: "d", points: at([500, 0], [500, 100 + turn], [600, 100 + turn]) },
	];
}

test("a crossing within a lane of a bend is not kept for the hook it cures", async () => {
	// Agent workbench's hook into Thread link, cured by crossing two lines
	// just before their bends; a crossing a lane from a bend is an ordinary one.
	const cards = {
		source: { x: 0, y: 0, width: 100, height: 50 },
		target: { x: 200, y: 200, width: 200, height: 60 },
	};
	const hooked = at([50, 50], [50, 100], [180, 100], [180, 230], [200, 230]);
	const entering = at([50, 50], [50, 100], [220, 100], [220, 200]);
	const plain = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: hooked },
		...turningPast(16),
	]);
	const even = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: entering },
		...turningPast(10),
	]);
	expect(await kept(plain, even)).toBe("plain");
});

/**
 * Two unrelated lines that run side by side across the page for 260 px.
 * @param apart How far apart they run.
 * @returns The lines.
 */
function beside(apart: number): Line[] {
	return [
		{ id: "upper", from: "a", to: "b", points: at([500, 0], [500, 100], [800, 100], [800, 300]) },
		{
			id: "lower",
			from: "c",
			to: "d",
			points: at([460, 0], [460, 100 + apart], [760, 100 + apart], [760, 300]),
		},
	];
}

test("two unrelated lines side by side nearer than a lane are not kept for the hook it cures", async () => {
	// Board persistence's evened settlement ran its teal "a migrated document"
	// 11 px from two unrelated lines for 377 px; a lane apart is the pitch
	// lines keep where they have room.
	const cards = {
		source: { x: 0, y: 0, width: 100, height: 50 },
		target: { x: 200, y: 200, width: 200, height: 60 },
	};
	const hooked = at([50, 50], [50, 100], [180, 100], [180, 230], [200, 230]);
	const entering = at([50, 50], [50, 100], [220, 100], [220, 200]);
	const plain = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: hooked },
		...beside(16),
	]);
	const even = sketch(cards, [
		{ id: "line", from: "source", to: "target", points: entering },
		...beside(11),
	]);
	expect(await kept(plain, even)).toBe("plain");
});

test("every pin of a card costs the same once libavoid charges its distance from the centre", () => {
	const box = { x: 0, y: 0, width: 200, height: 100 };
	const inset = 8;
	// A pin on a side face stands the inset inside the routing box, nearer the centre.
	const inward = (share: number): number => (share === 0 ? inset : share === 1 ? -inset : 0);
	const totals = [
		{ x: 0, y: 0.3 },
		{ x: 1, y: 0.7 },
		{ x: 0.4, y: 0 },
		{ x: 0.6, y: 1 },
	].map((place) => {
		const pin = {
			x: place.x * box.width + inward(place.x),
			y: place.y * box.height + inward(place.y),
		};
		const charge = Math.abs(pin.x - box.width / 2) + Math.abs(pin.y - box.height / 2);
		return centreHandicap(box, place, inset) + charge;
	});
	for (const total of totals) expect(total).toBeCloseTo(totals[0]!, 6);
});
