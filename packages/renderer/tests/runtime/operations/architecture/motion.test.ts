import { describe, expect, test } from "bun:test";
import { renderSemanticView } from "#runtime/operations/render.ts";
import {
	beams,
	pointsOf as routeOf,
	speedOf,
	trafficBeams,
} from "#tests/runtime/support/drawn-traffic.ts";
import {
	SAMPLE,
	chain,
	drawn,
	lengthOf,
	pulsesIn,
	pulsesOn,
	solo,
	variant,
} from "#tests/runtime/support/pulse-fixtures.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/**
 * The picture of one relationship with some traffic between the sample's parts.
 * @param busy The relationship's traffic.
 * @returns The rendered view.
 */
function drawnWith(busy: Record<string, number>) {
	return renderSemanticView({
		policy: DEFAULT_SEMANTIC_POLICY,
		content: variant({
			nodes: SAMPLE.nodes,
			edges: [{ id: "busy", from: "api", to: "store", kind: "call", traffic: busy }],
		}),
		grammar: "architecture",
		theme: "light",
	});
}

/**
 * The box an element's attributes give: where it is and how big, as written.
 * @param attributes The attributes of its opening tag.
 * @returns Its x, y, width and height.
 */
function boxIn(attributes: string): (string | undefined)[] {
	return ["x", "y", "width", "height"].map(
		(name) => new RegExp(`\\s${name}="([^"]*)"`, "u").exec(attributes)?.[1],
	);
}

describe("explicit traffic is independent of relationship kind and emphasis", () => {
	test("only presence enables a stream, including on a muted edge", async () => {
		const svg = await drawn("architecture");
		expect(pulsesOn(svg, "plain")).toBeGreaterThan(0);
		expect(pulsesOn(svg, "quiet")).toBeGreaterThan(0);
		expect(pulsesOn(svg, "hero")).toBe(0);
		expect(pulsesOn(svg, "built")).toBe(0);
	});

	test("removed edges retain their line but never draw traffic", async () => {
		const rendered = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			content: SAMPLE,
			grammar: "architecture",
			theme: "light",
			standing: { plain: "removed" },
		});
		expect(pulsesOn(rendered.svg, "plain")).toBe(0);
	});

	test("pulses fly at twice the authored speed on short and long lines", async () => {
		// A chain with a line that skips it: one line a rank long, one three.
		const svg = await chain([
			{ id: "ab", from: "a", to: "b", kind: "call", traffic: { speed: 80, volume: 1 } },
			{ id: "bc", from: "b", to: "c", kind: "call", traffic: { speed: 160, volume: 1 } },
			{ id: "cd", from: "c", to: "d", kind: "call" },
			{ id: "ad", from: "a", to: "d", kind: "call", traffic: { speed: 80, volume: 1 } },
		]);
		const [short, long] = [trafficBeams(svg, "ab")[0]!, trafficBeams(svg, "ad")[0]!];
		expect(short.pieces.length).toBeGreaterThan(0);
		expect(long.pieces.length).toBeGreaterThan(0);
		expect(speedOf(short)).toBeCloseTo(160, 1);
		expect(speedOf(long)).toBeCloseTo(160, 1);
		// The authored speed still says which line runs hotter.
		expect(speedOf(trafficBeams(svg, "bc")[0]!)).toBeCloseTo(320, 1);
	});

	test("a line carries a steady train, spaced by its speed over its volume", async () => {
		for (const [speed, volume] of [
			[38, 1],
			[60, 1],
			[76, 2],
		] as const) {
			const [beam] = trafficBeams(await solo({ speed, volume }), "e");
			// One gradient that starts over every spacing: no pulse comes early or late.
			expect(beam!.period).toBeCloseTo(speed / volume, 1);
			for (const piece of beam!.pieces) {
				expect(piece.cycle).toBeCloseTo(1 / (2 * volume), 2);
				// The bar slides exactly one spacing a cycle, so the train has no seam.
				expect(Math.abs(piece.values[1]! - piece.values[0]!)).toBeCloseTo(speed / volume, 1);
			}
		}
	});

	test("pulses are never closer than a blur and never further apart than the line is long", async () => {
		const close = trafficBeams(await solo({ speed: 10, volume: 1 }), "e")[0]!;
		const sparseSvg = await solo({ speed: 400, volume: 1 });
		const sparse = trafficBeams(sparseSvg, "e")[0]!;
		expect(close.period).toBeCloseTo(36, 1);
		// The spacing holds to the ride, which stops short of the arrowhead: a pulse is always on the line.
		const line = /<path d="([^"]+)"[^>]*marker-end=/u.exec(sparseSvg)![1]!;
		expect(sparse.period!).toBeLessThanOrEqual(lengthOf(line));
		expect(sparse.period!).toBeGreaterThan(lengthOf(line) - 14);
	});

	test("a pulse is a gradient of light shaped to its line by a mask, one piece to a run and a bend", async () => {
		const [beam] = trafficBeams(await solo({ speed: 38, volume: 1 }), "e");
		expect(beam!.pieces.length).toBeGreaterThanOrEqual(1);
		// Light falls off across the line in layers, not at an edge.
		expect(beam!.layers).toBeGreaterThanOrEqual(3);
		for (const piece of beam!.pieces) expect(piece.begin).toBe(0);
		// Every piece slides on one clock.
		expect(new Set(beam!.pieces.map(({ cycleWritten }) => cycleWritten)).size).toBe(1);
	});

	test("the light of every piece is clipped to the box of its mask, inside the mask", async () => {
		// The page slides each bar on the compositor, and there Chromium let light
		// through outside the box of the mask: stray marks in empty canvas. A clip
		// beside the mask, on the same group, still let one row through at its edge.
		for (const grammar of ["architecture", "sequence"] as const) {
			const svg = await drawn(grammar);
			const masks = new Map(
				[...svg.matchAll(/<mask id="(ab-mask-[^"]+)"([^>]*)>/gu)].map(([, id, box]) => [
					id!,
					boxIn(box!),
				]),
			);
			const clips = new Map(
				[...svg.matchAll(/<clipPath id="([^"]+)"><rect([^>]*)\/><\/clipPath>/gu)].map(
					([, id, box]) => [id!, boxIn(box!)],
				),
			);
			const masked = [...svg.matchAll(/mask="url\(#ab-mask-/gu)].length;
			// Each masked group holds one group, and that group is the clip.
			const pieces = [
				...svg.matchAll(/<g mask="url\(#(ab-mask-[^)]+)\)"><g clip-path="url\(#([^)]+)\)">/gu),
			].map(([, mask, clip]) => ({ mask: mask!, clip: clip! }));
			expect(masked).toBeGreaterThan(0);
			expect(pieces).toHaveLength(masked);
			for (const { mask, clip } of pieces) expect(clips.get(clip)).toEqual(masks.get(mask)!);
		}
	});

	test("a pulse sinks into the base of the arrowhead and never covers it", async () => {
		const svg = await solo({});
		const group = svg.split('data-semantic-id="e"')[1]!.split("data-semantic-id=")[0]!;
		const line = /<path d="([^"]+)"[^>]*marker-end=[^>]*>/u.exec(group)!;
		const end = routeOf(line[1]!).at(-1)!;
		// A filled head's ink reaches four line widths back from the route's end.
		const headBase = 4 * Number(/stroke-width="([^"]+)"/u.exec(line[0])![1]);
		for (const piece of trafficBeams(svg, "e")[0]!.pieces) {
			// The mask runs a hair past the end of the ride; the ride itself stops short.
			const rideEnd = piece.points.at(-2)!;
			expect(Math.hypot(end.x - rideEnd.x, end.y - rideEnd.y)).toBeGreaterThanOrEqual(headBase);
		}
	});

	for (const traffic of [
		{ speed: 40, volume: 1e12 },
		{ speed: Number.MIN_VALUE, volume: Number.MAX_VALUE },
		{ speed: Number.MAX_VALUE, volume: Number.MIN_VALUE },
	]) {
		test(`positive finite traffic stays bounded with valid SVG timing (${traffic.speed}/${traffic.volume})`, async () => {
			const { svg } = await drawnWith(traffic);
			const calm = await drawnWith({ speed: 1, volume: 1 });
			expect(pulsesOn(svg, "busy")).toBe(1);
			// However extreme, traffic draws about as much as ordinary traffic does.
			expect(svg.length).toBeLessThan(calm.svg.length * 1.1);
			for (const piece of trafficBeams(svg, "busy")[0]!.pieces) {
				expect(piece.cycleWritten).not.toContain("e");
				expect(piece.cycle).toBeGreaterThan(0);
				for (const value of piece.values) expect(Number.isFinite(value)).toBe(true);
			}
		});
	}
});

