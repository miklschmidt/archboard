// A finishing pass routes a settled drawing once more and keeps the result
// only when it cures more than it harms. The side-hook pass once took ordinary
// Ls for hooks and turned them into corner exits (Command interface's "the
// stated board, doing and version"), the wrong-face pass moved a side hook
// from one line to its neighbour and was kept for it (IIS Ingress
// Migration's "Today: DNS points here" and its fallback), and a pass could
// cure two defects by bringing one of another kind: a crowded label (Voice
// coordinator), two lines whose corners interlock a few pixels apart
// (Platform Public API's "Authentication and usage"), or a fan whose branches
// crowd into one blot (Skill evaluation's six lines out of Author run).
// What this catches: an ordinary L taken for a hook, a pass trading a defect
// for another of its kind, a pass curing defects by crowding a label or by
// joining two unrelated lines at or near a corner, and a fault in a pass's
// routing being taken for a refusal.

import { expect, test } from "bun:test";
import {
	finished,
	RouteCheckFailed,
	type ArchitectureDrawing,
} from "@/runtime/semantic-renderer/layout";
import {
	at,
	sketch,
	type Box,
	type Line,
} from "@/runtime/semantic-renderer/tests/sketched-drawings";

/**
 * A source card and a target card below and to its right, shifted along the page.
 * @param shift How far right the pair stands.
 * @returns The two cards' boxes, by id.
 */
function pair(shift: number): Record<string, Box> {
	return {
		[`source${shift}`]: { x: shift, y: 0, width: 100, height: 50 },
		[`target${shift}`]: { x: shift + 200, y: 200, width: 200, height: 60 },
	};
}

/**
 * A line between a pair's cards that drops past the target's corner and
 * hooks into its side.
 * @param shift The pair's shift.
 * @returns The line.
 */
function hooked(shift: number): Line {
	const points = at([50, 50], [50, 100], [180, 100], [180, 230], [200, 230]);
	return line(shift, points);
}

/**
 * A line between a pair's cards that enters the target's top.
 * @param shift The pair's shift.
 * @returns The line.
 */
function entering(shift: number): Line {
	return line(shift, at([50, 50], [50, 100], [220, 100], [220, 200]));
}

/**
 * A line between a pair's cards that winds down into the target's top with
 * more bends than a hook takes.
 * @param shift The pair's shift.
 * @returns The line.
 */
function winding(shift: number): Line {
	return line(shift, at([50, 50], [50, 100], [150, 100], [150, 150], [220, 150], [220, 200]));
}

/**
 * A line between a pair's cards, its corners shifted with the pair.
 * @param shift The pair's shift.
 * @param points Its corners, for the pair at the page's left.
 * @returns The line.
 */
function line(shift: number, points: readonly { x: number; y: number }[]): Line {
	return {
		id: `line${shift}`,
		from: `source${shift}`,
		to: `target${shift}`,
		points: points.map(({ x, y }) => ({ x: x + shift, y })),
	};
}

/**
 * The drawing a settled drawing is finished into, when the side-hook pass
 * reroutes it into another and every other pass is refused its routing.
 * @param settled The settled drawing.
 * @param rerouted What the side-hook pass's routing draws.
 * @returns The finished drawing.
 */
async function finishing(
	settled: ArchitectureDrawing,
	rerouted: ArchitectureDrawing | Error,
): Promise<ArchitectureDrawing> {
	const done = await finished({ reading: "settled", drawing: settled }, (reading, request) => {
		if (request.cornerPins !== true) return Promise.resolve(undefined);
		return rerouted instanceof Error
			? Promise.reject(rerouted)
			: Promise.resolve({ reading: `${reading} rerouted`, drawing: rerouted });
	});
	return done.drawing;
}

const cards = { ...pair(0), ...pair(500), ...pair(1000) };

test("a pass that cures a hook keeps its routing", async () => {
	const settled = sketch(cards, [hooked(0)]);
	const cured = sketch(cards, [entering(0)]);
	expect(await finishing(settled, cured)).toBe(cured);
});

