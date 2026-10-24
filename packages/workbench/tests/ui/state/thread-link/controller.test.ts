import { describe, expect, test } from "bun:test";

import type { BrowserSnapshot } from "@archboard/agent-workbench/contract";
import { createThreadLinkController } from "#ui/state/thread-link/controller.ts";
import type {
	ThreadLinkActionSnapshot,
	ThreadLinkController,
} from "#ui/state/thread-link/contracts.ts";
import {
	capabilities,
	connected,
	epochA,
	epochB,
	executableLink,
	FakeTransport,
	FakeTransportError,
	inspectOnlyLink,
	loginA,
	capturing,
	snapshot,
	threadA,
} from "#tests/ui/support/thread-link/fixtures.ts";

/**
 * A controller over one double.
 * @param transport The double.
 * @returns The controller.
 */
function controllerFor(transport: FakeTransport): ThreadLinkController {
	return createThreadLinkController({ capturePane: capturing(transport) });
}

/**
 * The announcement of a settled action.
 * @param settled The snapshot.
 * @returns The announcement, or empty while idle.
 */
function announcementOf(settled: ThreadLinkActionSnapshot): string {
	return settled.state === "idle" ? "" : settled.announcement;
}

/**
 * A pending ChatGPT sign-in as the server publishes it.
 * @returns The snapshot.
 */
function pendingLoginSnapshot(): BrowserSnapshot {
	return snapshot({
		account: { kind: "account", state: "login_pending", loginId: loginA, variant: "chatgpt" },
		login: {
			kind: "login",
			state: "pending",
			loginId: loginA,
			variant: "chatgpt",
			authUrl: "https://example.test/login",
		},
	});
}

