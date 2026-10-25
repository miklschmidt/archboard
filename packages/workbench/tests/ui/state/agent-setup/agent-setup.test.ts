import { expect, test } from "bun:test";

import {
	createAgentSetup,
	type AgentSetupPorts,
	type AuthTab,
} from "#ui/state/agent-setup/setup.ts";
import type { WorkbenchComposerSubmissionResult } from "@archboard/codex-realtime-voice/controllers";
import {
	STAGES,
	conversation,
	ids,
	movableTransport,
	type MovableTransport,
} from "#tests/ui/support/agent-setup/support.ts";

/** What the setup asked its ports for, in order. */
type Call = "signIn" | "create" | "voice" | `submit:${string}` | `cancel:${string}`;

/**
 * Ports over a movable transport that record every call and answer as told.
 * @param transport The transport.
 * @param answers How the ports answer.
 * @param answers.create How a create settles.
 * @param answers.signIn How a sign-in settles.
 * @param answers.submit How a delivery settles.
 * @returns The ports and the calls.
 */
function portsOver(
	transport: MovableTransport,
	answers: {
		create?: () => ReturnType<AgentSetupPorts["createConversation"]>;
		signIn?: () => ReturnType<AgentSetupPorts["signIn"]>;
		submit?: () => Promise<WorkbenchComposerSubmissionResult>;
	} = {},
): { ports: AgentSetupPorts; calls: Call[] } {
	const calls: Call[] = [];
	const ok = Promise.resolve({ ok: true } as const);
	return {
		calls,
		ports: {
			transport,
			/**
			 * Record a create and answer it.
			 * @returns How it settles.
			 */
			createConversation: () => {
				calls.push("create");
				return answers.create?.() ?? ok;
			},
			/**
			 * Record a sign-in.
			 * @returns How it settles.
			 */
			signIn: () => {
				calls.push("signIn");
				return answers.signIn?.() ?? ok;
			},
			/**
			 * Record a cancelled sign-in.
			 * @param loginId The sign-in.
			 * @returns How it settles.
			 */
			cancelSignIn: (loginId) => {
				calls.push(`cancel:${loginId}`);
				return ok;
			},
			/**
			 * Record a delivery and answer it.
			 * @param text The message.
			 * @param queue Whether it was queued.
			 * @returns How it settles.
			 */
			submit: (text, queue) => {
				calls.push(`submit:${queue ? "queue:" : ""}${text}`);
				return answers.submit?.() ?? Promise.resolve({ outcome: "delivered", turnId: ids.turnId });
			},
			/**
			 * Record a voice start.
			 * @returns Settles at once.
			 */
			startVoice: () => {
				calls.push("voice");
				return Promise.resolve();
			},
		},
	};
}

/**
 * A tab double that records where it was sent and whether it closed.
 * @returns The tab and what happened to it.
 */
function recordingTab(): { tab: AuthTab; log: string[] } {
	const log: string[] = [];
	return {
		log,
		tab: {
			/**
			 * Record the page the tab was sent to.
			 * @param url The page.
			 */
			navigate: (url) => {
				log.push(url);
			},
			/** Record that the tab closed. */
			close: () => {
				log.push("closed");
			},
		},
	};
}

/**
 * The held messages' states and reasons.
 * @param setup The setup.
 * @returns Each message's text, state and reason.
 */
function heldStates(setup: ReturnType<typeof createAgentSetup>): [string, string, string | null][] {
	return setup.snapshot().held.map((message) => [message.text, message.state, message.reason]);
}

/**
 * Let settled promises run their continuations.
 * @returns Settles after the microtask queue drains.
 */
