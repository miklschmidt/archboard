// Starting a narration for a pane (narrator.ts).
//
// What these catch: a narration that starts voice for the pane that was active
// when the control was pressed and not for the pane it was pressed in, one that
// starts twice, and one that starts while a session runs. The shell makes the
// pane active, and moves the voice to it, a render apart, so the order of those
// moves is the thing under test.

import { expect, test } from "bun:test";

import {
	createNarrator,
	offerNarration,
	type Narrator,
	type ShellState,
} from "#ui/rules/application/narrator.ts";

/** Where the shell is while it is quiet: pane a has focus and the voice, and voice is off. */
const QUIET: ShellState = { active: "a", followed: "a", idle: true };

/**
 * A narrator over a shell, and what it did to it.
 * @param state Where the shell is to begin with.
 * @returns The narrator, the walkthroughs it started voice for, and the panes it made active.
 */
function mountNarrator(state: ShellState): {
	readonly narrator: Narrator;
	readonly talks: string[];
	readonly selected: string[];
} {
	const talks: string[] = [];
	const selected: string[] = [];
	const narrator = createNarrator({
		/**
		 * Record the walkthrough voice was started for.
		 * @param walkthrough The walkthrough's id.
		 */
		talk: (walkthrough) => {
			talks.push(walkthrough);
		},
		/**
		 * Record the pane made active.
		 * @param paneId The pane.
		 */
		select: (paneId) => {
			selected.push(paneId);
		},
	});
	narrator.sync(state);
	return { narrator, talks, selected };
}

test("a narration asked for in the active pane starts at once", () => {
	const shell = mountNarrator(QUIET);
	shell.narrator.start("a", "tour");
	expect(shell.talks).toEqual(["tour"]);
	expect(shell.selected).toEqual([]);
});

test("one asked for in the other pane makes that pane active and starts once the voice follows it, and once", () => {
	const shell = mountNarrator(QUIET);
	shell.narrator.start("b", "tour");
	expect(shell.selected).toEqual(["b"]);
	expect(shell.talks).toEqual([]);

	// The pane is active and the voice has not moved to it: it would start for the wrong pane.
	shell.narrator.sync({ ...QUIET, active: "b" });
	expect(shell.talks).toEqual([]);

	shell.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(shell.talks).toEqual(["tour"]);

	shell.narrator.sync(QUIET);
	shell.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(shell.talks).toEqual(["tour"]);
});

test("one whose pane the person left before the voice followed never starts later", () => {
	const shell = mountNarrator(QUIET);
	shell.narrator.start("b", "tour");
	shell.narrator.sync({ ...QUIET, active: "b" });
	shell.narrator.sync(QUIET);
	shell.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(shell.talks).toEqual([]);
});

test("one that voice overtook is dropped, and one for a pane with no voice to follow starts, to say why it cannot", () => {
	const overtaken = mountNarrator(QUIET);
	overtaken.narrator.start("b", "tour");
	overtaken.narrator.sync({ ...QUIET, active: "b", idle: false });
	overtaken.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(overtaken.talks).toEqual([]);

	const unconnected = mountNarrator(QUIET);
	unconnected.narrator.start("b", "tour");
	unconnected.narrator.sync({ ...QUIET, active: "b", followed: null });
	expect(unconnected.talks).toEqual(["tour"]);
});

test("nothing starts while voice runs", () => {
	const shell = mountNarrator({ ...QUIET, idle: false });
	shell.narrator.start("a", "tour");
	shell.narrator.start("b", "tour");
	expect(shell.talks).toEqual([]);
	expect(shell.selected).toEqual([]);
});

test("a pane is offered one narration, again each time it is asked for, that starts for that pane", () => {
	const shell = mountNarrator(QUIET);
	const offer = offerNarration(shell.narrator, null);
	expect(offer("b")).toBe(offer("b"));
	expect(offer("b")).not.toBe(offer("a"));

	offer("b").start("tour");
	expect(shell.selected).toEqual(["b"]);
});
