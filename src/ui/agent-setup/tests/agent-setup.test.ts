import { expect, test } from "bun:test";

import { createAgentSetup, type AgentSetupPorts, type AuthTab } from "@/ui/agent-setup";
import type { WorkbenchComposerSubmissionResult } from "@/ui/workbench-composer";
import {
	STAGES,
	ids,
	movableTransport,
	type MovableTransport,
} from "@/ui/agent-setup/tests/support";

/** What the setup asked its ports for, in order. */
type Call = "signIn" | "create" | "voice" | `submit:${string}` | `cancel:${string}`;

/**
 * Ports over a movable transport that record every call and answer as told.
 * @param transport The transport.
 * @param answers How the ports answer.
 * @param answers.create How a create settles.
 * @param answers.submit How a delivery settles.
 * @returns The ports and the calls.
 */
function portsOver(
	transport: MovableTransport,
	answers: {
		create?: () => ReturnType<AgentSetupPorts["createConversation"]>;
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
				return ok;
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
	setup.send("Later");
	setup.cancelSignIn();
	expect(calls).toEqual([`cancel:${ids.loginId}`]);
	expect(setup.snapshot().held.map((message) => message.state)).toEqual(["failed"]);
});
