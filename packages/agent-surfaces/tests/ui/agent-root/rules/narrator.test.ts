// Starting voice for a pane (narrator.ts).
//
// What these catch: a start that speaks for the pane that was active when the control was pressed
// and not for the pane it was pressed in, one that starts twice, and one that starts while a
// session runs. The shell makes the pane active, and the voice moves to it, a render apart, so the
// order of those moves is the thing under test.

import { expect, test } from "bun:test";

import { createNarrator, type Narrator, type PaneFocus } from "#ui/agent-root/rules/narrator.ts";

/** Where the agent is while it is quiet: pane a has focus and the voice, and voice is off. */
const QUIET: PaneFocus = { active: "a", followed: "a", idle: true };

/**
 * A narrator over the agent's focus, and what it started.
 * @param focus Where the agent is to begin with.
 * @returns The narrator and the walkthroughs it started voice for.
 */
function mountNarrator(focus: PaneFocus): {
	readonly narrator: Narrator<string>;
	readonly talks: string[];
} {
	const talks: string[] = [];
	const narrator = createNarrator<string>((walkthrough) => {
		talks.push(walkthrough);
	});
	narrator.sync(focus);
	return { narrator, talks };
}

test("a start asked for in the active pane is made at once when voice follows it", () => {
	const agent = mountNarrator(QUIET);
	agent.narrator.start("a", "tour");
	expect(agent.talks).toEqual(["tour"]);
});

test("a start asked for just after focus moves waits for voice to follow", () => {
	const agent = mountNarrator({ ...QUIET, active: "b" });
	agent.narrator.start("b", "tour");
	expect(agent.talks).toEqual([]);

	agent.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(agent.talks).toEqual(["tour"]);
});

test("one asked for in the other pane is made once that pane is active and the voice follows it, and once", () => {
	const agent = mountNarrator(QUIET);
	agent.narrator.start("b", "tour");
	expect(agent.talks).toEqual([]);

	// The pane is active and the voice has not moved to it: it would start for the wrong pane.
	agent.narrator.sync({ ...QUIET, active: "b" });
	expect(agent.talks).toEqual([]);

	agent.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(agent.talks).toEqual(["tour"]);

	agent.narrator.sync(QUIET);
	agent.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(agent.talks).toEqual(["tour"]);
});

test("one whose pane the person left before the voice followed is never made later", () => {
	const agent = mountNarrator(QUIET);
	agent.narrator.start("b", "tour");
	agent.narrator.sync({ ...QUIET, active: "b" });
	agent.narrator.sync(QUIET);
	agent.narrator.sync({ ...QUIET, active: "b", followed: "b" });
	expect(agent.talks).toEqual([]);
});

test("one that voice overtook is dropped, and one for a pane with no voice to follow is made, to say why it cannot", () => {
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
	const agent = mountNarrator({ ...QUIET, idle: false });
	agent.narrator.start("a", "tour");
	agent.narrator.start("b", "tour");
	agent.narrator.sync({ ...QUIET, idle: false, active: "b", followed: "b" });
	expect(agent.talks).toEqual([]);
});
