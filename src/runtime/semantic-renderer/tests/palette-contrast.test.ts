// The words and the marks of every named colour, as a reader sees them on each
// ground (TASK-422).
//
// What this catches: a card's words that fall under 4.5:1 on the face a group
// tints, and, on the light ground, a face clipped out of its group's hue or
// too pale to show it, a front edge no darker than its face, a type's glyph
// under 3:1 on its chip or a line under 3:1 against the page or a tray's
// floor. The light colours once
// stayed pale to keep their words legible. These numbers say that deep ink
// and strong colours keep them legible instead.

import { describe, expect, test } from "bun:test";

import { renderArchitecture } from "@/runtime/semantic-renderer/index";
import {
	chromaOf,
	contrast,
	luminance,
	paintedIn,
	toneHueOf,
} from "@/runtime/semantic-renderer/tests/drawn-colours";
import { groupOf } from "@/runtime/semantic-renderer/tests/drawn-subjects";
import { orderedFixture } from "@/runtime/semantic-renderer/tests/ordered-fixture";
import type { DiagramTheme } from "@/shared/semantic-board/index";
import { PaletteColorSchema, SemanticPolicySchema } from "@/shared/semantic-policy/index";
import { themeColor } from "@/shared/theme/server";

const COLOURS = PaletteColorSchema.options;

/** One card for each colour: in a group of that colour, of a kind of that colour, and a line of it to the next. */
const policy = SemanticPolicySchema.parse({
	levels: ["service"],
	nodeKinds: Object.fromEntries(
		COLOURS.map((color) => [color, { name: color, icon: "RiBox3Line", color }]),
	),
	groups: Object.fromEntries(COLOURS.map((color) => [color, { name: color, color }])),
	relationshipKinds: Object.fromEntries(
		COLOURS.map((color) => [color, { name: color, color, dash: "solid", arrowhead: "filled" }]),
	),
});
const content = orderedFixture({
	nodes: COLOURS.map((color) => ({
		id: color,
		name: `A ${color} card`,
		kind: color,
		responsibility: "Says what it does",
		groups: [color],
	})),
	edges: COLOURS.map((color, index) => ({
		id: `line${index}`,
		from: COLOURS[(index + 1) % COLOURS.length],
		to: color,
		kind: color,
	})),
});

/**
 * One card as painted: its face, its chip's face, the ink of its glyph, and its
 * two lines of words. The opaque rects after the selection ring are the card's
 * front edge, highlight and face, then the chip's.
 * @param markup The card's group, painted in literals.
 * @returns The colours.
 */
function cardOf(markup: string) {
	const afterHalo = markup.slice(markup.indexOf('class="ab-halo"'));
	const rects = [...afterHalo.matchAll(/<rect[^>]* fill="(#[0-9a-f]{6})"\/>/gu)].map((m) => m[1]!);
	const words = [...markup.matchAll(/<text [^>]*fill="(#[0-9a-f]{6})"/gu)].map((m) => m[1]!);
	const glyph = /data-type-icon="[^"]+"><svg[^>]* fill="(#[0-9a-f]{6})"/u.exec(markup)![1]!;
	return {
		edge: rects[0]!,
		face: rects[2]!,
		chip: rects[5]!,
		glyph,
		name: words[0]!,
		description: words[1]!,
	};
}

/**
 * How far apart two hues are, round the circle.
 * @param a One hue, in degrees.
 * @param b The other.
 * @returns The angle between them.
 */
function hueApart(a: number, b: number): number {
	const apart = Math.abs(a - b) % 360;
	return Math.min(apart, 360 - apart);
}

describe("every named colour keeps its words and its marks legible", () => {
	test.each(["light", "dark"] as DiagramTheme[])(
		"the words on a grouped card (%s)",
		async (theme) => {
			const svg = paintedIn((await renderArchitecture({ content, policy })).svg, theme);
			for (const color of COLOURS) {
				const card = cardOf(groupOf(svg, "node", color)!.markup);
				expect(contrast(card.name, card.face), `${color} name`).toBeGreaterThanOrEqual(4.5);
				expect(contrast(card.description, card.face), `${color} words`).toBeGreaterThanOrEqual(4.5);
			}
		},
	);

	test("a grouped face is a clear tint in its group's hue (light)", async () => {
		const svg = paintedIn((await renderArchitecture({ content, policy })).svg, "light");
		for (const color of COLOURS) {
			const card = cardOf(groupOf(svg, "node", color)!.markup);
			const ink = themeColor("light", `--semantic-${color}`);
			// A tint sRGB cannot hold is clipped into a neighbouring hue: a blue face
			// turns sky. The face keeps the hue of its colour and a tint that shows.
			expect(hueApart(toneHueOf(card.face), toneHueOf(ink)), `${color} face hue`).toBeLessThan(6);
			expect(chromaOf(card.face), `${color} face tint`).toBeGreaterThan(0.028);
		}
	});

	test.each(["light", "dark"] as DiagramTheme[])(
		"a grouped card's front edge is its face in shade, a step darker (%s)",
		async (theme) => {
			const svg = paintedIn((await renderArchitecture({ content, policy })).svg, theme);
			for (const color of COLOURS) {
				const card = cardOf(groupOf(svg, "node", color)!.markup);
				// The front edge is turned from the light: darker than the face, by as
				// clear a step as a neutral card's edge in the dark theme, about 1.33:1.
				expect(luminance(card.edge), `${color} edge`).toBeLessThan(luminance(card.face));
				expect(contrast(card.edge, card.face), `${color} step`).toBeGreaterThanOrEqual(1.3);
				expect(
					hueApart(toneHueOf(card.edge), toneHueOf(card.face)),
					`${color} edge hue`,
				).toBeLessThan(8);
			}
		},
	);

	test("a glyph on its chip, and a line on the page and on a tray's floor (light)", async () => {
		const svg = paintedIn((await renderArchitecture({ content, policy })).svg, "light");
		const page = themeColor("light", "--background");
		const floor = themeColor("light", "--tray-floor");
		// Yellow is the product's gold (TASK-419), and its light value stays under
		// 3:1 as a mark; the notes of TASK-422 hold its numbers.
		for (const [index, color] of COLOURS.entries()) {
			if (color === "yellow") continue;
			const card = cardOf(groupOf(svg, "node", color)!.markup);
			expect(contrast(card.glyph, card.chip), `${color} glyph`).toBeGreaterThanOrEqual(3);
			const line = /marker-end="[^"]*" fill="none" stroke="(#[0-9a-f]{6})"/u.exec(
				groupOf(svg, "edge", `line${index}`)!.markup,
			)![1]!;
			expect(contrast(line, page), `${color} line on the page`).toBeGreaterThanOrEqual(3);
			expect(contrast(line, floor), `${color} line on a floor`).toBeGreaterThanOrEqual(3);
		}
	});
});
