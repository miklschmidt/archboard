// A card's two views, near and far, as one shared element transition (TASK-428).
//
// What these catch: a chip drawn twice, once in each view, so the two cannot
// move as one. A picture that a reader without the stylesheet, or an export
// with no far class, draws anywhere but near. And words that move somewhere
// other than where the other view's words start, which would show as a jump
// at the end of the swap.

import { describe, expect, test } from "bun:test";

import { renderSemanticView } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import type { DiagramGrammar } from "@archboard/board/views";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

const content = orderedFixture({
	nodes: [
		{
			id: "system",
			name: "Board service",
			kind: "service",
			responsibility: "Accepts authored meaning and keeps revisions together.",
		},
		{
			id: "api",
			name: "API",
			kind: "service",
			parent: "system",
			responsibility: "Accepts board changes and checks the writer.",
		},
		{
			id: "store",
			name: "Board storage",
			kind: "datastore",
			parent: "system",
			responsibility: "Keeps the complete board and its proposals together.",
		},
	],
	edges: [{ id: "write", from: "api", to: "store", kind: "data", label: "write revision" }],
	flows: [
		{
			id: "save",
			name: "Save a board",
			participants: ["api", "store"],
			steps: [{ id: "saveit", from: "api", to: "store", kind: "sync", label: "persist" }],
		},
	],
});

/** A place a transform puts the origin at, and how much it scales. */
interface Place {
	readonly x: number;
	readonly y: number;
	readonly scale: number;
}

/** One number, as a transform writes it. */
const N = String.raw`(-?[\d.]+)`;

/**
 * A move and a scale, as an attribute or a stylesheet property writes it.
 * @param unit "px" in a property, nothing in an attribute.
 * @returns The pattern, with the move and the scale as groups.
 */
function placePattern(unit: "" | "px"): string {
	return String.raw`translate\(${N}${unit},${N}${unit}\) scale\(${N}\)`;
}

/**
 * The place three captured numbers say.
 * @param found The captures.
 * @param from Where the three start.
 * @returns The place.
 */
function placeOf(found: RegExpExecArray, from: number): Place {
	return { x: Number(found[from]), y: Number(found[from + 1]), scale: Number(found[from + 2]) };
}

const CHIP = new RegExp(
	String.raw`<g class="ab-chip" transform="${placePattern("")}" style="--near:${placePattern("px")};--far:${placePattern("px")}"`,
	"gu",
);

const WORDS = new RegExp(
	String.raw`<g class="ab-words" style="--away:${placePattern("px")}">[^]*?<text[^>]* x="${N}" y="${N}"[^>]* font-size="${N}"`,
	"gu",
);

/** A part's chip, near and far. */
interface Chip {
	readonly drawn: Place;
	readonly near: Place;
	readonly far: Place;
}

/** A view's words: where they start, how large their first line is, and where they go while their view is hidden. */
interface Words {
	readonly x: number;
	readonly y: number;
	readonly size: number;
	readonly away: Place;
}

/** What one part draws of its two views. */
interface Views {
	readonly chips: readonly Chip[];
	/** The near view's words, then the far view's. */
	readonly words: readonly Words[];
	/** Where the chip stands among the part's markup, and where each view begins. */
	readonly at: { readonly chip: number; readonly near: number; readonly far: number };
}

/**
 * The two views one part draws.
 * @param svg The picture.
 * @param id The part.
 * @param part Which of its groups: a card's own, or a container's header.
 * @returns What it draws.
 */
