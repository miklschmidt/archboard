// Every word a card or a line's plate carries is drawn whole, at its readable
// size, inside what holds it, as the drawn document says it. What this catches:
// a word lost or broken where its room holds it whole, a wrapped line that keeps
// the space it broke at and widens its card, a plate whose lines are not
// balanced or not centred, a container that draws its description, and a
// render that answers differently after another board was drawn.
import { expect, test } from "bun:test";
import type { VariantContent } from "@archboard/board/content";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import {
	drawnSpan,
	drawnTexts,
	labelPlates,
	spanFits,
	type DrawnText,
} from "#tests/runtime/support/drawn-text.ts";

/** A card's name size: archboard_scene::paint::design CARD_TITLE_FONT. */
const TITLE_SIZE = 14;
/** A card's responsibility size, set smaller than its name. */
const NOTE_SIZE = 11;
/** A line's words size: archboard_scene::paint::design PILL_FONT. */
const LABEL_SIZE = 10;
/** The narrowest a plate is: archboard_scene::measure::labels LABEL_MIN_WIDTH. */
const LABEL_MIN_WIDTH = 40;
/** The widest a card is drawn. */
const CARD_MAX_WIDTH = 340;

/**
 * Draw one architecture on the light ground.
 * @param content What to draw.
 * @returns The drawing.
 */
async function drawn(content: VariantContent) {
	return await renderArchitecture({ policy: DEFAULT_SEMANTIC_POLICY, content, theme: "light" });
}

/**
 * A text without its spaces, to compare the letters of wrapped lines.
 * @param text The text.
 * @returns Its letters.
 */
function letters(text: string): string {
	return text.replace(/\s+/g, "");
}

/**
 * The runs drawn for one subject at one size.
 * @param texts Every run of the picture.
 * @param id The subject.
 * @param size The size.
 * @returns Its runs, in drawing order.
 */
function runsOf(texts: readonly DrawnText[], id: string, size: number): DrawnText[] {
	return texts.filter((text) => text.subject.id === id && text.size === size);
}

test("a card's and a plate's words are drawn whole, at readable sizes, inside what holds them", async () => {
	const name = "AuthenticationAndAuthorizationWithUninterruptedLongIdentifiers";
	const responsibility =
		"Owns the complete request lifecycle while preserving every responsibility word across all wrapped lines.";
	const label = "authorization requests with the complete payload";
	const drawing = await drawn(
		orderedFixture({
			nodes: [
				{ id: "api", name, responsibility, kind: "service" },
				{ id: "db", name: "Store", kind: "datastore" },
			],
			edges: [{ id: "call", from: "api", to: "db", kind: "call", label }],
		}),
	);
	const texts = drawnTexts(drawing.svg);
	const card = drawing.atlas.nodes["api"]!;
	const title = runsOf(texts, "api", TITLE_SIZE);
	const note = runsOf(texts, "api", NOTE_SIZE);
	expect(title.length).toBeGreaterThan(1);
	expect(note.length).toBeGreaterThan(1);
	expect(letters(title.map((run) => run.text).join(""))).toBe(name);
	expect(letters(note.map((run) => run.text).join(""))).toBe(letters(responsibility));
	for (const run of [...title, ...note]) {
		expect(spanFits(drawnSpan(run), card)).toBe(true);
		expect(run.y).toBeLessThan(card.y + card.height);
	}
	const plate = labelPlates(drawing.svg).get("call")!;
	const words = runsOf(texts, "call", LABEL_SIZE);
	expect(words.length).toBeGreaterThan(1);
	expect(letters(words.map((run) => run.text).join(""))).toBe(letters(label));
	for (const run of words) {
		expect(spanFits(drawnSpan(run), plate)).toBe(true);
		expect(run.y).toBeLessThan(plate.y + plate.height);
	}
});

