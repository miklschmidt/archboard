import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import { describe, expect, test } from "bun:test";
import { type VariantContent } from "@/shared/semantic-board/index";
import { renderSemanticView } from "@/runtime/semantic-renderer/index";
import {
	headsOn,
	launchGaps,
	trafficLayers,
	trainPeriod,
} from "@/runtime/semantic-renderer/tests/drawn-traffic";

/** What a moving mark looks like in the markup, whichever grammar drew it. */
const MOTION = /<animate(?:Motion|Transform)?\b|@keyframes|animation:/u;

/**
 * One variant, as its own contract reads it.
 * @param content The nodes, relationships and flows.
 * @returns The content.
 */
function variant(content: Record<string, unknown>): VariantContent {
	return orderedFixture(content);
}

/** Two parts, wired every way that matters, and one exchange between them. */
const SAMPLE = variant({
	nodes: [
		{ id: "api", name: "API", kind: "service", responsibility: "Takes requests" },
		{ id: "store", name: "Store", kind: "datastore" },
	],
	edges: [
		{ id: "hero", from: "api", to: "store", kind: "call", label: "reads", emphasis: "hero" },
		{ id: "plain", from: "store", to: "api", kind: "data", label: "rows", traffic: {} },
		{ id: "built", from: "api", to: "store", kind: "dependency", emphasis: "normal" },
		{ id: "quiet", from: "store", to: "api", kind: "http", emphasis: "muted", traffic: {} },
	],
	flows: [
		{
			id: "read",
			name: "One read",
			participants: ["api", "store"],
			steps: [
				{ id: "asks", from: "api", to: "store", label: "asks", kind: "sync" },
				{ id: "again", from: "api", to: "store", label: "retries", kind: "sync", repeat: 2 },
				{ id: "answers", from: "store", to: "api", label: "answers", kind: "return" },
			],
		},
	],
});

/** Two exchanges on one page: five turns between them, none of them shared. */
const TWO_FLOWS = variant({
	nodes: [
		{ id: "api", name: "API", kind: "service" },
		{ id: "store", name: "Store", kind: "datastore" },
	],
	flows: [
		{
			id: "read",
			name: "One read",
			participants: ["api", "store"],
			steps: [
				{ id: "asks", from: "api", to: "store", label: "asks", kind: "sync" },
				{ id: "answers", from: "store", to: "api", label: "answers", kind: "return" },
			],
		},
		{
			id: "write",
			name: "One write",
			participants: ["api", "store"],
			steps: [
				{ id: "sends", from: "api", to: "store", label: "sends", kind: "sync" },
				{ id: "acks", from: "store", to: "api", label: "acks", kind: "return", repeat: 2 },
			],
		},
	],
});

/**
 * One picture of the sample.
 * @param grammar Which grammar to draw it in.
 * @returns The markup.
 */
async function drawn(grammar: "architecture" | "data-flow"): Promise<string> {
	return (await renderSemanticView({ content: SAMPLE, grammar, theme: "light" })).svg;
}

/**
 * Every turn window the picture draws, in the order it draws them.
 * @param svg The markup.
 * @returns The start and finish of each, as fractions of the clock.
 */
function windowsIn(svg: string): number[][] {
	return [...svg.matchAll(/keyTimes="0;([^;]+);([^;]+);1"/gu)].map((found) => [
		Number(found[1]),
		Number(found[2]),
	]);
}

/**
 * How long every dot's clock runs for, one entry per dot.
 * @param svg The markup.
 * @returns The durations, as written.
 */
function cyclesIn(svg: string): (string | undefined)[] {
	return [...svg.matchAll(/<animateMotion[^>]*dur="([^"]+)"/gu)].map((found) => found[1]);
}

/**
 * How many dots the whole picture draws.
 *
 * The circles, not the word: the stylesheet names the class too, in the rule
 * that hides them, and that rule is in every picture whether it moves or not.
 * @param svg The markup.
 * @returns How many dots were drawn.
 */
function dotsIn(svg: string): number {
	return [...svg.matchAll(/<(?:circle|path|g) class="ab-pulse"/gu)].length;
}

/**
 * The dots one subject carries, in its own group or in its traffic layer.
 *
 * Counted from where the subject is named to where the next one is, because a
 * group holds nested groups of its own — a label pill is one — and matching
 * closing tags by hand would stop at the first of them.
 * @param svg The markup.
 * @param id The subject's id.
 * @returns How many dots ride it.
 */
