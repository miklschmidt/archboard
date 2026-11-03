import { expect, test } from "bun:test";

import { stepFor } from "#ui/hooks/canvas/use-presentation-keys.ts";

test.each([
	["]", 1, 2],
	["[", 1, 0],
	["]", 2, 2],
	["[", 0, 0],
])("%s from step %i of three lands on step %i", (key, from, to) => {
	expect(stepFor(key, from, 3)).toBe(to);
});