// From the dogfood boards: a wrapped line kept the space it broke at, and the
// card grew past its widest by that space's width.
test("a card's wrapped lines do not widen it by the space they broke at", async () => {
	const drawing = await drawn(
		orderedFixture({
			nodes: [
				{
					id: "socket",
					name: "Pane socket",
					kind: "module",
					responsibility:
						"One socket per page: registers it with the panes, and passes its agent messages to the Codex workbench",
				},
			],
		}),
	);
	const runs = drawnTexts(drawing.svg).filter((text) => text.subject.id === "socket");
	expect(runs.length).toBeGreaterThan(2);
	for (const run of runs) expect(run.text).toBe(run.text.trimEnd());
	// Within a hair of its widest: a kept space would add a whole space's width.
	expect(drawing.atlas.nodes["socket"]!.width).toBeLessThan(CARD_MAX_WIDTH + 1);
});

test("a relationship's plate hugs its balanced lines and centres them on the line it labels", async () => {
	// One line of this is just wider than a plate's text room, and one glyph is far narrower.
	// The long word is wider than half the words, so a wrap balanced below it would break it.
	const labels = {
		wrapped: "thread/start with the coordinator body",
		glyph: "/",
		long: "layoutWithLines(handle, width, lineHeight)",
	};
	const drawing = await drawn(
		orderedFixture({
			nodes: ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase(), kind: "service" })),
			edges: Object.entries(labels).map(([id, label], index) => ({
				id,
				from: "a",
				to: ["b", "c", "d"][index],
				kind: "call",
				label,
			})),
		}),
	);
	const texts = drawnTexts(drawing.svg);
	const plates = labelPlates(drawing.svg);
	const wrapped = runsOf(texts, "wrapped", LABEL_SIZE);
	const widths = wrapped.map((run) => run.width);
	expect(wrapped).toHaveLength(2);
	// Balanced: no word is left alone on the last line.
	expect(Math.min(...widths)).toBeGreaterThan(Math.max(...widths) / 2);
	// Balanced, but never inside a word that the plate's room holds whole.
	const long = runsOf(texts, "long", LABEL_SIZE).flatMap((run) => run.text.split(" "));
	expect(long).toEqual(labels.long.split(" "));
	for (const id of ["wrapped", "glyph"]) {
		const plate = plates.get(id)!;
		expect(plate.width).toBeGreaterThanOrEqual(LABEL_MIN_WIDTH);
		for (const run of runsOf(texts, id, LABEL_SIZE)) {
			expect(run.x + run.width / 2).toBeCloseTo(plate.x + plate.width / 2, 1);
		}
	}
});

test("a container draws its whole wrapped header above its members and leaves its description to inspection", async () => {
	const name = "Service ownership and request orchestration";
	const description = "This extended inspector prose must not become another canvas paragraph.";
	const drawing = await drawn(
		orderedFixture({
			nodes: [
				{
					id: "parent",
					name,
					responsibility:
						"Coordinates authentication, authorization, and service request dispatch.",
					description,
					kind: "service",
				},
				{ id: "child", name: "Token store", parent: "parent", kind: "module" },
			],
		}),
	);
	const runs = drawnTexts(drawing.svg).filter((text) => text.subject.id === "parent");
	const child = drawing.atlas.nodes["child"]!;
	expect(runs.every((run) => run.y < child.y)).toBe(true);
	expect(runs.some((run) => description.includes(run.text))).toBe(false);
	expect(
		runsOf(runs, "parent", TITLE_SIZE + 1)
			.map((run) => run.text)
			.join(" "),
	).toBe(name);
});

test("a board drawn in between leaves another board's picture as it was", async () => {
	const words = "AVAST Waterfall Office";
	const content = orderedFixture({
		nodes: [
			{ id: "api", name: words, responsibility: words, kind: "service" },
			{ id: "db", name: "Store", kind: "datastore" },
		],
		edges: [{ id: "call", from: "api", to: "db", kind: "call", label: words }],
	});
	const first = await drawn(content);
	await drawn(
		orderedFixture({
			nodes: [{ id: "other", name: "WWWW iii ffi To Vary AWAY", kind: "service" }],
		}),
	);
	expect((await drawn(content)).svg).toBe(first.svg);
	// The name, its note and the label are three faces or sizes, measured apart.
	const runs = drawnTexts(first.svg).filter((run) => run.text === words);
	expect(new Set(runs.map((run) => run.width)).size).toBeGreaterThan(2);
});
