// A region round one card captions its band where no line into the card
// crosses the caption's words (`lone.ts`): at the band's left corner, else
// in the first gap between the lines wide enough for the words.
import { expect, test } from "bun:test";
import { captionIn, type Point } from "@/transformers/semantic-renderer/layout";

const region = { x: 100, y: 100, width: 368, height: 152 };
const lone = { group: "child", caption: { width: 134, height: 42 } };

/**
 * A line dropping through the region's caption band into its card.
 * @param x Its column.
 * @returns Its points.
 */
function dropping(x: number): Point[] {
	return [
		{ x, y: 0 },
		{ x, y: 150 },
	];
}

/**
 * Whether a line crosses a caption's words, painted 12 in from its box.
 * @param caption The caption's box.
 * @param caption.x Its left edge.
 * @param caption.width Its width.
 * @param x The line's column.
 * @returns True when it does.
 */
function strikes(caption: { x: number; width: number }, x: number): boolean {
	return x > caption.x + 12 && x < caption.x + caption.width - 12;
}

test("a caption stands in its band's corner where no line crosses it", () => {
	expect(captionIn(region, lone, [dropping(400)]).x).toBe(104);
});

// Taken from a dogfood view: lines into Codex session dropped through both
// ends of its region's band, and the caption stood over the left one.
test("a caption stands between lines at both ends of its band", () => {
	const lines = [dropping(130), dropping(440)];
	const caption = captionIn(region, lone, lines);
	for (const [points] of lines.map((line) => [line]))
		expect(strikes(caption, points![0]!.x)).toBe(false);
});