function viewsOf(svg: string, id: string, part: "card" | "header" | "flow"): Views {
	const chunk = svg
		.split(/(?=<g data-semantic-kind=)/u)
		.find(
			(group) =>
				group.includes(`data-semantic-id="${id}"`) &&
				group.includes('class="ab-words"') &&
				(part === "header") === group.includes('data-semantic-part="header"'),
		);
	expect(chunk).toBeDefined();
	const chips = [...chunk!.matchAll(CHIP)].map((found) => ({
		drawn: placeOf(found, 1),
		near: placeOf(found, 4),
		far: placeOf(found, 7),
	}));
	const words = [...chunk!.matchAll(WORDS)].map((found) => ({
		away: placeOf(found, 1),
		x: Number(found[4]),
		y: Number(found[5]),
		size: Number(found[6]),
	}));
	return {
		chips,
		words,
		at: {
			chip: chunk!.indexOf('class="ab-chip"'),
			near: chunk!.indexOf('class="ab-near"'),
			far: chunk!.indexOf('class="ab-far"'),
		},
	};
}

/**
 * Where a place puts a point.
 * @param place The place.
 * @param point The point.
 * @param point.x Across.
 * @param point.y Down.
 * @returns The point moved.
 */
function moved(place: Place, point: { x: number; y: number }): { x: number; y: number } {
	return { x: place.x + point.x * place.scale, y: place.y + point.y * place.scale };
}

const PARTS: readonly (readonly [DiagramGrammar, string, "card" | "header"])[] = [
	["architecture", "api", "card"],
	["architecture", "store", "card"],
	["architecture", "system", "header"],
	["sequence", "api", "card"],
	["sequence", "store", "card"],
];

