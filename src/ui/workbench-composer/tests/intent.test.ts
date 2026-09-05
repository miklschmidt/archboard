import { describe, expect, test } from "bun:test";

import {
	MAX_PROMPT_BYTES,
	planComposerInterrupt,
	planComposerSubmit,
	readComposerLink,
	readComposerTurn,
	type WorkbenchComposerPlan,
} from "@/ui/workbench-composer";
import {
	OTHER_THREAD,
	OTHER_TURN,
	THREAD,
	TURN,
	connected,
	executableLink,
	inspectOnlyLink,
	notThreadCapable,
	reconnecting,
	snapshot,
	timeline,
	unboundLink,
} from "@/ui/workbench-composer/tests/model";

/**
 * The refusal code of a plan.
 * @param plan The plan.
 * @returns The code, or the action when the plan dispatches.
 */
function refusalCode(plan: WorkbenchComposerPlan): string {
	return plan.kind === "refuse" ? plan.refusal.code : plan.action;
}

describe("the authoritative in-progress turn read", () => {
	test("a workhorse with no turns is idle", () => {
		expect(readComposerTurn(snapshot({ timeline: timeline() }))).toEqual({ kind: "idle" });
	});

	test("a workhorse with no published timeline is idle", () => {
		expect(
			readComposerTurn(snapshot({ timeline: null, threadLink: inspectOnlyLink("Read only.") })),
		).toEqual({ kind: "idle" });
	});

	test("only an inProgress turn is active; completed, failed and interrupted turns are not", () => {
		for (const status of ["completed", "failed", "interrupted"] as const) {
			expect(readComposerTurn(snapshot({ timeline: timeline([[TURN, status]]) }))).toEqual({
				kind: "idle",
			});
		}
		expect(readComposerTurn(snapshot({ timeline: timeline([[TURN, "inProgress"]]) }))).toEqual({
			kind: "active",
			turnId: TURN,
		});
	});

	test("the one in-progress turn is found among finished turns", () => {
		const value = snapshot({
			timeline: timeline([
				[TURN, "completed"],
				[OTHER_TURN, "inProgress"],
			]),
		});
		expect(readComposerTurn(value)).toEqual({ kind: "active", turnId: OTHER_TURN });
	});

	test("more than one in-progress turn is ambiguous, never a steer target", () => {
		const value = snapshot({
			timeline: timeline([
				[TURN, "inProgress"],
				[OTHER_TURN, "inProgress"],
			]),
		});
		expect(readComposerTurn(value)).toEqual({ kind: "ambiguous", count: 2 });
	});
});

describe("the link the composer may target", () => {
	test("a connected thread-capable executable link is executable", () => {
		expect(readComposerLink(connected())).toEqual({
			kind: "executable",
			threadId: THREAD,
			turn: { kind: "idle" },
		});
	});

	test("an unbound pane reads as unbound, not as an inspect-only history", () => {
		expect(
			readComposerLink(connected(snapshot({ threadLink: unboundLink(), timeline: null }))),
		).toEqual({ kind: "unbound", reason: "This pane has no Codex workhorse yet." });
		expect(
			readComposerLink(
				connected(snapshot({ threadLink: unboundLink("Sign in first."), timeline: null })),
			),
		).toEqual({ kind: "unbound", reason: "Sign in first." });
	});

	test("an inspect-only link keeps the host's own reason", () => {
		const value = connected(
			snapshot({ threadLink: inspectOnlyLink("A prior child owned this thread.") }),
		);
		expect(readComposerLink(value)).toEqual({
			kind: "inspect_only",
			reason: "A prior child owned this thread.",
		});
	});

	test("a reconnecting workbench is unavailable with the connection's reason", () => {
		expect(readComposerLink(reconnecting("The socket dropped."))).toEqual({
			kind: "unavailable",
			reason: "The socket dropped.",
		});
	});

	test("a connected workbench that is not thread capable is unavailable", () => {
		expect(readComposerLink(notThreadCapable())).toEqual({
			kind: "unavailable",
			reason: "Codex is signed out; the workhorse cannot accept direct input.",
		});
	});
});

