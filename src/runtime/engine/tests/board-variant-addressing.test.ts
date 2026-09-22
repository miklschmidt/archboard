import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { boardKey, makeIdentity, parseBoardKey, vaultPathFor } from "@/runtime/engine/board";

// A variant used to be a word from a fixed vocabulary. It is now also how an
// address names one state of a semantic board, and that is a minted id: mixed
// case, and nothing may ever rename it (ADR 0023). What these prove is that an
// address hands back the variant somebody typed, whatever case it is in.

test("an address names the variant it was given, in the case it was given", () => {
	const identity = makeIdentity({ board: "payments", variant: "A8zpTnVI" });
	expect(identity.variant).toBe("A8zpTnVI");
});

test("a lasting name with a space in it is addressable", () => {
	// A proposal is named by a person ("Queued ingest"), and that name is what a
	// board answers to. A slug rule here would make a named proposal impossible
	// to put in a pane, while `--variant "Queued ingest"` worked everywhere else.
	expect(makeIdentity({ board: "payments", variant: "Queued ingest" }).variant).toBe(
		"Queued ingest",
	);
	expect(parseBoardKey("payments@Queued ingest").variant).toBe("Queued ingest");
});

test("an address ends its board at the first mark, so a selector may hold one too", () => {
	// A board name may not contain "@", so the first one ends the name and
	// everything after it is the selector. A proposal somebody called "Queue @
	// edge" is a name a branch command takes, so it has to be a name an address
	// takes as well.
	const named = parseBoardKey("payments@Queue @ edge");
	expect(named.board).toBe("payments");
	expect(named.variant).toBe("Queue @ edge");
	expect(makeIdentity({ board: "payments", variant: "Queue @ edge" }).variant).toBe("Queue @ edge");
	// And what no address may hold is still refused.
	expect(() => makeIdentity({ board: "payments", variant: "  " })).toThrow();
});

test("a name a proposal may be given is a name an address may carry", () => {
	// A proposal is named by a person, and a person writes "Proposed: queued
	// ingest". A grammar that accepted the name and refused the address would
	// make a proposal nobody could open.
	for (const named of ["Proposed: queued ingest", "Option A [draft]", "Cache reads?", "A @ B"]) {
		expect(makeIdentity({ board: "payments", variant: named }).variant).toBe(named);
		expect(parseBoardKey(`payments@${named}`).variant).toBe(named);
	}
});

test("a board file refuses what its own filename cannot hold, and only then", () => {
	// A board file spells its variant into a path, so the old rule still applies
	// there — at the moment the name is built, not in the grammar every address
	// goes through.
	const vault = mkdtempSync(join(tmpdir(), "archboard-variant-names-"));
	const suffix = ".semantic.json";
	const named = makeIdentity({ board: "payments", variant: "Proposed: queued ingest" });
	expect(() => vaultPathFor(named, vault, suffix)).toThrow(/filename/u);
	expect(
		vaultPathFor(makeIdentity({ board: "payments", variant: "option-a" }), vault, suffix),
	).toContain("payments@option-a");
	// And the designation is not a variant in a filename at all.
	expect(vaultPathFor(makeIdentity({ board: "payments" }), vault, suffix)).not.toContain("@");
	rmSync(vault, { recursive: true, force: true });
});

test("a variant from the old vocabulary is unaffected", () => {
	expect(makeIdentity({ board: "payments", variant: "option-a" }).variant).toBe("option-a");
	expect(makeIdentity({ board: "payments" }).variant).toBe("current");
});

test("a key spelling a variant reads back the same variant", () => {
	const parsed = parseBoardKey("payments@A8zpTnVI");
	expect(parsed.variant).toBe("A8zpTnVI");
	expect(parsed.board).toBe("payments");
});

test("the identity keeps the casing and the key does not", () => {
	// Two jobs, two answers. What the board is matched by keeps what was typed,
	// because a minted id is mixed-case and a name is written as it was stated.
	// What a lock, a lease and a catalogue entry are filed under does not, because
	// one address a person typed two ways is one board (ADR 0010).
	expect(boardKey(parseBoardKey("payments@Option-A"))).toBe(
		boardKey(parseBoardKey("payments@option-a")),
	);
	// And the designation is a word somebody says, so its casing means nothing:
	// spelled either way it is the board itself, with no variant in its key.
	expect(boardKey(parseBoardKey("payments@Current"))).toBe("payments");
	expect(boardKey(makeIdentity({ board: "payments" }))).toBe("payments");
});