function pulsesOn(svg: string, id: string): number {
	// A sequence step carries its marks; a relationship's traffic is a layer of its own that names it.
	return [`data-semantic-id="${id}"`, `data-traffic="${id}"`]
		.map((named) => (svg.split(named)[1] ?? "").split(/data-(?:semantic-id|traffic)=/u)[0]!)
		.reduce(
			(sum, own) => sum + [...own.matchAll(/<(?:circle|path|g) class="ab-pulse"/gu)].length,
			0,
		);
}

/**
 * Where a path's data ends.
 * @param d The path data.
 * @returns Its last point.
 */
function endOf(d: string): { x: number; y: number } {
	const numbers = d.match(/-?[\d.]+(?:e-?\d+)?/gu)!.map(Number);
	return { x: numbers.at(-2)!, y: numbers.at(-1)! };
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

	test("shots cross short and long lines at the same speed, a multiple of the authored one", async () => {
		const content = variant({
			nodes: [
				{ id: "a", name: "A", kind: "service" },
				{ id: "b", name: "B", kind: "service" },
				{ id: "c", name: "C", kind: "service" },
			],
			edges: [
				{ id: "ab", from: "a", to: "b", kind: "call", traffic: { speed: 80, volume: 1 } },
				{ id: "bc", from: "b", to: "c", kind: "call", traffic: { speed: 160, volume: 1 } },
				{ id: "ac", from: "a", to: "c", kind: "call", traffic: { speed: 80, volume: 1 } },
			],
		});
		const { svg } = await renderSemanticView({ content, grammar: "architecture", theme: "light" });
		const speeds = (id: string) => {
			const layers = trafficLayers(svg, id);
			expect(layers.length).toBeGreaterThan(1);
			return layers.map((layer) => layer.travel / layer.cycle);
		};
		const [short, long] = [trafficLayers(svg, "ab")[0]!, trafficLayers(svg, "ac")[0]!];
		expect(Math.abs(short.still[1]! - long.still[1]!)).toBeGreaterThan(50);
		const shot = speeds("ab")[0]!;
		for (const speed of [...speeds("ab"), ...speeds("ac")]) expect(speed).toBeCloseTo(shot, 3);
		// The authored speed still says which line runs hotter, and a shot is far
		// faster than the stroll it asked for.
		for (const speed of speeds("bc")) expect(speed).toBeCloseTo(shot * 2, 3);
		expect(shot).toBeGreaterThan(80 * 5);
	});

	test("every layer repeats over the distance its train moves, however dense the traffic", async () => {
		// Where shots are fired closer together than a layer is long, a layer
		// that repeated over more than the train moves would lose its head's
		// glow and tail and jump back every cycle.
		for (const traffic of [{}, { speed: 10, volume: 20 }, { volume: 40 }]) {
			const { svg } = await renderSemanticView({
				content: variant({
					nodes: SAMPLE.nodes,
					edges: [{ id: "e", from: "api", to: "store", kind: "call", traffic }],
				}),
				grammar: "architecture",
				theme: "light",
			});
			const layers = trafficLayers(svg, "e");
			expect(layers.length).toBeGreaterThan(1);
			for (const layer of layers) expect(trainPeriod(layer)).toBeCloseTo(layer.travel, 6);
		}
	});

	test("the mean launch rate over a cycle equals the volume, at irregular moments", async () => {
		const drawnWith = async (volume: number) =>
			(
				await renderSemanticView({
					content: variant({
						nodes: SAMPLE.nodes,
						edges: [
							{ id: "one", from: "api", to: "store", kind: "call", traffic: { volume } },
							{ id: "two", from: "store", to: "api", kind: "call", traffic: { volume } },
						],
					}),
					grammar: "architecture",
					theme: "light",
				})
			).svg;
		for (const volume of [0.25, 1, 2.5]) {
			const svg = await drawnWith(volume);
			for (const id of ["one", "two"]) {
				for (const layer of trafficLayers(svg, id)) {
					const gaps = launchGaps(layer);
					expect(gaps.length).toBeGreaterThanOrEqual(8);
					expect(gaps.length / layer.cycle).toBeCloseTo(volume, 6);
					// Irregular, within the jitter around the mean gap.
					expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(1.5);
					for (const gap of gaps) {
						expect(gap * volume).toBeGreaterThan(0.2);
						expect(gap * volume).toBeLessThan(2);
					}
				}
			}
			// Each relationship draws its own rhythm, the same one every time.
			expect(launchGaps(trafficLayers(svg, "one")[0]!)).not.toEqual(
				launchGaps(trafficLayers(svg, "two")[0]!),
			);
			expect(await drawnWith(volume)).toBe(svg);
		}
	});

	test("a still picture shows one whole streak on its line, clear of both ends", async () => {
		// Two stacked cards: one straight run, drawn by every engine, with traffic
		// sparse and so dense that many shots are in flight at once.
		let shown = 0;
		for (const traffic of [{}, { volume: 40 }, { speed: 4, volume: 0.1 }]) {
			const content = variant({
				nodes: [
					{ id: "a", name: "A", kind: "service" },
					{ id: "b", name: "B", kind: "service" },
				],
				edges: [{ id: "ab", from: "a", to: "b", kind: "call", emphasis: "hero", traffic }],
			});
			for (const layout of ["graphviz", "track", "blocks"] as const) {
				const { svg } = await renderSemanticView({
					content,
					grammar: "architecture",
					theme: "light",
					layout,
				});
				const group = svg.split('data-semantic-id="ab"')[1]!.split("data-semantic-id=")[0]!;
				const line = /<path d="([^"]+)"[^>]*marker-end=[^>]*>/u.exec(group)!;
				const lineEnd = endOf(line[1]!);
				// A filled head's ink reaches four line widths back from the route's end.
				const headBase = 4 * Number(/stroke-width="([^"]+)"/u.exec(line[0])![1]);
				const layers = trafficLayers(svg, "ab");
				expect(layers.length).toBeGreaterThan(1);
				const glow = Math.max(...layers.map(({ width }) => width / 2));
				const [x0, y0, x1, y1] = layers[0]!.d.match(/[\d.]+/gu)!.map(Number);
				const length = Math.hypot(x1! - x0!, y1! - y0!);
				const rests = layers.map((layer) => {
					// Nothing moves at time zero, the moment every still picture is taken.
					for (const begin of layer.begins) expect(begin).toBeGreaterThan(0);
					const heads = headsOn(layer.still, layer.offset, length);
					// A line too short for a whole streak shows none rather than a glow on a card.
					expect(heads).toHaveLength(length < glow * 2 ? 0 : 1);
					// Every solid layer's round end stops at the arrowhead's base; only
					// the faint glow may reach over it.
					if (layer.width / 2 < glow) {
						const end = endOf(layer.d);
						expect(Math.hypot(lineEnd.x - end.x, lineEnd.y - end.y)).toBeGreaterThanOrEqual(
							headBase + layer.width / 2 - 0.05,
						);
					}
					return heads[0];
				});
				if (length < glow * 2) continue;
				shown += 1;
				// Every layer ends on the one head, which is at least a glow from both
				// ends of the line, so no glow sits alone on a card.
				for (const rest of rests) expect(rest!).toBeCloseTo(rests[0]!, 1);
				expect(rests[0]!).toBeGreaterThanOrEqual(glow);
				expect(length - rests[0]!).toBeGreaterThanOrEqual(glow);
			}
		}
		expect(shown).toBeGreaterThan(0);
	});

	test("a still picture rests its streak clear of the labels drawn over it", async () => {
		// Two stacked cards: the label sits on the line half way along, cut by
		// the label's border or hidden under it, whichever the layout gives; at
		// least one layout moves the resting place beyond half way.
		let beyondHalf = false;
		const content = variant({
			nodes: [
				{ id: "a", name: "A", kind: "service" },
				{ id: "b", name: "B", kind: "service" },
			],
			edges: [{ id: "ab", from: "a", to: "b", kind: "call", label: "reads rows", traffic: {} }],
		});
		for (const layout of ["graphviz", "track", "blocks"] as const) {
			const { svg } = await renderSemanticView({
				content,
				grammar: "architecture",
				theme: "light",
				layout,
			});
			const layers = trafficLayers(svg, "ab");
			const glow = Math.max(...layers.map(({ width }) => width / 2));
			const [x0, y0, x1, y1] = layers[0]!.d.match(/[\d.]+/gu)!.map(Number);
			const length = Math.hypot(x1! - x0!, y1! - y0!);
			// Every layer shows exactly one dash at time zero, round caps included,
			// wherever the label moved the resting place.
			for (const layer of layers) {
				expect(headsOn(layer.still, layer.offset, length, layer.width / 2)).toHaveLength(1);
			}
			const [along] = headsOn(layers[0]!.still, layers[0]!.offset, length);
			beyondHalf ||= along! > length / 2;
			const head = {
				x: x0! + ((x1! - x0!) * along!) / length,
				y: y0! + ((y1! - y0!) * along!) / length,
			};
			const [, x, y, w, h] =
				/data-semantic-id="ab"><rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/u
					.exec(svg)!
					.map(Number);
			const gap = Math.hypot(
				Math.max(x! - head.x, 0, head.x - x! - w!),
				Math.max(y! - head.y, 0, head.y - y! - h!),
			);
			expect(gap).toBeGreaterThanOrEqual(glow);
		}
		expect(beyondHalf).toBe(true);
	});
	for (const traffic of [
		{ speed: 40, volume: 1e12 },
		{ speed: Number.MIN_VALUE, volume: Number.MAX_VALUE },
		{ speed: Number.MAX_VALUE, volume: Number.MIN_VALUE },
	]) {
		test(`positive finite traffic stays bounded with valid SVG timing (${traffic.speed}/${traffic.volume})`, async () => {
			const drawnWith = (busy: typeof traffic) =>
				renderSemanticView({
					content: variant({
						nodes: SAMPLE.nodes,
						edges: [{ id: "busy", from: "api", to: "store", kind: "call", traffic: busy }],
					}),
					grammar: "architecture",
					theme: "light",
				});
			const { svg } = await drawnWith(traffic);
			const calm = await drawnWith({ speed: 1, volume: 1 });
			expect(pulsesOn(svg, "busy")).toBe(1);
			// However extreme, traffic draws about as much as ordinary traffic does.
			expect(svg.length).toBeLessThan(calm.svg.length * 1.1);
			for (const layer of trafficLayers(svg, "busy")) {
				expect(layer.cycleWritten).not.toContain("e");
				expect(layer.cycle).toBeGreaterThan(0);
				for (const pattern of [layer.still, layer.train]) {
					for (const value of pattern) {
						expect(Number.isFinite(value)).toBe(true);
						expect(value).toBeGreaterThanOrEqual(0);
					}
					expect(pattern.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
				}
			}
		});
	}
});

