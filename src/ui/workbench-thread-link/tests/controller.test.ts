import { describe, expect, test } from "bun:test";

import type { BrowserSnapshot } from "@/shared/codex-browser-model";
import type { ThreadId } from "@/shared/codex-workbench-identity";
import { createThreadLinkController, projectThreadLinkSelection } from "@/ui/workbench-thread-link";
import type {
	ThreadLinkActionSnapshot,
	ThreadLinkController,
	ThreadLinkRecoveryIntent,
	ThreadLinkRow,
} from "@/ui/workbench-thread-link/contracts";
import {
	capabilities,
	connected,
	epochA,
	epochB,
	executableLink,
	FakeTransport,
	FakeTransportError,
	inspectOnlyLink,
	listed,
	loginA,
	capturing,
	record,
	snapshot,
	threadA,
	threadB,
	unboundLink,
} from "@/ui/workbench-thread-link/tests/fixtures";

/**
 * A controller over one double.
 * @param transport The double.
 * @param hostRecoveryIntents The host intents this pane has an owner for.
 * @returns The controller.
 */
function controllerFor(
	transport: FakeTransport,
	hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[] = [],
): ThreadLinkController {
	return createThreadLinkController({ capturePane: capturing(transport, hostRecoveryIntents) });
}

/**
 * The one row of a listed inventory holding one thread.
 * @param transport The double.
 * @param threadId The thread.
 * @returns The row.
 */
function rowFor(transport: FakeTransport, threadId: ThreadId = threadA): ThreadLinkRow {
	const selection = projectThreadLinkSelection({
		inventory: listed([record({ threadId, selectionId: `selection-${threadId}` })]),
		currentLink: transport.snapshot()?.threadLink ?? unboundLink,
		capabilities: transport.capabilities(),
	});
	const row = selection.rows[0];
	if (row === undefined) {
		throw new Error("The fixture produced no bindable row.");
	}
	return row;
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
 * The recovery intent of a settled action.
 * @param settled The snapshot.
 * @returns The intent, or null.
 */
function recoveryOf(settled: ThreadLinkActionSnapshot): string | null {
	if (settled.state === "idle" || settled.state === "pending") {
		return null;
	}
	return settled.recovery?.intent ?? null;
}

/**
 * A pending ChatGPT sign-in as the host publishes it.
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

	test("create and attach are separate commands with separate drafts", async () => {
		const transport = new FakeTransport();
		const controller = controllerFor(transport);
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadA) }),
		});
		await controller.create();
		await controller.bind(rowFor(transport));
		expect(transport.commands.map((entry) => entry.draft.command)).toEqual([
			"threadLinkCreate",
			"threadLinkAttach",
		]);
		expect(transport.commands[0]?.draft).not.toHaveProperty("threadId");
		expect(transport.commands[1]?.draft).toMatchObject({
			threadId: threadA,
			selectionId: `selection-${threadA}`,
		});
	});

	test("relink is a third command, chosen by the pane's current link", async () => {
		const transport = new FakeTransport(
			connected(snapshot({ threadLink: executableLink(threadA) })),
		);
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadB) }),
		});
		await controllerFor(transport).bind(rowFor(transport, threadB));
		expect(transport.commands[0]?.draft).toMatchObject({
			command: "threadLinkRelink",
			threadId: threadB,
			selectionId: `selection-${threadB}`,
		});
	});

	test("binds the row the host listed under one selection id", async () => {
		const transport = new FakeTransport(
			connected(snapshot({ threadCandidates: listed([record({ selectionId: "listed-a" })]) })),
		);
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadA) }),
		});
		const controller = controllerFor(transport);
		await controller.bindSelection("listed-a");
		expect(transport.commands[0]?.draft).toMatchObject({
			command: "threadLinkAttach",
			selectionId: "listed-a",
			threadId: threadA,
		});
		await controller.bindSelection("gone");
		expect(transport.commands).toHaveLength(1);
		expect(announcementOf(controller.snapshot())).toContain("no longer in the host's list");
	});

	test("unlink is refused with the two ways a pane can move on, and sends nothing", async () => {
		const transport = new FakeTransport(
			connected(snapshot({ threadLink: executableLink(threadA) })),
		);
		const controller = controllerFor(transport);
		await controller.unlink();
		expect(transport.commands).toEqual([]);
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(announcementOf(settled)).toContain("no thread-link unbind command");
		expect(recoveryOf(settled)).toBe("refresh_inventory");
	});

	test("every command carries the target captured when it was offered", async () => {
		const transport = new FakeTransport();
		const controller = controllerFor(transport);
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadA) }),
		});
		await controller.create();
		await controller.refreshInventory();
		await controller.login({ type: "apiKey", apiKey: "key" });
		await controller.cancelLogin(loginA);
		await controller.logout();
		expect(transport.commands).toHaveLength(5);
		for (const entry of transport.commands) {
			expect(entry.target).toMatchObject({
				epoch: epochA,
				commandId: transport.result().commandId,
			});
		}
		expect(transport.commands.map((entry) => entry.draft.command)).toEqual([
			"threadLinkCreate",
			"threadLinkRefresh",
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
		expect(recoveryOf(settled)).toBe("refresh_inventory");
	});

	test("a focus change that moves the pane's link refuses the captured attach", async () => {
		const transport = new FakeTransport();
		const controller = controllerFor(transport);
		const row = rowFor(transport);
		transport.runBeforeCommand(() => {
			transport.publish(connected(snapshot({ threadLink: executableLink(threadB) })));
		});
		await controller.bind(row);
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		if (settled.state === "failed" && "childId" in settled.target) {
			expect(settled.target.capturedLinkState).toBe("unbound");
			expect(settled.target.threadId).toBe(threadA);
		}
		expect(recoveryOf(settled)).toBe("refresh_inventory");
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
		const second = await controller.bind(rowFor(transport));
		held.resolve();
		const firstCompletion = await first;
		expect(firstCompletion.state).toBe("ignored");
		expect(second.state).toBe("applied");
		const settled = controller.snapshot();
		expect(settled.state === "idle" ? null : settled.action).toBe("attach");
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

	test("a link that settles on another thread than the one named stays inspect-only", async () => {
		const transport = new FakeTransport();
		const row = rowFor(transport);
		transport.nextResult = transport.result({
			snapshot: snapshot({ threadLink: executableLink(threadB) }),
		});
		const controller = controllerFor(transport);
		await controller.bind(row);
		const settled = controller.snapshot();
		expect(settled.state).toBe("inspect_only");
		expect(announcementOf(settled)).toContain("is not the thread it named");
	});

	test("a row that discloses no runnable command never reaches the wire", async () => {
		const transport = new FakeTransport(
			connected(snapshot({ threadLink: executableLink(threadA) })),
		);
		const controller = controllerFor(transport);
		const selection = projectThreadLinkSelection({
			inventory: listed([record()]),
			currentLink: executableLink(threadA),
			capabilities: transport.capabilities(),
		});
		const current = selection.rows[0];
		if (current === undefined) {
			throw new Error("The fixture produced no current row.");
		}
		await controller.bind(current);
		expect(transport.commands).toEqual([]);
		expect(controller.snapshot().state).toBe("failed");
	});

	test("a refused command publishes the refusal message and a recovery", async () => {
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
		expect(recoveryOf(settled)).toBe("refresh_snapshot");
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
