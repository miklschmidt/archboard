// A container's header wraps its words at the width of the slab they stand
// on, as drawn, and stands no taller than they need (TASK-486): measured
// before layout at a card's widest, a wide container's responsibility stood
// as a narrow column at the left of a wide, tall, mostly empty slab.
import { expect, test } from "bun:test";
import { LayoutEngineSchema } from "@archboard/board/render-reply";
import {
	ARCHITECTURE_CARD_PADDING,
	ARCHITECTURE_ICON_GAP,
	CONTAINER_INSET,
} from "#shared/constants/spacing.ts";
import { renderArchitecture } from "#runtime/operations/render.ts";
import { orderedFixture } from "#tests/runtime/support/ordered-fixture.ts";
import {
	drawnTexts,
	drawnWidth,
	registeredFaces,
	type DrawnText,
} from "#tests/runtime/support/drawn-text.ts";
import { DEFAULT_SEMANTIC_POLICY } from "@archboard/board/policy";

/** The type chip a slab keeps left of its words, and the gap between them. */
const CHIP_AND_GAP = 24 + ARCHITECTURE_ICON_GAP;
/** The responsibility's size: a note's, set smaller than the name. */
const NOTE_SIZE = 11;

const RESPONSIBILITY =
	"Loads the retained state and reopens the same hardware key, renews with a fresh proof of that key when a renewal is due, and saves the outcome without any identity rollback.";

const content = orderedFixture({
	nodes: [
		{ id: "plan", name: "Durable access", kind: "service", responsibility: RESPONSIBILITY },
		...["Load", "Open", "Renew", "Serve"].map((name) => ({
			id: name.toLowerCase(),
			name: `${name} the certificate`,
			kind: "module",
			parent: "plan",
		})),
	],
	edges: [],
});

/**
 * How many lines words take, broken only between words, at a width.
 * @param line One drawn line, whose face and size the words are set in.
 * @param words The words.
 * @param width The width.
 * @param faces The faces the document registers.
 * @returns The count.
 */
function linesAt(
	line: DrawnText,
	words: readonly string[],
	width: number,
	faces: ReadonlyMap<string, string>,
): number {
	let lines = 1;
	let text = "";
	for (const word of words) {
		const longer = text === "" ? word : `${text} ${word}`;
		if (text !== "" && drawnWidth({ ...line, text: longer }, faces) > width) {
			lines += 1;
			text = word;
		} else text = longer;
	}
	return lines;
}

test.each(LayoutEngineSchema.options)(
	"a wide container's header wraps at its slab and is as tall as its words (%s)",
	async (layout) => {
		const drawing = await renderArchitecture({
			policy: DEFAULT_SEMANTIC_POLICY,
			content,
			theme: "light",
			layout,
		});
		const frame = drawing.atlas.nodes["plan"]!;
		const notes = drawnTexts(drawing.svg).filter(
			({ subject, size }) => subject.id === "plan" && size === NOTE_SIZE,
		);
		const first = notes[0]!;
		// The words stand in from the slab's left by the chip, and from its right by the slab's padding.
		const room = frame.x + frame.width - (first.x - frame.x) + CHIP_AND_GAP - first.x;
		const needed = linesAt(first, RESPONSIBILITY.split(" "), room, registeredFaces(drawing.svg));
		expect(frame.width).toBeGreaterThan(2 * 340);
		expect(notes.length).toBe(needed);
		// Under the last line: its descent, the slab's padding, and the inset above the cards.
		const cards = ["load", "open", "renew", "serve"].map((id) => drawing.atlas.nodes[id]!.y);
		const below = Math.min(...cards) - notes.at(-1)!.y;
		expect(below).toBeLessThanOrEqual(
			17 - NOTE_SIZE + ARCHITECTURE_CARD_PADDING + CONTAINER_INSET + 8,
		);
	},
);
