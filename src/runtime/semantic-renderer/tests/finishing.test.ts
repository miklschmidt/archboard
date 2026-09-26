// A finishing pass routes a settled drawing once more and keeps the result
// only when it cures more than it harms. The side-hook pass once took ordinary
// Ls for hooks and turned them into corner exits (Command interface's "the
// stated board, doing and version"), the wrong-face pass moved a side hook
// from one line to its neighbour and was kept for it (IIS Ingress
// Migration's "Today: DNS points here" and its fallback), and a pass could
// cure one defect by bringing another no pass looked for.
// What this catches: an ordinary L taken for a hook, a pass trading a defect
// for another of its kind, a pass curing one defect by crowding a label or by
// joining two unrelated lines at a corner, and a fault in a pass's routing
// being taken for a refusal.

import { expect, test } from "bun:test";
import { finished, type ArchitectureDrawing } from "@/runtime/semantic-renderer/layout";
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

test("an ordinary L past a card's corner is not taken for a hook", async () => {
	const settled = sketch(cards, [line(0, at([50, 50], [50, 230], [200, 230]))]);
	const asked: boolean[] = [];
	await finished({ reading: "settled", drawing: settled }, (_reading, request) => {
		asked.push(request.cornerPins === true);
		return Promise.resolve(undefined);
	});
	expect(asked).not.toContain(true);
});

test("a pass may not move a hook onto another line, whatever else it cures", async () => {
	const settled = sketch(cards, [hooked(0), winding(500), hooked(1000)]);
	const traded = sketch(cards, [entering(0), hooked(500), entering(1000)]);
	expect(await finishing(settled, traded)).toBe(settled);
});

test("a pass may not cure a hook by bringing a line against another's label", async () => {
	const labelled = {
		id: "labelled",
		from: "source1000",
		to: "target1000",
		points: at([1050, 50], [1050, 100], [1300, 100], [1300, 200]),
		label: { x: 228, y: 130, width: 60, height: 20 },
	};
	const settled = sketch(cards, [hooked(0), labelled]);
	const crowding = sketch(cards, [entering(0), labelled]);
	expect(await finishing(settled, crowding)).toBe(settled);
});

test("a pass may not cure a hook by letting an unrelated line turn where it turns", async () => {
	const meeting = {
		id: "meeting",
		from: "source1000",
		to: "target1000",
		points: at([1050, 50], [1050, 70], [220, 70], [220, 100], [1300, 100], [1300, 200]),
	};
	const settled = sketch(cards, [hooked(0), meeting]);
	const touching = sketch(cards, [entering(0), meeting]);
	expect(await finishing(settled, touching)).toBe(settled);
});

test("a routing the router refuses keeps the settled drawing, and a fault is thrown", async () => {
	const settled = sketch(cards, [hooked(0)]);
	const refused = new Error("NativeRouteUnavailable: no route clear of obstacles");
	expect(await finishing(settled, refused)).toBe(settled);
	const fault = new Error("a fault in the routing");
	await expect(finishing(settled, fault)).rejects.toBe(fault);
});
