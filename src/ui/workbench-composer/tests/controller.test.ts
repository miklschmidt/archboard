import { describe, expect, test } from "bun:test";

import { BrowserWorkbenchTransportError } from "../../workbench-transport/index.js";
import { createWorkbenchComposerController } from "../index.js";
import {
	commandResult,
	commandTarget,
	connected,
	executableLink,
	fakeComposerTransport,
	OTHER_THREAD,
	OTHER_TURN,
	snapshot,
	THREAD,
	timeline,
	TURN,
} from "./model.js";

const RUNNING = connected(snapshot({ timeline: timeline([[TURN, "inProgress"]]) }));

const unknownOutcome = (): ReturnType<typeof commandResult> =>
	commandResult({ outcome: "outcome_unknown", code: null });
const notReady = (): ReturnType<typeof commandResult> =>
	commandResult({ outcome: "not_delivered", code: "not_ready", message: null });

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
	let release: (() => void) | null = null;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return {
		promise,
		resolve: () => {
			release?.();
		},
	};
}

describe("what the composer sends, and what it names", () => {
	test("a start command carries the target captured at activation", async () => {
		const transport = fakeComposerTransport();
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Draw the module graph." });
		expect(transport.sent).toHaveLength(1);
		expect(transport.sent[0]?.draft).toEqual({
			command: "start",
			threadId: THREAD,
			prompt: "Draw the module graph.",
		});
		expect(transport.sent[0]?.target).toEqual(commandTarget());
		expect(result).toEqual({ outcome: "delivered", turnId: TURN });
	});

	test("a steer command carries the captured target and the authoritative turn", async () => {
		const transport = fakeComposerTransport({ state: RUNNING });
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Also rename the node." });
		expect(transport.sent[0]?.draft).toEqual({
			command: "steer",
			threadId: THREAD,
			turnId: TURN,
			prompt: "Also rename the node.",
		});
		expect(transport.sent[0]?.target).toEqual(commandTarget());
		expect(result).toEqual({ outcome: "delivered", turnId: TURN });
	});

	test("an interrupt command carries the captured target and its captured turn", async () => {
		const transport = fakeComposerTransport({ state: RUNNING });
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.interrupt(TURN);
		expect(transport.sent[0]?.draft).toEqual({
			command: "interrupt",
			threadId: THREAD,
			turnId: TURN,
		});
		expect(transport.sent[0]?.target).toEqual(commandTarget());
		expect(result.outcome).toBe("delivered");
	});

	test("a lease this browser cannot capture refuses before anything leaves", async () => {
		const transport = fakeComposerTransport({ target: null });
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Hello." });
		expect(transport.sent).toHaveLength(0);
		expect(result).toEqual({
			outcome: "not_delivered",
			reason: "This browser does not hold the workbench command lease.",
		});
		expect(controller.getState().retained).toBeNull();
	});

	test("a refusal the composer makes itself sends nothing", async () => {
		const transport = fakeComposerTransport();
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "   " });
		expect(transport.sent).toHaveLength(0);
		expect(result).toEqual({
			outcome: "not_delivered",
			reason: "The workhorse accepts a non-empty message only.",
		});
		expect(controller.getState().status.state).toBe("refused");
	});
});

describe("the authoritative turn a delivered command may claim", () => {
	test("a start claims the in-progress turn from the host's own answer", async () => {
		const transport = fakeComposerTransport({
			command: async () =>
				commandResult({ snapshot: snapshot({ timeline: timeline([[OTHER_TURN, "inProgress"]]) }) }),
		});
		const controller = createWorkbenchComposerController({ transport });
		expect(await controller.submit({ text: "Go." })).toEqual({
			outcome: "delivered",
			turnId: OTHER_TURN,
		});
	});

	test("a start the host answers with no in-progress turn is an unknown outcome, not a claim", async () => {
		const transport = fakeComposerTransport({
			command: async () =>
				commandResult({ snapshot: snapshot({ timeline: timeline([[TURN, "completed"]]) }) }),
		});
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Go." });
		expect(result).toEqual({
			outcome: "outcome_unknown",
			reason: "Codex reported delivery, but published no single authoritative in-progress turn.",
		});
	});

	test("the composer keeps no message list of its own", () => {
		const controller = createWorkbenchComposerController({
			transport: fakeComposerTransport(),
		});
		expect(Object.keys(controller.getState()).toSorted()).toEqual([
			"pending",
			"retained",
			"settled",
			"status",
		]);
	});
});