describe("a part's near and far views", () => {
	for (const [grammar, id, part] of PARTS) {
		test(`${grammar} ${id}: one chip both views share, drawn near unless the picture is far, and words that move to where the other view's words start`, async () => {
			const rendered = await renderSemanticView({
				policy: DEFAULT_SEMANTIC_POLICY,
				grammar,
				content,
				theme: "light",
			});
			const views = viewsOf(rendered.svg, id, part);

			// One chip, outside both views, so it moves as one element.
			expect(views.chips).toHaveLength(1);
			expect(views.at.chip).toBeLessThan(views.at.near);
			expect(views.at.near).toBeLessThan(views.at.far);
			const [chip] = views.chips;
			// Drawn near by its own attribute: a reader without the stylesheet, and an export with no far class, draw it near.
			for (const key of ["x", "y", "scale"] as const) {
				expect(chip!.drawn[key]).toBeCloseTo(chip!.near[key], 2);
			}
			expect(chip!.near.scale).toBe(1);
			// From far it grows into a tile.
			expect(chip!.far.scale).toBeGreaterThan(1.5);

			// Each view's words go to where the other view's words start, at the other's size.
			expect(views.words).toHaveLength(2);
			const [near, far] = views.words;
			const nearGoes = moved(near!.away, near!);
			expect(nearGoes.x).toBeCloseTo(far!.x, 1);
			expect(nearGoes.y).toBeCloseTo(far!.y, 1);
			expect(near!.away.scale).toBeCloseTo(far!.size / near!.size, 2);
			const farComes = moved(far!.away, far!);
			expect(farComes.x).toBeCloseTo(near!.x, 1);
			expect(farComes.y).toBeCloseTo(near!.y, 1);
			// The far tile stands before the far words.
			expect(chip!.far.x + 24 * chip!.far.scale).toBeLessThan(far!.x);
		});
	}

	test("a tall card's far tile stands at its top, where its chip stands near, not halfway down", async () => {
		const tall = orderedFixture({
			nodes: [
				{
					id: "tall",
					name: "Picture transition",
					kind: "service",
					responsibility:
						"Carries one picture into the next: kept parts fly to their new places, departed ones fade, and the traffic's clock carries over; a picture a flight arrived at is put up as it is.",
				},
			],
		});
		const rendered = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			grammar: "architecture",
			content: tall,
			theme: "light",
		});
		const [chip] = viewsOf(rendered.svg, "tall", "card").chips;
		expect(chip!.far.y).toBeLessThanOrEqual(chip!.near.y);
	});

	test("sequence save: a flow's heading, which has no chip, moves its words between the near and the far place", async () => {
		const rendered = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			grammar: "sequence",
			content,
			theme: "light",
		});
		const views = viewsOf(rendered.svg, "save", "flow");
		expect(views.chips).toHaveLength(0);
		expect(views.words).toHaveLength(2);
		const [near, far] = views.words;
		const nearGoes = moved(near!.away, near!);
		expect(nearGoes.x).toBeCloseTo(far!.x, 1);
		expect(nearGoes.y).toBeCloseTo(far!.y, 1);
		const farComes = moved(far!.away, far!);
		expect(farComes.x).toBeCloseTo(near!.x, 1);
		expect(farComes.y).toBeCloseTo(near!.y, 1);
	});

	test("the stylesheet moves the chip and the words only while the picture is far, and not for a reader who asked for less motion", async () => {
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			grammar: "architecture",
			content,
			theme: "light",
		});
		const sheet = /<style>([^]*?)<\/style>/u.exec(svg)?.[1] ?? "";
		expect(sheet).toContain(".ab-chip{transform:var(--near);");
		expect(sheet).toContain(".is-far .ab-chip{transform:var(--far)}");
		expect(sheet).toContain(".ab-far>.ab-words,.is-far .ab-near>.ab-words{transform:var(--away)}");
		expect(sheet).toContain(".is-far .ab-far>.ab-words{transform:none}");
		const reduced = /@media\(prefers-reduced-motion:reduce\)\{([^{}]*)\{transition:none\}\}/u.exec(
			sheet,
		)?.[1];
		expect(reduced?.split(",")).toEqual(expect.arrayContaining([".ab-chip", ".ab-words"]));
	});

	test("the two views fade over one span with one easing, so the words never fade out together, and a view hides only after it has faded", async () => {
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			grammar: "architecture",
			content,
			theme: "light",
		});
		const sheet = /<style>([^]*?)<\/style>/u.exec(svg)?.[1] ?? "";
		/**
		 * One rule's transitions, by property.
		 * @param selector The rule's selector, as written.
		 * @returns Each property's duration, easing and delay.
		 */
		const transitionsOf = (selector: string): Map<string, string> => {
			const body = new RegExp(`(?:^|\\})${selector.replaceAll(".", "\\.")}\\{([^}]*)\\}`, "u").exec(
				sheet,
			)?.[1];
			const list = /transition:([^;]*)/u.exec(body ?? "")?.[1] ?? "";
			return new Map(
				list.split(/,(?![^(]*\))/u).map((one) => {
					const [property = "", ...rest] = one.trim().split(/\s+/u);
					return [property, rest.join(" ")];
				}),
			);
		};
		const shown = [transitionsOf(".ab-near"), transitionsOf(".is-far .ab-far")];
		const hidden = [transitionsOf(".ab-far"), transitionsOf(".is-far .ab-near")];
		// Every opacity fade is the same, with no delay: the coming view is as opaque as the leaving view is clear.
		const fades = new Set([...shown, ...hidden].map((rule) => rule.get("opacity")));
		expect(fades.size).toBe(1);
		const [fade] = fades;
		expect(fade).toMatch(/^\d+ms \S+$/u);
		const span = fade!.split(" ")[0];
		// A view that comes is drawn at once, still clear. A view that leaves is hidden once its fade has ended.
		for (const rule of shown) expect(rule.get("visibility")).toBe("0s");
		for (const rule of hidden) expect(rule.get("visibility")).toBe(`0s linear ${span}`);
	});

	test("a picture that stands alone in one theme sets no theme colour for the places of its chips", async () => {
		const { svg } = await renderSemanticView({
			policy: DEFAULT_SEMANTIC_POLICY,
			grammar: "architecture",
			content,
			theme: "dark",
		});
		const root = /<svg[^>]*style="([^"]*)"/u.exec(svg)?.[1] ?? "";
		expect(root).toContain("color-scheme:dark");
		expect(root).not.toMatch(/--(near|far|away):/u);
	});
});
