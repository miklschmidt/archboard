import { describe, expect, test } from "bun:test";
import { VariantContentSchema, type VariantContent } from "@/shared/semantic-board/index";
import { renderSemanticView } from "@/runtime/semantic-renderer/index";

/** What a moving mark looks like in the markup, whichever grammar drew it. */
const MOTION = /<animate(?:Motion|Transform)?\b|@keyframes|animation:/u;

/**
 * One variant, as its own contract reads it.
 * @param content The nodes, relationships and flows.
 * @returns The content.
 */
function variant(content: Record<string, unknown>): VariantContent {
	return VariantContentSchema.parse(content);
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
	return [...svg.matchAll(/<(?:circle|path) class="ab-pulse"/gu)].length;
}

/**
 * The dots one subject's group carries.
 *
 * Counted from where the subject is named to where the next one is, because a
 * group holds nested groups of its own — a label pill is one — and matching
 * closing tags by hand would stop at the first of them.
 * @param svg The markup.
 * @param id The subject's id.
 * @returns How many dots ride it.
 */
function pulsesOn(svg: string, id: string): number {
	const after = svg.split(`data-semantic-id="${id}"`)[1] ?? "";
	const own = after.split("data-semantic-id=")[0] ?? "";
	return [...own.matchAll(/<(?:circle|path) class="ab-pulse"/gu)].length;
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

	test("equal defaults use fixed entry intervals and prepopulate different route lengths", async () => {
		const content = variant({
			nodes: [
				{ id: "a", name: "A", kind: "service" },
				{ id: "b", name: "B", kind: "service" },
				{ id: "c", name: "C", kind: "service" },
			],
			edges: [
				{ id: "ab", from: "a", to: "b", kind: "call", traffic: {} },
				{ id: "bc", from: "b", to: "c", kind: "call" },
				{ id: "ac", from: "a", to: "c", kind: "call", traffic: { speed: 40, volume: 0.5 } },
			],
		});
		const { svg } = await renderSemanticView({ content, grammar: "architecture", theme: "light" });
		for (const id of ["ab", "ac"]) {
			const group = svg.split(`data-semantic-id="${id}"`)[1]!.split("data-semantic-id=")[0]!;
			const traffic = group.match(/<path class="ab-pulse"[^>]+>/u)![0];
			const animation = group.match(/<animate[^>]*attributeName="stroke-dashoffset"[^>]+>/u)![0];
			const spacing = Number(traffic.match(/stroke-dasharray="0 ([^"]+)"/u)![1]);
			const interval = Number(animation.match(/dur="([^s]+)s"/u)![1]);
			expect(spacing).toBe(80);
			expect(interval).toBe(2);
			expect(spacing / interval).toBe(40);
			expect(animation).toContain('to="-80"');
			expect(traffic).toContain('stroke-linecap="round"');
			expect(animation).toContain('calcMode="linear"');
		}
	});
	for (const traffic of [
		{ speed: 40, volume: 1e12 },
		{ speed: Number.MIN_VALUE, volume: Number.MAX_VALUE },
		{ speed: Number.MAX_VALUE, volume: Number.MIN_VALUE },
	]) {
		test(`positive finite traffic stays bounded with valid SVG timing (${traffic.speed}/${traffic.volume})`, async () => {
			const content = variant({
				nodes: SAMPLE.nodes,
				edges: [{ id: "busy", from: "api", to: "store", kind: "call", traffic }],
			});
			const { svg } = await renderSemanticView({
				content,
				grammar: "architecture",
				theme: "light",
			});
			expect(pulsesOn(svg, "busy")).toBe(1);
			expect(svg.length).toBeLessThan(20000);
			const duration = svg.match(/dur="([^s]+)s"/u)![1]!;
			expect(duration).not.toContain("e");
			expect(Number(duration)).toBeGreaterThan(0);
			const spacing = Number(svg.match(/stroke-dasharray="0 ([^"]+)"/u)![1]);
			expect(spacing).toBeGreaterThan(0);
			expect(Number.isFinite(spacing)).toBe(true);
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
