// Whether a drawn diagram moves, and what decides it.
//
// A relationship that carries traffic is drawn with a dot travelling along it,
// and a message of an exchange with a dot crossing at its turn. That motion was
// dropped when this renderer was forked and the drawing went still in both
// grammars — a `call` looked exactly like a `dependency`, and a sequence read as
// a ladder rather than as something happening.
//
// What these hold to is that nothing about it is authored: the board says what
// the relationship IS, and this decides whether that means traffic. That a page
// of exchanges is told on one clock rather than several running at once. And
// that a reader who has asked their system for less motion gets a still
// picture, in a file that has no viewer around it to ask.

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
		{ id: "plain", from: "store", to: "api", kind: "data", label: "rows" },
		{ id: "built", from: "api", to: "store", kind: "dependency", emphasis: "normal" },
		{ id: "quiet", from: "store", to: "api", kind: "http", emphasis: "muted" },
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
	return svg.split('<circle class="ab-pulse"').length - 1;
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
	return own.split("<animateMotion").length - 1;
}

describe("an architecture says which relationships carry traffic", () => {
	test("a relationship something travels along moves, and one that is a fact does not", async () => {
		const svg = await drawn("architecture");
		expect(MOTION.test(svg)).toBe(true);
		// A call carries something from one part to another; a dependency is true
		// whether or not anything is happening, so nothing travels along it.
		expect(pulsesOn(svg, "plain")).toBe(1);
		expect(pulsesOn(svg, "built")).toBe(0);
		// Muted is a line pushed into the background on purpose, and a moving dot
		// is the least background thing a picture can do.
		expect(pulsesOn(svg, "quiet")).toBe(0);
	});

	test("a hero relationship carries a train, which is how it reads as busier", async () => {
		const svg = await drawn("architecture");
		// Three dots rather than one faster one: a count reads as volume where
		// speed would read as urgency.
		expect(pulsesOn(svg, "hero")).toBe(3);
		expect(pulsesOn(svg, "hero")).toBeGreaterThan(pulsesOn(svg, "plain"));
	});

	test("nothing about the motion is authored on the board", async () => {
		// The same content parsed by its own contract, with no motion field of any
		// kind on a relationship — if one were needed, this would not compile and
		// an agent would be deciding how its architecture looks.
		expect(Object.keys(SAMPLE.edges[0] ?? {})).not.toContain("animated");
		expect(MOTION.test(await drawn("architecture"))).toBe(true);
	});
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