test("a pass that cures nothing keeps the settled drawing, however it routes", async () => {
	const settled = sketch(cards, [hooked(0), entering(500)]);
	const moved = sketch(cards, [
		hooked(0),
		line(500, at([50, 50], [50, 100], [260, 100], [260, 200])),
	]);
	expect(await finishing(settled, moved)).toBe(settled);
});

test("an ordinary L past a card's corner is not taken for a hook", async () => {
	const settled = sketch(cards, [line(0, at([50, 50], [50, 230], [200, 230]))]);
	expect((await requestsOf(settled)).filter(({ cornerPins }) => cornerPins)).toEqual([]);
});

test("a pass may not move a hook onto another line, whatever else it cures", async () => {
	const settled = sketch(cards, [hooked(0), winding(500), hooked(1000)]);
	const traded = sketch(cards, [entering(0), hooked(500), entering(1000)]);
	expect(await finishing(settled, traded)).toBe(settled);
});

test("a pass may not cure hooks by bringing a line against another's label", async () => {
	const labelled = {
		id: "labelled",
		from: "source1000",
		to: "target1000",
		points: at([1050, 50], [1050, 100], [1300, 100], [1300, 200]),
		label: { x: 228, y: 130, width: 60, height: 20 },
	};
	const settled = sketch(cards, [hooked(0), hooked(500), labelled]);
	const crowding = sketch(cards, [entering(0), entering(500), labelled]);
	expect(await finishing(settled, crowding)).toBe(settled);
});

test("a pass may not cure hooks by letting an unrelated line turn where it turns", async () => {
	const meeting = {
		id: "meeting",
		from: "source1000",
		to: "target1000",
		points: at([1050, 50], [1050, 70], [220, 70], [220, 100], [1300, 100], [1300, 200]),
	};
	const settled = sketch(cards, [hooked(0), hooked(500), meeting]);
	const touching = sketch(cards, [entering(0), entering(500), meeting]);
	expect(await finishing(settled, touching)).toBe(settled);
});

test("a pass may not cure a hook by turning a line a few pixels from an unrelated line's corner", async () => {
	const near = {
		id: "near",
		from: "source500",
		to: "target500",
		points: at([550, 50], [550, 70], [226, 70], [226, 95], [750, 95], [750, 200]),
	};
	const settled = sketch(cards, [hooked(0), near]);
	const interlocked = sketch(cards, [entering(0), near]);
	expect(await finishing(settled, interlocked)).toBe(settled);
});

/**
 * Three lines from one card down a shared trunk, each branching off it to the right.
 * @param apart How far apart the branches leave the trunk.
 * @returns The lines.
 */
function fan(apart: number): Line[] {
	return ["one", "two", "three"].map((to, index) => ({
		id: `fan-${to}`,
		from: "hub",
		to,
		points: at([600, 300], [600, 340 + index * apart], [800, 340 + index * apart]),
	}));
}

test("a pass may not cure a hook by crowding a fan's branches into one blot", async () => {
	const settled = sketch(cards, [hooked(0), ...fan(20)]);
	const crowded = sketch(cards, [entering(0), ...fan(9)]);
	expect(await finishing(settled, crowded)).toBe(settled);
});

/**
 * A line on the stroke of "one" along one's first run, and along its last run or below it.
 * @param last Where its last run lies.
 * @returns The line.
 */
function stackedOn(last: number): Line {
	return {
		id: "other",
		from: "r",
		to: "s",
		points: at([50, 380], [50, 400], [250, 400], [250, last], [550, last], [550, 700]),
	};
}

test("a pass that parts one of two stacks of the same two lines is kept", async () => {
	const one = {
		id: "one",
		from: "p",
		to: "q",
		points: at([0, 400], [300, 400], [300, 500], [600, 500]),
	};
	const settled = sketch(cards, [hooked(0), one, stackedOn(500)]);
	const parted = sketch(cards, [hooked(0), one, stackedOn(530)]);
	expect(await finishing(settled, parted)).toBe(parted);
});

