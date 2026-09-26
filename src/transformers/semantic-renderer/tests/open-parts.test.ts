// Where a wrapped card may step aside to let a line drop straight: the parts
// of a span the cards standing in the way leave open. A part as narrow as
// nothing once had a card step into it, and no line got straighter.
import { expect, test } from "bun:test";
import { openParts } from "@/transformers/semantic-renderer/lib/track/wrap-columns";

test("two cards whose kept lanes touch leave no part a line can stand in", () => {
	expect(
		openParts(
			[0, 100],
			[
				[-10, 50],
				[50, 120],
			],
		),
	).toEqual([]);
});
