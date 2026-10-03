import { describe, expect, test } from "bun:test";
import { renderSemanticView } from "@/runtime/semantic-renderer/index";
import {
	headsAt,
	pulseLayers,
	rimLayers,
	speedOf,
	trafficLayers,
} from "@/runtime/semantic-renderer/tests/drawn-traffic";
import {
	SAMPLE,
	chain,
	drawn,
	headLayer,
	lengthOf,
	pointsOf,
	pulsesIn,
	pulsesOn,
	solo,
	variant,
} from "@/runtime/semantic-renderer/tests/pulse-fixtures";

/**
 * The picture of one relationship with some traffic between the sample's parts.
 * @param busy The relationship's traffic.
 * @returns The rendered view.
 */
function drawnWith(busy: Record<string, number>) {
	return renderSemanticView({
		content: variant({
			nodes: SAMPLE.nodes,
			edges: [{ id: "busy", from: "api", to: "store", kind: "call", traffic: busy }],
		}),
		grammar: "architecture",
		theme: "light",
	});
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
		const [short, long] = [trafficLayers(svg, "ab"), trafficLayers(svg, "ad")];
		expect(lengthOf(long[0]!.d)).toBeGreaterThan(lengthOf(short[0]!.d) + 50);
		for (const layer of [...short, ...long]) expect(speedOf(layer)).toBeCloseTo(160, 1);
		// The authored speed still says which line runs hotter.
		for (const layer of trafficLayers(svg, "bc")) expect(speedOf(layer)).toBeCloseTo(320, 1);
	});

	test("a line carries a steady train, spaced by its speed over its volume", async () => {
		for (const [speed, volume] of [
			[38, 1],
			[60, 1],
			[76, 2],
		] as const) {
			const layers = trafficLayers(await solo({ speed, volume }), "e");
			expect(layers.length).toBeGreaterThan(1);
			for (const layer of layers) {
				// One dash and one gap, forever: no pulse comes early or late.
				expect(layer.dash + layer.gap).toBeCloseTo(speed / volume, 1);
				expect(layer.cycle).toBeCloseTo(1 / (2 * volume), 2);
				// The dash moves exactly one spacing a cycle, so the train has no seam.
				expect(Math.abs(layer.values[0]! - layer.values[1]!)).toBeCloseTo(speed / volume, 1);
			}
		}
	});

	test("pulses are never closer than a blur and never further apart than the line is long", async () => {
		const close = trafficLayers(await solo({ speed: 10, volume: 1 }), "e");
		const sparse = trafficLayers(await solo({ speed: 400, volume: 1 }), "e");
		expect(close[0]!.dash + close[0]!.gap).toBeCloseTo(36, 1);
		expect(sparse[0]!.dash + sparse[0]!.gap).toBeCloseTo(lengthOf(sparse[0]!.d), 0);
	});

	test("every line carries a pulse at every moment, however sparse its traffic", async () => {
		const layers = trafficLayers(await solo({ speed: 40, volume: 0.001 }), "e");
		const length = lengthOf(layers[0]!.d);
		const head = headLayer(layers);
		for (let step = 0; step < 24; step += 1) {
			expect(headsAt(head, (head.cycle * step) / 24, length).length).toBeGreaterThanOrEqual(1);
		}
	});

	test("a still picture shows the train, every part of a pulse ending on one head", async () => {
		const layers = trafficLayers(await solo({ speed: 38, volume: 1 }), "e");
		const length = lengthOf(layers[0]!.d);
		for (const layer of layers) expect(layer.begin).toBe(0);
		for (const time of [0, 0.3, 0.77]) {
			const heads = layers.map((layer) => headsAt(layer, time, length));
			expect(heads[0]!.length).toBeGreaterThan(0);
			for (const mine of heads) {
				expect(mine.length).toBe(heads[0]!.length);
				mine.forEach((head, index) => expect(head).toBeCloseTo(heads[0]![index]!, 0));
			}
		}
	});

	test("a pulse sinks into the base of the arrowhead and never covers it", async () => {
		const svg = await solo({});
		const group = svg.split('data-semantic-id="e"')[1]!.split("data-semantic-id=")[0]!;
		const line = /<path d="([^"]+)"[^>]*marker-end=[^>]*>/u.exec(group)!;
		const end = pointsOf(line[1]!).at(-1)!;
		// A filled head's ink reaches four line widths back from the route's end.
		const headBase = 4 * Number(/stroke-width="([^"]+)"/u.exec(line[0])![1]);
		for (const layer of trafficLayers(svg, "e")) {
			const rideEnd = pointsOf(layer.d).at(-1)!;
			expect(Math.hypot(end.x - rideEnd.x, end.y - rideEnd.y)).toBeGreaterThanOrEqual(headBase);
		}
	});

	test("the same traffic draws the same pulses twice", async () => {
		expect(await solo({ speed: 38, volume: 1 })).toBe(await solo({ speed: 38, volume: 1 }));
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
			for (const layer of trafficLayers(svg, "busy")) {
				expect(layer.cycleWritten).not.toContain("e");
				expect(layer.cycle).toBeGreaterThan(0);
				for (const value of [layer.dash, layer.gap, ...layer.values]) {
					expect(Number.isFinite(value)).toBe(true);
				}
				expect(layer.dash + layer.gap).toBeGreaterThan(0);
			}
		});
	}
});

