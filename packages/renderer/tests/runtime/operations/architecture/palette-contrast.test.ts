// The words and the marks of every named colour, as a reader sees them on each
// ground (TASK-422, TASK-432).
//
// What this catches: a card's words or a kind's glyph or a line that falls
// under its APCA level on the face a group tints or the ground it crosses, in
// either theme, and, on the light ground, a face clipped out of its group's
// hue or too pale to show it, and a front edge no darker than its face. The
// light colours once stayed pale to keep their words legible. These numbers
// say that deep ink and strong colours keep them legible instead. The levels
// are APCA's (`APCA` in drawn-colours.ts), not the WCAG 2 ratio.

import { APCAcontrast, sRGBtoY } from "apca-w3";
import { describe, expect, test } from "bun:test";

import { renderArchitecture } from "#runtime/operations/render.ts";
import {
	APCA,
	chromaOf,
	lightnessContrast,
	lightnessOf,
	paintedIn,
	toneHueOf,
} from "#tests/runtime/support/drawn-colours.ts";
import { groupOf } from "#tests/runtime/support/drawn-subjects.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import type { DiagramTheme } from "@archboard/board/render-reply";
import { PaletteColorSchema, SemanticPolicySchema } from "@archboard/board/policy";
import { themeColor } from "#runtime/store/theme/source.ts";

const COLOURS = PaletteColorSchema.options;
const THEMES: DiagramTheme[] = ["light", "dark"];

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
	const words = [...markup.matchAll(/<g [^>]*fill="(#[0-9a-f]{6})"[^>]*aria-hidden="true">/gu)].map(
		(m) => m[1]!,
	);
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

test("apca-w3 keeps the contract the contrast checks rely on", () => {
	// The one local declaration of apca-w3 0.1.9 (apca-w3.d.ts) says the result
	// is signed by polarity and reaches about 106 and 108 at the extremes.
	const [black, white] = [sRGBtoY([0, 0, 0]), sRGBtoY([255, 255, 255])];
	expect(APCAcontrast(black, white)).toBeCloseTo(106.04, 1);
	expect(APCAcontrast(white, black)).toBeCloseTo(-107.88, 1);
});

describe("every named colour keeps its words and its marks legible", () => {
	test.each(THEMES)("the words on a grouped card (%s)", async (theme) => {
		const svg = paintedIn((await renderArchitecture({ content, policy })).svg, theme);
		for (const color of COLOURS) {
			const card = cardOf(groupOf(svg, "node", color)!.markup);
			const name = lightnessContrast(card.name, card.face);
			const description = lightnessContrast(card.description, card.face);
			expect(name, `${color} name`).toBeGreaterThanOrEqual(APCA.body);
			expect(description, `${color} description`).toBeGreaterThanOrEqual(APCA.content);
		}
	});

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

	test.each(THEMES)(
		"a grouped card's front edge is its face in shade, a step darker (%s)",
		async (theme) => {
			const svg = paintedIn((await renderArchitecture({ content, policy })).svg, theme);
			for (const color of COLOURS) {
				const card = cardOf(groupOf(svg, "node", color)!.markup);
				// The front edge is turned from the light: darker than the face in
				// OKLCH lightness by as clear a step as a neutral card's edge in the
				// dark theme, which is 0.095 under its face.
				expect(
					lightnessOf(card.face) - lightnessOf(card.edge),
					`${color} step`,
				).toBeGreaterThanOrEqual(0.09);
				expect(
					hueApart(toneHueOf(card.edge), toneHueOf(card.face)),
					`${color} edge hue`,
				).toBeLessThan(8);
			}
		},
	);

	test.each(THEMES)(
		"a glyph on its chip, and a line on the page and on a tray's floor (%s)",
		async (theme) => {
			const svg = paintedIn((await renderArchitecture({ content, policy })).svg, theme);
			const page = themeColor(theme, "--background");
			const floor = themeColor(theme, "--tray-floor");
			for (const [index, color] of COLOURS.entries()) {
				const card = cardOf(groupOf(svg, "node", color)!.markup);
				const line = /marker-end="[^"]*" fill="none" stroke="(#[0-9a-f]{6})"/u.exec(
					groupOf(svg, "edge", `line${index}`)!.markup,
				)![1]!;
				expect(lightnessContrast(card.glyph, card.chip), `${color} glyph`).toBeGreaterThanOrEqual(
					APCA.mark,
				);
				expect(lightnessContrast(line, page), `${color} line, page`).toBeGreaterThanOrEqual(
					APCA.mark,
				);
				expect(lightnessContrast(line, floor), `${color} line, floor`).toBeGreaterThanOrEqual(
					APCA.mark,
				);
			}
		},
	);

	test.each(THEMES)("the named yellow is the shell's gold as a mark (%s)", (theme) => {
		// A kind, a line or a group's corners in yellow are the gold of the
		// product's primary actions (DESIGN.md, the One Gold Rule).
		expect(themeColor(theme, "--semantic-yellow")).toBe(themeColor(theme, "--primary-mark"));
	});
});