describe("a pulse is handed on through a card", () => {
	const SAME = { speed: 40, volume: 0.5 };

	test("a card draws no pulse of its own, whether or not its lines keep the time", async () => {
		for (const out of [SAME, { speed: 80, volume: 0.5 }, { speed: 40, volume: 1 }, undefined]) {
			const svg = await chain([
				{ id: "ab", from: "a", to: "b", kind: "call", traffic: SAME },
				{
					id: "bc",
					from: "b",
					to: "c",
					kind: "call",
					...(out === undefined ? {} : { traffic: out }),
				},
			]);
			for (const card of ["a", "b", "c"]) {
				const group = svg.split(`data-semantic-id="${card}"`)[1]!.split("data-semantic-id=")[0]!;
				expect(group).not.toContain("ab-pulse");
			}
		}
	});

	test("every pulse is a line's own, and a card hands one on without drawing it", async () => {
		const svg = await chain([
			{ id: "ab", from: "a", to: "b", kind: "call", traffic: SAME },
			{ id: "bc", from: "b", to: "c", kind: "call", traffic: SAME },
			{ id: "bd", from: "b", to: "d", kind: "call", traffic: SAME },
		]);
		expect(beams(svg)).toHaveLength(3);
	});
});

describe("a reader who asked for less motion gets none", () => {
	test("a file opened with no viewer around honours the preference itself", async () => {
		// CSS cannot stop a SMIL animation, so the rule hides what it moves.
		for (const grammar of ["architecture", "sequence"] as const) {
			expect(await drawn(grammar)).toContain(
				"@media(prefers-reduced-motion:reduce){.ab-pulse{display:none}}",
			);
		}
	});
});

describe("motion costs the picture nothing else", () => {
	test("the pulses are not in the way of a click, and are not subjects", async () => {
		for (const grammar of ["architecture", "sequence"] as const) {
			const svg = await drawn(grammar);
			const pulses = pulsesIn(svg);
			expect(pulses).toBeGreaterThan(0);
			// One `pointer-events="none"` per pulse: a pane hit-tests subjects, and a
			// relationship that was only pickable between crossings would be a
			// relationship nobody could pick.
			expect(svg.split('pointer-events="none"').length - 1).toBeGreaterThanOrEqual(pulses);
			// And no pulse is a subject: a click on one finds the line underneath.
			expect(svg).not.toMatch(/<g class="ab-pulse"[^>]*data-semantic-id/u);
		}
	});

	test("the same content draws the same bytes twice", async () => {
		for (const grammar of ["architecture", "sequence"] as const) {
			expect(await drawn(grammar)).toBe(await drawn(grammar));
		}
	});
});