describe("a pulse is handed on through a card", () => {
	const SAME = { speed: 40, volume: 0.5 };

	test("a card whose lines out keep the time of the line in carries the pulse round its edge", async () => {
		const svg = await chain([
			{ id: "ab", from: "a", to: "b", kind: "call", traffic: SAME },
			{ id: "bc", from: "b", to: "c", kind: "call", traffic: SAME },
			{ id: "bd", from: "b", to: "d", kind: "call", traffic: { speed: 40, volume: 2 } },
		]);
		// B takes the pulses of ab and gives them to bc: it carries them round its edge.
		expect(rimLayers(svg, "b").length).toBeGreaterThan(0);
		// The line out at another volume keeps a rhythm of its own, and so does the card it ends at.
		expect(rimLayers(svg, "c")).toHaveLength(0);
		expect(rimLayers(svg, "d")).toHaveLength(0);
		expect(rimLayers(svg, "a")).toHaveLength(0);
	});

	test("lines that keep different time hand nothing on", async () => {
		for (const out of [{ speed: 80, volume: 0.5 }, { speed: 40, volume: 1 }, undefined]) {
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
			expect(rimLayers(svg, "b")).toHaveLength(0);
		}
	});

	test("the pulse runs the edge of the card and never crosses what it says", async () => {
		const svg = await chain([
			{ id: "ab", from: "a", to: "b", kind: "call", traffic: SAME },
			{ id: "bc", from: "b", to: "c", kind: "call", traffic: SAME },
			{ id: "bd", from: "b", to: "d", kind: "call", traffic: SAME },
		]);
		const card =
			/data-semantic-id="b"[^>]*><rect class="ab-halo"[^>]*\/>\s*<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/u
				.exec(svg)!
				.slice(1)
				.map(Number);
		const [x, y, width, height] = card as [number, number, number, number];
		const layers = rimLayers(svg, "b");
		expect(layers.length).toBeGreaterThan(0);
		for (const layer of layers) {
			for (const point of pointsOf(layer.d)) {
				// On the outline of the card: as near one of its four sides as a rounded corner is.
				const near = Math.min(
					Math.abs(point.x - x),
					Math.abs(point.x - (x + width)),
					Math.abs(point.y - y),
					Math.abs(point.y - (y + height)),
				);
				expect(near).toBeLessThan(2);
			}
		}
	});

	test("the pulse leaves a line's end for the next line's start", async () => {
		const svg = await chain([
			{ id: "ab", from: "a", to: "b", kind: "call", traffic: SAME },
			{ id: "bc", from: "b", to: "c", kind: "call", traffic: SAME },
		]);
		const route = (id: string) => {
			const group = svg.split(`data-semantic-id="${id}"`)[1]!.split("data-semantic-id=")[0]!;
			return pointsOf(/<path d="([^"]+)"[^>]*marker-end=[^>]*>/u.exec(group)![1]!);
		};
		const [arrives, leaves] = [route("ab").at(-1)!, route("bc")[0]!];
		const [way] = rimLayers(svg, "b");
		const [first, last] = [pointsOf(way!.d)[0]!, pointsOf(way!.d).at(-1)!];
		expect(Math.hypot(first.x - arrives.x, first.y - arrives.y)).toBeLessThan(2);
		expect(Math.hypot(last.x - leaves.x, last.y - leaves.y)).toBeLessThan(2);
	});

	test("a pulse on the way round flies at the speed it flies everywhere", async () => {
		const svg = await chain([
			{ id: "ab", from: "a", to: "b", kind: "call", traffic: SAME },
			{ id: "bc", from: "b", to: "c", kind: "call", traffic: SAME },
		]);
		for (const layer of rimLayers(svg, "b")) expect(speedOf(layer)).toBeCloseTo(SAME.speed * 2, 1);
	});

	test("a reader who asked for less motion loses the pulses on a card's edge too", async () => {
		const svg = await chain([
			{ id: "ab", from: "a", to: "b", kind: "call", traffic: SAME },
			{ id: "bc", from: "b", to: "c", kind: "call", traffic: SAME },
		]);
		expect(pulseLayers(svg).length).toBeGreaterThan(0);
		expect(svg).toContain("@media(prefers-reduced-motion:reduce){.ab-pulse{display:none}}");
		// Every moving layer sits in a group that rule hides.
		expect(svg.split("<animate ").length - 1).toBeGreaterThan(0);
		expect(svg.split('<g class="ab-pulse"').length - 1).toBeGreaterThanOrEqual(3);
	});
});

describe("a reader who asked for less motion gets none", () => {
	test("a file opened with no viewer around honours the preference itself", async () => {
		// CSS cannot stop a SMIL animation, so the rule hides what it moves.
		for (const grammar of ["architecture", "data-flow"] as const) {
			expect(await drawn(grammar)).toContain(
				"@media(prefers-reduced-motion:reduce){.ab-pulse{display:none}}",
			);
		}
	});
});

describe("motion costs the picture nothing else", () => {
	test("the pulses are not in the way of a click, and are not subjects", async () => {
		for (const grammar of ["architecture", "data-flow"] as const) {
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
		for (const grammar of ["architecture", "data-flow"] as const) {
			expect(await drawn(grammar)).toBe(await drawn(grammar));
		}
	});
});