/**
 * A line down the page, which crosses the line across it when it stands within its span.
 * @param x Where it stands.
 * @param detour How many bends it takes on the way, in pairs.
 * @returns The line.
 */
function down(x: number, detour = 0): Line {
	const steps = Array.from({ length: detour }, (_, step) => [
		[x, 950 + step * 20],
		[x + 50, 950 + step * 20],
		[x + 50, 960 + step * 20],
		[x, 960 + step * 20],
	]).flat() as [number, number][];
	return { id: "down", from: "u", to: "v", points: at([x, 900], ...steps, [x, 1200]) };
}

/** A line across the page, from x 400 to 2400. */
const across: Line = { id: "across", from: "w", to: "z", points: at([400, 1000], [2400, 1000]) };

test("a pass may not cure a hook by bringing a crossing", async () => {
	const settled = sketch(cards, [hooked(0), down(2500), across]);
	const crossed = sketch(cards, [entering(0), down(700), across]);
	expect(await finishing(settled, crossed)).toBe(settled);
});

test("a pass may not cure a hook by giving another line more bends", async () => {
	const settled = sketch(cards, [hooked(0), entering(500)]);
	const wound = sketch(cards, [entering(0), winding(500)]);
	expect(await finishing(settled, wound)).toBe(settled);
});

test("a pass that saves a crossing may give a line more bends, but no more in all", async () => {
	const settled = sketch(cards, [hooked(0), down(700), across]);
	const bent = sketch(cards, [
		entering(0),
		{ ...down(2500), points: at([2500, 900], [2500, 1200], [2600, 1200]) },
		across,
	]);
	const detour = sketch(cards, [entering(0), down(2500, 1), across]);
	expect(await finishing(settled, bent)).toBe(bent);
	expect(await finishing(settled, detour)).toBe(settled);
});

/** What a finishing pass asks of its routes. */
type RouteRequest = Parameters<Parameters<typeof finished>[1]>[1];

/**
 * What a settled drawing's finishing passes ask of their routes.
 * @param settled The settled drawing.
 * @returns Each request, every routing refused.
 */
async function requestsOf(settled: ArchitectureDrawing): Promise<RouteRequest[]> {
	const requests: RouteRequest[] = [];
	await finished({ reading: "settled", drawing: settled }, (_reading, request) => {
		requests.push(request);
		return Promise.resolve(undefined);
	});
	return requests;
}

test("a line that stays inside its frame is not sent off the frame's wall", async () => {
	const inside = {
		upper: { x: 20, y: 20, width: 100, height: 50 },
		lower: { x: 20, y: 200, width: 100, height: 50 },
	};
	const along = {
		id: "along",
		from: "upper",
		to: "lower",
		points: at([20, 45], [2, 45], [2, 225], [20, 225]),
	};
	const settled = sketch(inside, [along], undefined, {
		frame: { x: 0, y: 0, width: 400, height: 300 },
	});
	expect(
		(await requestsOf(settled)).filter(({ clearWalls }) => (clearWalls ?? []).length > 0),
	).toEqual([]);
});

test("a port beside a corner with another port on its face is not moved to the middle", async () => {
	const card = { hub: { x: 0, y: 0, width: 200, height: 60 } };
	const lines = [8, 100].map((x) => ({
		id: `from${x}`,
		from: "hub",
		to: `to${x}`,
		points: at([x, 60], [x, 300]),
	}));
	expect(
		(await requestsOf(sketch(card, lines))).filter(({ centredPorts }) => centredPorts),
	).toEqual([]);
});

test("a routing the router refuses keeps the settled drawing, and a fault is thrown", async () => {
	const settled = sketch(cards, [hooked(0)]);
	const refused = new Error("NativeRouteUnavailable: no route clear of obstacles");
	expect(await finishing(settled, refused)).toBe(settled);
	expect(await finishing(settled, new RouteCheckFailed("a route fails its checks"))).toBe(settled);
	const fault = new Error("a fault in the routing");
	await expect(finishing(settled, fault)).rejects.toBe(fault);
});
