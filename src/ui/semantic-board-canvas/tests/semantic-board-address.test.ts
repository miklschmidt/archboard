// How a pane's board key spells which board and which variant it is showing.
//
// The rule these hold to is one rule: the key a pane reports is the key that
// reopens it. Anything less and the address bar and the pane fight — the pane
// says it is showing a proposal, the address says the board, and the next
// restore puts the pane somewhere it has never been.

import { expect, test } from "bun:test";

import { boardAddressOf, boardKeyFor, sameBoardName } from "@/ui/semantic-board-canvas";

test("a key naming a variant round-trips through the address and back", () => {
	const key = boardKeyFor("pipeline", "7c40IV7N");
	expect(key).toBe("pipeline@7c40IV7N");
	// Both halves come back as they went in, which is what lets a restore put the
	// pane on the proposal it was on rather than on the board's current state.
	expect(boardAddressOf(key)).toEqual({ board: "pipeline", variant: "7c40IV7N" });
	expect(boardKeyFor("pipeline", boardAddressOf(key)?.variant)).toBe(key);
});

test("a key naming no variant still means whichever variant is current", () => {
	// Every address written before variants were addressable says this, and it
	// has to go on meaning what it meant: the board, as it stands.
	expect(boardKeyFor("pipeline")).toBe("pipeline");
	expect(boardAddressOf("pipeline")).toEqual({ board: "pipeline", variant: undefined });
	expect(boardAddressOf("")).toBeNull();
	expect(boardAddressOf(null)).toBeNull();
});

test("the variant is everything after the first mark, punctuation and all", () => {
	// A board's own name can never hold an `@` — it is reserved in a name segment
	// — and a proposal's name can. So the split is at the FIRST mark and the
	// variant is the whole of the rest: a proposal called "Queue @ edge" is a
	// title somebody wrote, and a name a branch accepts that nothing can open
	// would be a trap. This is the same rule the server parses by.
	expect(boardAddressOf("a@Queue @ edge")).toEqual({ board: "a", variant: "Queue @ edge" });
	expect(boardKeyFor("payments", "Queue @ edge")).toBe("payments@Queue @ edge");
	expect(boardAddressOf(boardKeyFor("payments", "Queue @ edge"))).toEqual({
		board: "payments",
		variant: "Queue @ edge",
	});
});

test("two spellings of one board name are one board", () => {
	// The server keys a board by a normalised form of its name and reports the
	// name as it was written, so the two reach the browser in different cases and
	// only a case-insensitive comparison can tell they are one board (ADR 0010).
	expect(sameBoardName("Payments", "payments")).toBe(true);
	expect(sameBoardName("payments", "payments/eu")).toBe(false);
});
