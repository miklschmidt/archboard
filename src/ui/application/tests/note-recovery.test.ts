import { expect, test } from "bun:test";

import { NoteRecoveryMemory } from "@/ui/application/note-recovery";
import { emptyPaneStatus } from "@/ui/application/pane-records";
import type { BoardHold, NoteWrittenElsewhere, PaneStatus } from "@/ui/types";

const CONFLICT = {
	board: "Checkout",
	file: "Checkout.md",
	reason: "changed",
	outcomes: { reload: "", overwrite: "", saveAs: "" },
	message: "",
} as const;

/**
 * A hold that began at one moment.
 * @param since When it began.
 * @returns The hold.
 */
function holdSince(since: string): BoardHold {
	return {
		board: "Checkout",
		since,
		writes: 1,
		fromScreen: false,
		conflict: CONFLICT,
		message: "",
	};
}

/**
 * A write elsewhere at one moment.
 * @param writtenAt When the note was written.
 * @returns The state.
 */
function writeAt(writtenAt: string): NoteWrittenElsewhere {
	return {
		board: "Checkout",
		file: "Checkout.md",
		reason: "changed",
		writtenAt,
		versionMove: "unchanged",
		version: null,
		ourVersion: null,
		message: "",
	};
}

/**
 * Pane A's status with the given note states.
 * @param states The hold and the write elsewhere.
 * @returns The status.
 */
function status(states: Partial<Pick<PaneStatus, "hold" | "writtenElsewhere">>): PaneStatus {
	return { ...emptyPaneStatus("A"), clientId: "client-a", ...states };
}

test("a hold begins once per marker, ends when it clears, and waits for its dialog once", () => {
	const memory = new NoteRecoveryMemory();
	expect(memory.observe(status({}))).toEqual([]);
	expect(memory.pending()).toBeNull();
	const held = status({ hold: holdSince("t1") });
	expect(memory.observe(held)).toEqual(["hold-began"]);
	expect(
		memory.observe(status({ hold: holdSince("t1"), writtenElsewhere: writeAt("w1") })),
	).toEqual(["elsewhere-began"]);
	expect(memory.pending()).toMatchObject({ paneId: "A", kind: "hold" });
	memory.shown("A", "hold", "t1");
	// The hold outranks the write elsewhere on the same pane while it stands.
	expect(memory.pending()).toBeNull();
	expect(memory.observe(status({ writtenElsewhere: writeAt("w1") }))).toEqual(["hold-ended"]);
	expect(memory.pending()).toMatchObject({ paneId: "A", kind: "elsewhere" });
	memory.shown("A", "elsewhere", "w1");
	expect(memory.pending()).toBeNull();
	expect(memory.observe(status({ writtenElsewhere: writeAt("w2") }))).toEqual(["elsewhere-began"]);
	expect(memory.pending()).toMatchObject({ kind: "elsewhere" });
	expect(memory.observe(status({}))).toEqual(["elsewhere-ended"]);
	expect(memory.pending()).toBeNull();
	// A hold that returns with the same marker after ending is shown again.
	expect(memory.observe(held)).toEqual(["hold-began"]);
	expect(memory.pending()).toMatchObject({ kind: "hold" });
	memory.forget("A");
	expect(memory.pending()).toBeNull();
});
