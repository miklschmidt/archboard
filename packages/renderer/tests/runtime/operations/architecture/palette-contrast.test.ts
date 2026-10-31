// The words and the marks of every named colour, as a reader sees them on each
// ground (TASK-422, TASK-432).
//
// What this catches: a card's words, a tag's words on its finish, a kind's glyph
// or a line that falls under its APCA level on the ground it crosses, in either
// theme. The levels are APCA's (`APCA` in drawn-colours.ts), not the WCAG 2 ratio.

import { APCAcontrast, sRGBtoY } from "apca-w3";
import { describe, expect, test } from "bun:test";

import { renderArchitecture } from "#runtime/operations/render.ts";
import { APCA, lightnessContrast, paintedIn } from "#tests/runtime/support/drawn-colours.ts";
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

test("apca-w3 keeps the contract the contrast checks rely on", () => {
	// The one local declaration of apca-w3 0.1.9 (apca-w3.d.ts) says the result
	// is signed by polarity and reaches about 106 and 108 at the extremes.
	const [black, white] = [sRGBtoY([0, 0, 0]), sRGBtoY([255, 255, 255])];
	expect(APCAcontrast(black, white)).toBeCloseTo(106.04, 1);
	expect(APCAcontrast(white, black)).toBeCloseTo(-107.88, 1);
});

describe("every named colour keeps its words and its marks legible", () => {
	test.each(THEMES)("the words on a card of every group (%s)", async (theme) => {
		const svg = paintedIn((await renderArchitecture({ content, policy })).svg, theme);
		for (const color of COLOURS) {
			const card = cardOf(groupOf(svg, "node", color)!.markup);
			const name = lightnessContrast(card.name, card.face);
			const description = lightnessContrast(card.description, card.face);
			expect(name, `${color} name`).toBeGreaterThanOrEqual(APCA.body);
			expect(description, `${color} description`).toBeGreaterThanOrEqual(APCA.content);
		}
	});

	test.each(THEMES)("a tag's words keep their level on its finish (%s)", async (theme) => {
		const svg = paintedIn((await renderArchitecture({ content, policy })).svg, theme);
		for (const color of COLOURS) {
			const stops = new RegExp(
				`id="ab-door-${color}".*?stop-color="(#[0-9a-f]{6})".*?stop-color="(#[0-9a-f]{6})"`,
				"su",
			).exec(svg)!;
			const markup = groupOf(svg, "node", color)!.markup;
			const tag = markup.slice(markup.indexOf(`url(#ab-door-${color})`));
			const ink = /<g [^>]*fill="(#[0-9a-f]{6})"[^>]*aria-hidden="true">/u.exec(tag)![1]!;
			for (const stop of stops.slice(1))
				expect(lightnessContrast(ink, stop!), color).toBeGreaterThanOrEqual(APCA.mark);
		}
	});

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