describe("the pending command lease", () => {
	test("a command in flight is published as pending and blocks a second submit", async () => {
		const gate = deferred();
		const transport = fakeComposerTransport({
			command: async () => {
				await gate.promise;
				return commandResult();
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		const first = controller.submit({ text: "First." });
		await Promise.resolve();
		expect(controller.getState().pending).toBe("start");
		expect(controller.getState().status.state).toBe("pending");
		const duplicate = await controller.submit({ text: "Second." });
		expect(transport.sent).toHaveLength(1);
		expect(duplicate).toEqual({
			outcome: "not_delivered",
			reason: "Another workbench command is already in flight from this composer.",
		});
		gate.resolve();
		expect(await first).toEqual({ outcome: "delivered", turnId: TURN });
		expect(controller.getState().pending).toBeNull();
	});

	test("a command in flight blocks a duplicate interrupt", async () => {
		const gate = deferred();
		const transport = fakeComposerTransport({
			state: RUNNING,
			command: async () => {
				await gate.promise;
				return commandResult();
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		const first = controller.interrupt(TURN);
		await Promise.resolve();
		const duplicate = await controller.interrupt(TURN);
		expect(transport.sent).toHaveLength(1);
		expect(duplicate.outcome).toBe("not_delivered");
		gate.resolve();
		await first;
		expect(transport.sent).toHaveLength(1);
	});

	test("the next command is accepted once the lease is free", async () => {
		const transport = fakeComposerTransport();
		const controller = createWorkbenchComposerController({ transport });
		await controller.submit({ text: "First." });
		await controller.submit({ text: "Second." });
		expect(transport.sent).toHaveLength(2);
		expect(controller.getState().settled).toBe(2);
	});
});

describe("the draft policy for each settled outcome", () => {
	test("delivered clears the draft", async () => {
		const controller = createWorkbenchComposerController({
			transport: fakeComposerTransport(),
		});
		await controller.submit({ text: "Go." });
		expect(controller.getState().retained).toBeNull();
		expect(controller.getState().status.state).toBe("delivered");
	});

	test("not_delivered keeps the draft in the live composer and retains no copy", async () => {
		const transport = fakeComposerTransport({
			command: async () =>
				commandResult({ outcome: "not_delivered", code: "not_ready", message: null }),
		});
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Go." });
		expect(result).toEqual({
			outcome: "not_delivered",
			reason: "The workbench cannot send workhorse commands in its current state.",
		});
		expect(controller.getState().retained).toBeNull();
		expect(controller.getState().status.recovery).toBe(
			"The draft was kept in the composer. Correct the problem and send it again.",
		);
	});

	test("outcome_unknown retains an inert copy naming its own thread", async () => {
		const transport = fakeComposerTransport({
			command: async () => {
				throw new BrowserWorkbenchTransportError("response_lost", "lost", {
					outcome: "outcome_unknown",
				});
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Rename the node." });
		expect(result.outcome).toBe("outcome_unknown");
		expect(controller.getState().retained).toEqual({
			text: "Rename the node.",
			threadId: THREAD,
			reason: "The host never answered, so the command's outcome is unknown.",
		});
	});

	test("an interrupt never retains a draft copy", async () => {
		const transport = fakeComposerTransport({
			state: RUNNING,
			command: async () => {
				throw new BrowserWorkbenchTransportError("response_lost", "lost", {
					outcome: "outcome_unknown",
				});
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		expect((await controller.interrupt(TURN)).outcome).toBe("outcome_unknown");
		expect(controller.getState().retained).toBeNull();
	});

	test("the retained copy is dismissable and nothing resends it", async () => {
		const transport = fakeComposerTransport({
			command: async () => commandResult({ outcome: "outcome_unknown", code: null }),
		});
		const controller = createWorkbenchComposerController({ transport });
		await controller.submit({ text: "Rename the node." });
		expect(controller.getState().retained).not.toBeNull();
		controller.dismissRetainedDraft();
		expect(controller.getState().retained).toBeNull();
		expect(transport.sent).toHaveLength(1);
	});
});

describe("refusals, disconnects, and late results", () => {
	test("the transport's link_changed refusal is reported in the composer's words", async () => {
		const transport = fakeComposerTransport({
			command: async () => {
				throw new BrowserWorkbenchTransportError("link_changed", "moved");
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Go." });
		expect(result).toEqual({
			outcome: "not_delivered",
			reason: "The pane moved to another thread link after this message was composed.",
		});
	});

	test("a disconnect before the command is sent is not delivered", async () => {
		const transport = fakeComposerTransport({
			command: async () => {
				throw new BrowserWorkbenchTransportError("socket_unavailable", "gone");
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		expect(await controller.submit({ text: "Go." })).toEqual({
			outcome: "not_delivered",
			reason: "The workbench lost its connection before the command was sent.",
		});
	});

	test("a delivered result that lands after the pane relinked is not applied here", async () => {
		const transport = fakeComposerTransport({
			command: async () => {
				transport.setState(
					connected(
						snapshot({
							threadLink: executableLink(OTHER_THREAD),
							timeline: timeline([[TURN, "inProgress"]], OTHER_THREAD),
						}),
					),
				);
				return commandResult();
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Rename the node." });
		expect(result).toEqual({
			outcome: "outcome_unknown",
			reason:
				"The pane moved to another thread link before the host answered, so this result is not applied here.",
		});
		expect(controller.getState().retained?.threadId).toBe(THREAD);
	});

	test("a result that lands after the workbench disconnected is not applied here", async () => {
		const transport = fakeComposerTransport({
			command: async () => {
				transport.setState({
					kind: "connection",
					state: "stopped",
					connection: "stopped",
					snapshot: null,
					sequence: null,
					reason: "The Codex child exited.",
				});
				return commandResult();
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		expect((await controller.submit({ text: "Go." })).outcome).toBe("outcome_unknown");
	});

	test("every settled command advances the focus counter exactly once", async () => {
		const transport = fakeComposerTransport({ state: RUNNING });
		const controller = createWorkbenchComposerController({ transport });
		await controller.submit({ text: "One." });
		await controller.interrupt(TURN);
		expect(controller.getState().settled).toBe(2);
	});

	test("subscribers see each publication and can unsubscribe", async () => {
		const transport = fakeComposerTransport();
		const controller = createWorkbenchComposerController({ transport });
		let seen = 0;
		const unsubscribe = controller.subscribe(() => {
			seen += 1;
		});
		await controller.submit({ text: "Go." });
		expect(seen).toBeGreaterThan(0);
		const afterSubscribe = seen;
		unsubscribe();
		await controller.submit({ text: "Again." });
		expect(seen).toBe(afterSubscribe);
	});
});

describe("remediations from the fixed-range review", () => {
	test("a definitive not_delivered is not relabelled unknown by a relink in flight", async () => {
		const transport = fakeComposerTransport({
			command: async () => {
				transport.setState(
					connected(
						snapshot({
							threadLink: executableLink(OTHER_THREAD),
							timeline: timeline([], OTHER_THREAD),
						}),
					),
				);
				throw new BrowserWorkbenchTransportError("link_changed", "moved");
			},
		});
		const controller = createWorkbenchComposerController({ transport });
		const result = await controller.submit({ text: "Rename the node." });
		// The host said nothing was delivered, so the text stays safe to resend
		// rather than moving into the inert region.
		expect(result).toEqual({
			outcome: "not_delivered",
			reason: "The pane moved to another thread link after this message was composed.",
		});
		expect(controller.getState().retained).toBeNull();
	});

	test("the host's in-progress guard on a start is a definitive refusal with a next action", async () => {
		// What the gateway sends when the canvas start action refuses a start
		// because its authoritative thread read found a running turn.
		const transport = fakeComposerTransport({
			command: async () =>
				commandResult({
					outcome: "not_delivered",
					code: "invalid_command",
					message:
						"Starting a turn requires an idle workhorse; steer the in-progress turn instead.",
				}),
		});
		const controller = createWorkbenchComposerController({ transport });
		expect(await controller.submit({ text: "Go." })).toEqual({
			outcome: "not_delivered",
			reason: "Starting a turn requires an idle workhorse; steer the in-progress turn instead.",
		});
		expect(controller.getState().retained).toBeNull();
	});

	test("a refusal the host sent no message for falls back to the composer's own sentence", async () => {
		const transport = fakeComposerTransport({
			command: async () =>
				commandResult({ outcome: "not_delivered", code: "invalid_command", message: null }),
		});
		const controller = createWorkbenchComposerController({ transport });
		expect((await controller.submit({ text: "Go." })).outcome).toBe("not_delivered");
		expect(controller.getState().status.message).toBe(
			"The host refused this command for the workhorse's current state. Read the timeline, then send again.",
		);
	});

	test("a retained copy stands through a later command and goes on a delivered resend", async () => {
		let next = unknownOutcome;
		const transport = fakeComposerTransport({ command: async () => next() });
		const controller = createWorkbenchComposerController({ transport });
		await controller.submit({ text: "Rename the node." });
		expect(controller.getState().retained?.text).toBe("Rename the node.");
		// A later command answers a different question, so the standing copy stays.
		next = notReady;
		await controller.submit({ text: "Something else." });
		expect(controller.getState().retained?.text).toBe("Rename the node.");
		// Delivering the same text finally answers it.
		next = commandResult;
		await controller.submit({ text: "Rename the node." });
		expect(controller.getState().retained).toBeNull();
	});

	test("a refusal leaves a standing retained copy alone", async () => {
		const transport = fakeComposerTransport({
			command: async () => commandResult({ outcome: "outcome_unknown", code: null }),
		});
		const controller = createWorkbenchComposerController({ transport });
		await controller.submit({ text: "Rename the node." });
		await controller.submit({ text: "  " });
		expect(controller.getState().status.state).toBe("refused");
		expect(controller.getState().retained?.text).toBe("Rename the node.");
	});
});
