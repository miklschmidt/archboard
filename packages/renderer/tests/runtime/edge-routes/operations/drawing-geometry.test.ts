import { expect, test } from "bun:test";
import { routeCrosses } from "#tests/runtime/support/drawn-routes.ts";

test("a decimal header attachment clears its face, but a visible incursion does not", () => {
	const header = { x: 5576, y: 99.04, width: 340, height: 88 };
	const end = { x: 5848, y: 231.06 };
	expect(routeCrosses([{ x: 5848, y: 187.04 }, end], header)).toBe(false);
	expect(routeCrosses([{ x: 5848, y: 187.03 }, end], header)).toBe(true);
});