describe("the literal turn bodies", () => {
	test("an idle submit is exactly the turn/start body", () => {
		expect(planComposerSubmit(connected(), "Draw the module graph.")).toEqual({
			kind: "dispatch",
			action: "start",
			draft: { command: "start", threadId: THREAD, prompt: "Draw the module graph." },
		});
	});

	test("a submit during an active turn is exactly the turn/steer body with that turn id", () => {
		const value = connected(snapshot({ timeline: timeline([[TURN, "inProgress"]]) }));
		expect(planComposerSubmit(value, "Also rename the node.")).toEqual({
			kind: "dispatch",
			action: "steer",
			draft: {
				command: "steer",
				threadId: THREAD,
				turnId: TURN,
				prompt: "Also rename the node.",
			},
		});
	});

	test("an explicit send while a turn runs is still the turn/start body", () => {
		const value = connected(snapshot({ timeline: timeline([[TURN, "inProgress"]]) }));
		expect(planComposerSubmit(value, "Start over.", "send")).toMatchObject({
			action: "start",
			draft: { command: "start", threadId: THREAD },
		});
	});

	test("an explicit steer with no running turn is refused rather than started", () => {
		expect(refusalCode(planComposerSubmit(connected(), "Steer.", "steer"))).toBe("no_active_turn");
	});

	test("an explicit queue is the queueAdd body, which the transport anchors to the captured intent", () => {
		expect(planComposerSubmit(connected(), "Later.", "queue")).toEqual({
			kind: "dispatch",
			action: "queue",
			draft: { command: "queueAdd", prompt: "Later." },
		});
	});

	test("interrupt is exactly the turn/interrupt body for the captured turn", () => {
		const value = connected(snapshot({ timeline: timeline([[TURN, "inProgress"]]) }));
		expect(planComposerInterrupt(value, TURN)).toEqual({
			kind: "dispatch",
			action: "interrupt",
			draft: { command: "interrupt", threadId: THREAD, turnId: TURN },
		});
	});

	test("the body's thread id is the captured link's, never the timeline's", () => {
		const value = connected(
			snapshot({
				threadLink: executableLink(OTHER_THREAD),
				timeline: timeline([[TURN, "inProgress"]], OTHER_THREAD),
			}),
		);
		expect(planComposerSubmit(value, "Steer this one.")).toMatchObject({
			action: "steer",
			draft: { threadId: OTHER_THREAD },
		});
	});
});

describe("what the composer refuses before anything is sent", () => {
	test("a submit with no executable link is refused with the link's reason", () => {
		expect(planComposerSubmit(reconnecting("Codex is reconnecting."), "Hello.")).toEqual({
			kind: "refuse",
			refusal: {
				code: "unavailable",
				message: "Codex is reconnecting.",
				recovery: "Wait for Codex to become thread-capable, then send the message again.",
			},
		});
	});

	test("a submit against an unbound pane is refused as unbound, with its own next action", () => {
		const plan = planComposerSubmit(
			connected(snapshot({ threadLink: unboundLink(), timeline: null })),
			"Hello.",
		);
		expect(plan).toMatchObject({
			refusal: {
				code: "unbound",
				recovery: "Create or attach a Codex workhorse for this pane, then send a message.",
			},
		});
	});

	test("a submit against an inspect-only link is refused as inspect_only", () => {
		const value = connected(snapshot({ threadLink: inspectOnlyLink("Inspect only.") }));
		expect(refusalCode(planComposerSubmit(value, "Hello."))).toBe("inspect_only");
	});

	test("blank and whitespace-only prompts are refused as empty", () => {
		for (const text of ["", "   ", "\n\t "]) {
			expect(refusalCode(planComposerSubmit(connected(), text))).toBe("empty_prompt");
		}
	});

	test("a prompt beyond the contract's UTF-8 bound is refused, and the bound itself is accepted", () => {
		const atBound = "a".repeat(MAX_PROMPT_BYTES);
		expect(planComposerSubmit(connected(), atBound).kind).toBe("dispatch");
		expect(refusalCode(planComposerSubmit(connected(), `${atBound}a`))).toBe("prompt_too_long");
		// Multi-byte text is measured in bytes, not characters.
		const multibyte = "é".repeat(MAX_PROMPT_BYTES / 2 + 1);
		expect(refusalCode(planComposerSubmit(connected(), multibyte))).toBe("prompt_too_long");
	});

	test("a prompt carrying NUL is refused rather than sent for the host to reject", () => {
		expect(refusalCode(planComposerSubmit(connected(), "before\0after"))).toBe("prompt_invalid");
	});

	test("two in-progress turns refuse a submit rather than guess a steer target", () => {
		const value = connected(
			snapshot({
				timeline: timeline([
					[TURN, "inProgress"],
					[OTHER_TURN, "inProgress"],
				]),
			}),
		);
		expect(refusalCode(planComposerSubmit(value, "Which one?"))).toBe("ambiguous_turn");
	});

	test("interrupting an idle workhorse is refused", () => {
		expect(refusalCode(planComposerInterrupt(connected(), TURN))).toBe("no_active_turn");
	});

	test("interrupting a turn that was replaced is refused, never retargeted", () => {
		const value = connected(snapshot({ timeline: timeline([[OTHER_TURN, "inProgress"]]) }));
		expect(refusalCode(planComposerInterrupt(value, TURN))).toBe("turn_changed");
	});

	test("interrupting while two turns run is refused as ambiguous", () => {
		const value = connected(
			snapshot({
				timeline: timeline([
					[TURN, "inProgress"],
					[OTHER_TURN, "inProgress"],
				]),
			}),
		);
		expect(refusalCode(planComposerInterrupt(value, TURN))).toBe("ambiguous_turn");
	});

	test("interrupting after the link went inspect-only is refused", () => {
		const value = connected(
			snapshot({ threadLink: inspectOnlyLink("Inspect only."), timeline: null }),
		);
		expect(refusalCode(planComposerInterrupt(value, TURN))).toBe("inspect_only");
	});
});