function settle(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

test("a message sent while signed out signs in, waits for Codex, creates the conversation, then delivers", async () => {
	const transport = movableTransport(STAGES.signedOut);
	const { ports, calls } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	const opened: string[] = [];
	const tab: AuthTab = {
		/**
		 * Record the page the tab was sent to.
		 * @param url The page.
		 */
		navigate: (url) => {
			opened.push(url);
		},
		/** Record that the tab closed. */
		close: () => {
			opened.push("closed");
		},
	};

	setup.send("Explain the gateway", { tab });
	expect(calls).toEqual(["signIn"]);
	expect(setup.snapshot().step).toBe("sign_in");
	expect(setup.snapshot().held.map((message) => message.state)).toEqual(["waiting"]);

	transport.move(STAGES.signingIn);
	expect(opened).toEqual(["https://auth.example.test/login"]);
	transport.move(STAGES.starting);
	expect(setup.snapshot().step).toBe("start");
	transport.move(STAGES.ready);
	expect(calls).toEqual(["signIn", "create"]);
	expect(setup.snapshot().step).toBe("link");

	transport.move(STAGES.linked);
	await settle();
	expect(calls).toEqual(["signIn", "create", "submit:Explain the gateway"]);
	expect(setup.snapshot().held.map((message) => message.state)).toEqual(["delivered"]);

	transport.move(STAGES.answered("Explain the gateway"));
	expect(setup.snapshot().held).toEqual([]);
	expect(setup.snapshot().step).toBeNull();
});

test("with a conversation, a message is delivered at once and Talk starts voice at once", async () => {
	const transport = movableTransport(STAGES.linked);
	const { ports, calls } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Queue this", { queue: true });
	setup.talk();
	await settle();
	expect(calls).toEqual(["submit:queue:Queue this", "voice"]);
	expect(setup.snapshot().talk).toBe("idle");
});

test("a conversation that cannot be created fails the held message with the reason, and retry tries again", async () => {
	const transport = movableTransport(STAGES.ready);
	let refuse = true;
	const { ports, calls } = portsOver(transport, {
		/**
		 * Refuse the first create, accept the next.
		 * @returns How it settles.
		 */
		create: () =>
			Promise.resolve(refuse ? { ok: false, reason: "Codex refused the thread." } : { ok: true }),
	});
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Hello");
	await settle();
	const [failed] = setup.snapshot().held;
	expect(failed?.state).toBe("failed");
	expect(failed?.reason).toBe("Codex refused the thread.");
	refuse = false;
	setup.retry(failed?.id ?? "");
	await settle();
	transport.move(STAGES.linked);
	await settle();
	expect(calls).toEqual(["create", "create", "submit:Hello"]);
});

test("a message Codex refuses stays with its reason until the person discards it back into the composer", async () => {
	const transport = movableTransport(STAGES.linked);
	const { ports } = portsOver(transport, {
		/**
		 * Refuse the delivery.
		 * @returns How it settles.
		 */
		submit: () => Promise.resolve({ outcome: "not_delivered", reason: "Turn is busy." }),
	});
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Try this");
	await settle();
	const [held] = setup.snapshot().held;
	expect(held?.state).toBe("failed");
	expect(setup.discard(held?.id ?? "")).toBe("Try this");
	expect(setup.snapshot().held).toEqual([]);
});

test("while Codex cannot run, held work fails with its reason instead of waiting forever", () => {
	const transport = movableTransport(STAGES.stopped);
	const { ports, calls } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Anything");
	setup.talk();
	expect(calls).toEqual([]);
	expect(setup.snapshot().held.map((message) => [message.state, message.reason])).toEqual([
		["failed", "Codex exited."],
	]);
	expect(setup.snapshot().talk).toBe("idle");
});

test("cancelling a sign-in cancels it at Codex and fails what waited on it", () => {
	const transport = movableTransport(STAGES.signingIn);
	const { ports, calls } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Later");
	setup.cancelSignIn();
	expect(calls).toEqual([`cancel:${ids.loginId}`]);
	expect(setup.snapshot().held.map((message) => message.state)).toEqual(["failed"]);

	transport.move(STAGES.signedOut);
	expect(calls).toEqual([`cancel:${ids.loginId}`]);
	setup.send("Now");
	expect(calls).toEqual([`cancel:${ids.loginId}`, "signIn"]);
});

test("an explicit sign-in with nothing held points its tab at the provider's page", () => {
	const transport = movableTransport(STAGES.signedOut);
	const { ports, calls } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	const { tab, log } = recordingTab();
	setup.signIn({ type: "chatgpt" }, tab);
	transport.move(STAGES.signingInUnnamed);
	expect(log).toEqual([]);
	transport.move(STAGES.signingIn);
	expect(calls).toEqual(["signIn"]);
	expect(log).toEqual(["https://auth.example.test/login"]);
});

test("a gesture's tab closes when the account is ready before the provider's page was shown", () => {
	const transport = movableTransport(STAGES.signedOut);
	const { ports } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	const { tab, log } = recordingTab();
	setup.signIn({ type: "chatgpt" }, tab);
	transport.move(STAGES.signingInUnnamed);
	transport.move(STAGES.starting);
	expect(log).toEqual(["closed"]);
});

test("a sign-in that cannot start fails the held message and is asked again only by the next gesture", async () => {
	const transport = movableTransport(STAGES.signedOut);
	const { ports, calls } = portsOver(transport, {
		/**
		 * Refuse the sign-in.
		 * @returns How it settles.
		 */
		signIn: () => Promise.resolve({ ok: false, reason: "Codex refused the sign-in." }),
	});
	const setup = createAgentSetup(ports);
	setup.connect();
	const first = recordingTab();
	setup.send("Hello", { tab: first.tab });
	await settle();
	expect(heldStates(setup)).toEqual([["Hello", "failed", "Codex refused the sign-in."]]);
	expect(first.log).toEqual(["closed"]);

	transport.move(STAGES.signedOut);
	await settle();
	expect(calls).toEqual(["signIn"]);

	setup.talk();
	expect(calls).toEqual(["signIn", "signIn"]);
});

test("a sign-in Codex gives up on fails what waited with its reason, and the next gesture signs in again with its own tab", () => {
	const transport = movableTransport(STAGES.signedOut);
	const { ports, calls } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Hello");
	transport.move(STAGES.signingIn);
	transport.move(STAGES.signInFailed("The sign-in timed out."));
	expect(heldStates(setup)).toEqual([["Hello", "failed", "The sign-in timed out."]]);
	expect(setup.snapshot().phase).toEqual({ kind: "signed_out", failure: "The sign-in timed out." });
	expect(calls).toEqual(["signIn"]);

	const again = recordingTab();
	setup.send("Hello again", { tab: again.tab });
	expect(calls).toEqual(["signIn", "signIn"]);
	transport.move(STAGES.signingIn);
	expect(again.log).toEqual(["https://auth.example.test/login"]);
});

test("signed in with a coordinator an earlier create could not start, the next message creates again and fails with the refusal's reason", async () => {
	const transport = movableTransport(STAGES.coordinatorFailed("The coordinator model is unknown."));
	const { ports, calls } = portsOver(transport, {
		/**
		 * Refuse the create the way a coordinator that cannot start does.
		 * @returns How it settles.
		 */
		create: () => Promise.resolve({ ok: false, reason: "The coordinator model is unknown." }),
	});
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Anything");
	await settle();
	expect(calls).toEqual(["create"]);
	expect(heldStates(setup)).toEqual([["Anything", "failed", "The coordinator model is unknown."]]);
});

test("a message sent while Codex waits to start again waits for it, and is delivered once it is back", async () => {
	const transport = movableTransport(STAGES.restarting);
	const { ports, calls } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("Hold on");
	expect(heldStates(setup)).toEqual([["Hold on", "waiting", null]]);
	expect(setup.snapshot().step).toBe("start");
	transport.move(STAGES.linked);
	await settle();
	expect(calls).toEqual(["submit:Hold on"]);
});

test("a refused message holds back the ones sent after it until the person retries it", async () => {
	const transport = movableTransport(STAGES.linked);
	const answers: WorkbenchComposerSubmissionResult[] = [
		{ outcome: "not_delivered", reason: "Turn is busy." },
	];
	const { ports, calls } = portsOver(transport, {
		/**
		 * Refuse the first delivery, deliver the rest.
		 * @returns How it settles.
		 */
		submit: () => Promise.resolve(answers.shift() ?? { outcome: "delivered", turnId: ids.turnId }),
	});
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("First");
	setup.send("Second");
	await settle();
	expect(calls).toEqual(["submit:First"]);
	expect(heldStates(setup)).toEqual([
		["First", "failed", "Turn is busy."],
		["Second", "waiting", null],
	]);

	setup.retry(setup.snapshot().held[0]?.id ?? "");
	await settle();
	expect(calls).toEqual(["submit:First", "submit:First", "submit:Second"]);
});

test("a message whose delivery went unanswered is dropped once the conversation shows it arrived", async () => {
	const transport = movableTransport(conversation(["yes"]));
	const { ports } = portsOver(transport, {
		/**
		 * Lose the answer.
		 * @returns How it settles.
		 */
		submit: () => Promise.resolve({ outcome: "outcome_unknown", reason: "No answer." }),
	});
	const setup = createAgentSetup(ports);
	setup.connect();
	setup.send("yes");
	await settle();
	expect(heldStates(setup)).toEqual([["yes", "unknown", "No answer."]]);

	transport.move(conversation(["yes", "yes"]));
	expect(setup.snapshot().held).toEqual([]);
});

test("a reply streaming in changes nothing the setup says, so it keeps its snapshot and tells nobody", () => {
	const transport = movableTransport(conversation(["Explain the gateway"]));
	const { ports } = portsOver(transport);
	const setup = createAgentSetup(ports);
	setup.connect();
	const before = setup.snapshot();
	let told = 0;
	setup.subscribe(() => {
		told += 1;
	});
	transport.move(conversation(["Explain the gateway", "And the ledger"]));
	transport.move(conversation(["Explain the gateway", "And the ledger", "And the queue"]));
	expect(told).toBe(0);
	expect(setup.snapshot()).toBe(before);
});
