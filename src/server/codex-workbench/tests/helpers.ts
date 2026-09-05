import { expect } from "bun:test";

import { CodexWorkbenchGatewayError } from "../index.js";
import type { BrowserCommand, BrowserDynamicApprovalResponse } from "../index.js";
import { commandTarget, type GatewayHarness } from "./support.js";

function expectGatewayError(action: () => unknown, code: CodexWorkbenchGatewayError["code"]): void {
	expect(action).toThrow(CodexWorkbenchGatewayError);
	try {
		action();
	} catch (error) {
		expect(error).toMatchObject({ code });
	}
}

async function expectRejected(
	action: () => Promise<unknown>,
	code: CodexWorkbenchGatewayError["code"],
): Promise<void> {
	try {
		await action();
		throw new Error(`expected ${code}`);
	} catch (error) {
		expect(error).toMatchObject({ code });
	}
}

function accountCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
	command: "accountLogin" | "accountLoginCancel" | "accountLogout",
): BrowserCommand {
	const target = commandTarget(lease);
	if (command === "accountLogin") {
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			login: { type: "chatgpt" },
		});
	}
	if (command === "accountLoginCancel") {
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			loginId: harnessValue.model.LoginIdSchema.parse(
				harnessValue.authorities.identity.decoder.adoptLoginId("gateway-login"),
			),
		});
	}
	return harnessValue.model.BrowserCommandSchema.parse({ ...target, command });
}

function startCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
	threadId = harnessValue.threadId,
): BrowserCommand {
	return harnessValue.model.BrowserCommandSchema.parse({
		...commandTarget(lease),
		command: "start",
		threadId,
		prompt: "Run the bounded command",
	});
}

function threadLinkCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
	command: "threadLinkCreate" | "threadLinkRefresh" | "threadLinkAttach" | "threadLinkRelink",
): BrowserCommand {
	const target = commandTarget(lease);
	if (command === "threadLinkCreate" || command === "threadLinkRefresh") {
		return harnessValue.model.BrowserCommandSchema.parse({ ...target, command });
	}
	return harnessValue.model.BrowserCommandSchema.parse({
		...target,
		command,
		selectionId: "selection-a",
		threadId: harnessValue.threadId,
	});
}

function steerCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
): BrowserCommand {
	return harnessValue.model.BrowserCommandSchema.parse({
		...commandTarget(lease),
		command: "steer",
		threadId: harnessValue.threadId,
		turnId: harnessValue.turnId,
		prompt: "Steer the bounded command",
	});
}

function interruptCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
): BrowserCommand {
	return harnessValue.model.BrowserCommandSchema.parse({
		...commandTarget(lease),
		command: "interrupt",
		threadId: harnessValue.threadId,
		turnId: harnessValue.turnId,
	});
}

function queueCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
	command: "queueAdd" | "queueUpdate" | "queueDelete" | "queueReorder" | "queueStart",
): BrowserCommand {
	const target = commandTarget(lease);
	const submissionId = harnessValue.model.QueuedSubmissionIdSchema.parse(
		harnessValue.authorities.identity.decoder.adoptQueuedSubmissionId("gateway-submission"),
	);
	if (command === "queueAdd") {
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			prompt: "Queue the bounded command",
		});
	}
	if (command === "queueUpdate") {
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			submissionId,
			prompt: "Update the bounded command",
		});
	}
	if (command === "queueDelete" || command === "queueStart") {
		return harnessValue.model.BrowserCommandSchema.parse({ ...target, command, submissionId });
	}
	return harnessValue.model.BrowserCommandSchema.parse({
		...target,
		command,
		orderedSubmissionIds: [submissionId],
	});
}

function realtimeCommand(
	harnessValue: GatewayHarness,
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
	command: "realtimeStart" | "realtimeAppendText" | "realtimeStop",
	realtimeSessionHandle = lease.commandId,
): BrowserCommand {
	const target = commandTarget(lease);
	if (command === "realtimeStart") {
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			threadId: harnessValue.threadId,
			sdp: "v=0",
		});
	}
	if (command === "realtimeAppendText") {
		return harnessValue.model.BrowserCommandSchema.parse({
			...target,
			command,
			threadId: harnessValue.threadId,
			realtimeSessionHandle,
			text: "bounded speech",
		});
	}
	return harnessValue.model.BrowserCommandSchema.parse({
		...target,
		command,
		threadId: harnessValue.threadId,
		realtimeSessionHandle,
	});
}

type GatewayConnection = ReturnType<GatewayHarness["gateway"]["connect"]>;
type CommandFactory = (
	lease: ReturnType<GatewayHarness["gateway"]["claimLease"]>,
) => BrowserCommand;

async function deliver(connection: GatewayConnection, factory: CommandFactory): Promise<void> {
	const result = await connection.command(factory(connection.claimLease()));
	expect(result.outcome).toBe("delivered");
}

function dynamicResponse(
	harnessValue: GatewayHarness,
	approval: ReturnType<GatewayHarness["makeDynamicApproval"]>,
	decision: "approve" | "decline" = "approve",
): BrowserDynamicApprovalResponse {
	return harnessValue.model.BrowserDynamicApprovalResponseSchema.parse({
		kind: "browser_command",
		command: "dynamicApprovalRespond",
		commandId: approval.binding.commandId,
		paneId: approval.binding.paneId,
		childId: harnessValue.childId,
		epoch: harnessValue.epoch,
		capturedLink: approval.binding.capturedLink,
		identity: approval.request.identity,
		effectHash: approval.request.effectHash,
		decision,
	});
}

export {
	expectGatewayError,
	expectRejected,
	accountCommand,
	startCommand,
	threadLinkCommand,
	steerCommand,
	interruptCommand,
	queueCommand,
	realtimeCommand,
	type GatewayConnection,
	type CommandFactory,
	deliver,
	dynamicResponse,
};