describe("an exchange is told on one clock", () => {
	test("every message takes a turn, and a repeated one takes its repeat", async () => {
		const svg = await drawn("data-flow");
		expect(MOTION.test(svg)).toBe(true);
		expect(pulsesOn(svg, "asks")).toBe(1);
		expect(pulsesOn(svg, "answers")).toBe(1);
		// A step somebody wrote a repeat on sends that many dots, so the drawing
		// says "twice" the way the label does.
		expect(pulsesOn(svg, "again")).toBe(2);
	});

	test("the turns share one cycle and do not overlap", async () => {
		const svg = await drawn("data-flow");
		// Four turns across three messages, so every dot's clock is the same
		// length and each takes a quarter of it.
		const cycles = cyclesIn(svg);
		expect(cycles.length).toBe(4);
		expect(new Set(cycles).size).toBe(1);
		expect(windowsIn(svg)).toEqual([
			[0, 0.25],
			[0.25, 0.5],
			[0.5, 0.75],
			[0.75, 1],
		]);
	});

	test("a page of exchanges shares one clock, and they take their turns in order", async () => {
		// Two flows on one page. A clock each would have both crossing at once and
		// both starting over at 0, which is the drawing saying two unrelated things
		// are the same thing happening twice.
		const svg = (
			await renderSemanticView({
				content: TWO_FLOWS,
				grammar: "data-flow",
				theme: "light",
			})
		).svg;
		const cycles = cyclesIn(svg);
		expect(cycles.length).toBe(5);
		expect(new Set(cycles).size).toBe(1);
		// Five turns across both exchanges, counted straight through: the second
		// flow's first message goes third, not first.
		expect(windowsIn(svg)).toEqual([
			[0, 0.2],
			[0.2, 0.4],
			[0.4, 0.6],
			[0.6, 0.8],
			[0.8, 1],
		]);
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
	test("the dots are not in the way of a click, and are not subjects", async () => {
		for (const grammar of ["architecture", "data-flow"] as const) {
			const svg = await drawn(grammar);
			const dots = dotsIn(svg);
			expect(dots).toBeGreaterThan(0);
			// One `pointer-events="none"` per dot: a pane hit-tests subjects, and a
			// relationship that was only pickable between crossings would be a
			// relationship nobody could pick.
			expect(svg.split('pointer-events="none"').length - 1).toBeGreaterThanOrEqual(dots);
			// And no dot is a subject: a click on one finds the line underneath.
			expect(svg).not.toMatch(/<circle class="ab-pulse"[^>]*data-semantic-id/u);
		}
	});

	test("the same content draws the same bytes twice", async () => {
		for (const grammar of ["architecture", "data-flow"] as const) {
			expect(await drawn(grammar)).toBe(await drawn(grammar));
		}
	});
});
