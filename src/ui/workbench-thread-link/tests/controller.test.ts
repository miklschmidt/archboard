import { describe, expect, test } from "bun:test";

import { BrowserWorkbenchTransportError } from "../../workbench-transport/index.js";
import { createThreadLinkController, projectThreadLinkSelection } from "../index.js";
import type { ThreadLinkController, ThreadLinkRow } from "../index.js";
import {
	capabilities,
	epochA,
	epochB,
	connected,
	listed,
	executableLink,
	FakeTransport,
	inspectOnlyLink,
	loginA,
	pane,
	record,
	snapshot,
	threadA,
	threadB,
	unboundLink,
} from "./fixtures.js";
import type { ThreadLinkRecoveryIntent } from "../index.js";

function controllerFor(
	transport: FakeTransport,
	hostRecoveryIntents: readonly ThreadLinkRecoveryIntent[] = [],
	hostRecover?: () => Promise<void>,
): ThreadLinkController {
	return createThreadLinkController({
		capturePane: () => pane(transport, hostRecoveryIntents),
		captureHostRecovery:
			hostRecover === undefined
				? undefined
				: (target) => ({ paneId: target.paneId, intent: target.intent, recover: hostRecover }),
	});
}

function rowFor(transport: FakeTransport, threadId = threadA): ThreadLinkRow {
	const selection = projectThreadLinkSelection({
		inventory: listed([record({ threadId, selectionId: `selection-${threadId}` })]),
		currentLink: transport.snapshot()?.threadLink ?? unboundLink,
		capabilities: transport.capabilities(),
	});
	const row = selection.rows[0];
	if (row === undefined) throw new Error("The fixture produced no bindable row.");
	return row;
}

describe("thread-link action controller", () => {
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
			expect(entry.target).toBeDefined();
			expect(entry.target?.childId).toBe(transport.childId);
			expect(entry.target?.epoch).toBe(transport.epoch);
			expect(entry.target?.commandId).toBe(transport.commandId);
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
		transport.beforeCommand = () => {
			transport.epoch = epochB;
		};
		const controller = controllerFor(transport);
		const completion = await controller.create();
		expect(completion.state).toBe("applied");
		expect(transport.commands).toHaveLength(1);
		// The captured epoch went to the wire; the pane's new epoch never did.
		expect(transport.commands[0]?.target?.epoch).toBe(epochA);
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		expect(settled.state === "failed" ? settled.announcement : "").toContain(
			"changed since this command was captured",
		);
		if (settled.state === "failed" && "childId" in settled.target)
			expect(settled.target.epoch).toBe(epochA);
		expect(settled.state === "failed" ? settled.recovery?.intent : null).toBe("refresh_inventory");
	});

	test("a focus change that moves the pane's link refuses the captured attach", async () => {
		const transport = new FakeTransport();
		const controller = controllerFor(transport);
		const row = rowFor(transport);
		transport.beforeCommand = () => {
			transport.publish(connected(snapshot({ threadLink: executableLink(threadB) })));
		};
		await controller.bind(row);
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		if (settled.state === "failed" && "childId" in settled.target) {
			expect(settled.target.capturedLinkState).toBe("unbound");
			expect(settled.target.threadId).toBe(threadA);
		}
		expect(settled.state === "failed" ? settled.recovery?.intent : null).toBe("refresh_inventory");
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
		expect(settled.state === "failed" ? settled.announcement : "").toContain(
			"not ready for threadLinkCreate",
		);
	});

	test("a pane with no command lease fails before any target exists", async () => {
		const transport = new FakeTransport();
		transport.leased = false;
		const controller = controllerFor(transport);
		await controller.create();
		expect(transport.commands).toEqual([]);
		const settled = controller.snapshot();
		expect(settled.state).toBe("failed");
		if (settled.state === "failed" && "childId" in settled.target)
			expect(settled.target.commandId).toBeNull();
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
		expect(settled.state === "inspect_only" ? settled.announcement : "").toContain(
			"without a confirmed executable link",
		);
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
		expect(settled.state === "inspect_only" ? settled.announcement : "").toContain(
			"do not retry blind",
		);
	});

	test("a lost response is inspect-only, not a failure", async () => {
		const transport = new FakeTransport();
		transport.nextError = new BrowserWorkbenchTransportError(
			"response_lost",
			"The workbench response was lost.",
			{ outcome: "outcome_unknown" },
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
		expect(settled.state === "inspect_only" ? settled.announcement : "").toContain(
			"is not the thread it named",
		);
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
		if (current === undefined) throw new Error("The fixture produced no current row.");
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
		expect(settled.state === "failed" ? settled.announcement : "").toBe(
			"The workbench is not thread-capable.",
		);
		expect(settled.state === "failed" ? settled.recovery?.intent : null).toBe("refresh_snapshot");
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
