import { expect, test } from "bun:test";
import {
	normalizePaneKey,
	paneAddressKey,
	parsePaneKey,
	statedVariant,
} from "@archboard/model-contract";

// A variant used to be a word from a fixed vocabulary. It is now also how an
// address names one state of a legacy board, and that is a minted id: mixed
// case, and nothing may ever rename it (ADR 0023). What these prove is that an
// address hands back the variant somebody typed, whatever case it is in.

test("an address names the variant it was given, in the case it was given", () => {
	expect(parsePaneKey("payments@A8zpTnVI").variant).toBe("A8zpTnVI");
	expect(parsePaneKey("payments@A8zpTnVI").board).toBe("payments");
});

test("a lasting name with a space in it is addressable", () => {
	// A proposal is named by a person ("Queued ingest"), and that name is what a
	// model answers to. A slug rule here would make a named proposal impossible
	// to put in a pane, while `--variant "Queued ingest"` worked everywhere else.
	expect(parsePaneKey("payments@Queued ingest").variant).toBe("Queued ingest");
});

test("an address ends its model at the first mark, so a selector may hold one too", () => {
	// A model name may not contain "@", so the first one ends the name and
	// everything after it is the selector. A proposal somebody called "Queue @
	// edge" is a name a branch command takes, so it has to be a name an address
	// takes as well.
	const named = parsePaneKey("payments@Queue @ edge");
	expect(named.board).toBe("payments");
	expect(named.variant).toBe("Queue @ edge");
	// And what no address may hold is still refused.
	expect(() => parsePaneKey("payments@  ")).toThrow();
});

test("a name a proposal may be given is a name an address may carry", () => {
	// A proposal is named by a person, and a person writes "Proposed: queued
	// ingest". A grammar that accepted the name and refused the address would
	// make a proposal nobody could open.
	for (const named of ["Proposed: queued ingest", "Option A [draft]", "Cache reads?", "A @ B"]) {
		expect(parsePaneKey(`payments@${named}`).variant).toBe(named);
		expect(paneAddressKey(parsePaneKey(`payments@${named}`))).toBe(`payments@${named}`);
	}
});

test("a variant from the old vocabulary is unaffected", () => {
	expect(parsePaneKey("payments@option-a").variant).toBe("option-a");
	expect(parsePaneKey("payments").variant).toBe("current");
});

test("the address keeps the casing a variant was typed in", () => {
	// What the model is matched by keeps what was typed, because a minted id is
	// mixed-case and a name is written as it was stated. One address a person
	// typed two ways is still one model for a lock or a lease (ADR 0010), and
	// that key is the address in its normalised form.
	expect(paneAddressKey(parsePaneKey("payments@Option-A"))).toBe("payments@Option-A");
	expect(normalizePaneKey(paneAddressKey(parsePaneKey("payments@Option-A")))).toBe(
		normalizePaneKey(paneAddressKey(parsePaneKey("payments@option-a"))),
	);
});

test("the designation is a word, so its casing means nothing", () => {
	// Spelled either way it is the model itself, with no variant in its address.
	expect(paneAddressKey(parsePaneKey("payments@Current"))).toBe("payments");
	expect(paneAddressKey(parsePaneKey("payments"))).toBe("payments");
	expect(statedVariant(parsePaneKey("payments@Current"))).toBeUndefined();
	expect(statedVariant(parsePaneKey("payments"))).toBeUndefined();
	expect(statedVariant(parsePaneKey("payments@Option-A"))).toBe("Option-A");
});