describe("thread-link action controller", () => {
	test("does not announce completed sign-in when ChatGPT only accepted the login start", async () => {
		const transport = new FakeTransport();
		transport.nextResult = transport.result({ snapshot: pendingLoginSnapshot() });
		const controller = controllerFor(transport);
		await controller.login({ type: "chatgpt" });
		const result = controller.snapshot();
		expect(result.state).toBe("succeeded");
		expect(announcementOf(result)).toContain("Complete the sign-in");
		expect(announcementOf(result)).not.toMatch(/completed|signed in/i);
	});

	const settlements: readonly {
		readonly account: BrowserSnapshot["account"];
		readonly state: string;
		readonly announcement: string;
	}[] = [
		{
			account: { kind: "account", state: "ready", accountType: "chatgpt" },
			state: "succeeded",
			announcement: "Signed in.",
		},
		{
			account: { kind: "account", state: "failed", reason: "Codex rejected the sign-in." },
			state: "failed",
			announcement: "Codex rejected the sign-in.",
		},
		{
			account: { kind: "account", state: "unknown", reason: "Account read has not completed." },
			state: "inspect_only",
			announcement: "Sign-in has not been confirmed. Check the account status before trying again.",
		},
	];

	for (const expected of settlements) {
		test(`reports authoritative ${expected.account.state} login settlement`, async () => {
			const transport = new FakeTransport();
			transport.nextResult = transport.result({
				snapshot: snapshot({ account: expected.account }),
			});
			const controller = controllerFor(transport);
			await controller.login({ type: "chatgpt" });
			expect(controller.snapshot()).toMatchObject({
				state: expected.state,
				announcement: expected.announcement,
			});
		});
	}

	test("every command carries the target captured when it was offered", async () => {
		const transport = new FakeTransport();
		const controller = controllerFor(transport);
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadA) }),
		});
		await controller.create();
		await controller.login({ type: "apiKey", apiKey: "key" });
		await controller.cancelLogin(loginA);
		await controller.logout();
		expect(transport.commands).toHaveLength(4);
		for (const entry of transport.commands) {
			expect(entry.target).toMatchObject({
				epoch: epochA,
				commandId: transport.result().commandId,
			});
		}
		expect(transport.commands.map((entry) => entry.draft.command)).toEqual([
			"threadLinkCreate",
			"accountLogin",
			"accountLoginCancel",
			"accountLogout",
		]);
	});

	test("a focus change to another epoch refuses instead of retargeting the command", async () => {
		const transport = new FakeTransport();
		transport.runBeforeCommand(() => {
			transport.epoch = epochB;
		});
		const controller = controllerFor(transport);
		const completion = await controller.create();
		expect(completion.state).toBe("applied");
		expect(transport.commands).toHaveLength(1);
		// The captured epoch went to the wire; the pane's new epoch never did.
		expect(transport.commands[0]?.target?.epoch).toBe(epochA);
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(announcementOf(settled)).toContain("changed since this command was captured");
		if (settled.state === "failed" && "childId" in settled.target) {
			expect(settled.target.epoch).toBe(epochA);
		}
	});

	test("a superseded action never overwrites the action that replaced it", async () => {
		const transport = new FakeTransport();
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadA) }),
		});
		const controller = controllerFor(transport);
		const held = Promise.withResolvers<void>();
		transport.gate = held.promise;
		const first = controller.create();
		transport.gate = null;
		const second = await controller.logout();
		held.resolve();
		const firstCompletion = await first;
		expect(firstCompletion.state).toBe("ignored");
		expect(second.state).toBe("applied");
		const settled = controller.snapshot();
		expect(settled.state === "idle" ? null : settled.action).toBe("logout");
	});

	test("a command that arrives before the pane is ready is refused without reaching the wire", async () => {
		const transport = new FakeTransport(connected(), capabilities({ supported: [] }));
		const controller = controllerFor(transport);
		await controller.create();
		expect(transport.commands).toEqual([]);
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(announcementOf(settled)).toContain("not ready for threadLinkCreate");
	});

	test("a pane with no command lease can start the explicit creation action", async () => {
		const transport = new FakeTransport();
		transport.leased = false;
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadA) }),
		});
		const controller = controllerFor(transport);
		await controller.create();
		expect(transport.commands).toHaveLength(1);
		expect(controller.snapshot().state).toBe("succeeded");
	});

	test("an ambiguous creation stays inspect-only rather than reporting a link", async () => {
		const transport = new FakeTransport();
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: inspectOnlyLink("unknown_provenance") }),
		});
		const controller = controllerFor(transport);
		await controller.create();
		const settled = controller.snapshot();
		expect(settled.state).toBe("inspect_only");
		expect(announcementOf(settled)).toContain("without a confirmed executable link");
	});

	test("an unknown outcome stays inspect-only and says not to retry blind", async () => {
		const transport = new FakeTransport();
		transport.nextResult = transport.result({
			outcome: "outcome_unknown",
			message: "The workbench lost the response.",
		});
		const controller = controllerFor(transport);
		await controller.create();
		const settled = controller.snapshot();
		expect(settled.state).toBe("inspect_only");
		expect(announcementOf(settled)).toContain("do not retry blind");
	});

	test("a lost response is inspect-only, not a failure", async () => {
		const transport = new FakeTransport();
		transport.nextError = new FakeTransportError(
			"response_lost",
			"The workbench response was lost.",
			"outcome_unknown",
		);
		const controller = controllerFor(transport);
		await controller.create();
		expect(controller.snapshot().state).toBe("inspect_only");
	});

	test("a refused command publishes the refusal message", async () => {
		const transport = new FakeTransport();
		transport.nextResult = transport.result({
			outcome: "not_delivered",
			code: "not_ready",
			message: "The workbench is not thread-capable.",
		});
		const controller = controllerFor(transport);
		await controller.create();
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(announcementOf(settled)).toBe("The workbench is not thread-capable.");
	});

	test("a create refused because its coordinator could not start publishes the coordinator's reason", async () => {
		const transport = new FakeTransport();
		const reason = "Coordinator model selection failed.";
		const base = snapshot();
		transport.nextResult = transport.result({
			outcome: "not_delivered",
			code: "command_failed",
			message: "The command was not delivered.",
			snapshot: { ...base, coordinator: { ...base.coordinator, state: "failed", reason } },
		});
		const controller = controllerFor(transport);
		await controller.create();
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(announcementOf(settled)).toBe(reason);
	});

	test("subscribers see the pending announcement before the settlement", async () => {
		const transport = new FakeTransport();
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadA) }),
		});
		const controller = controllerFor(transport);
		const seen: string[] = [];
		const stop = controller.subscribe(() => {
			seen.push(controller.snapshot().state);
		});
		await controller.create();
		stop();
		expect(seen).toEqual(["pending", "succeeded"]);
	});
});
