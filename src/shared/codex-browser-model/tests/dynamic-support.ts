import { createIdentityAuthorities } from "../../codex-workbench-identity/index.js";
import { createCodexBrowserModel } from "../index.js";
import type {
	BrowserDynamicApproval,
	BrowserDynamicApprovalEffect,
	BrowserDynamicApprovalResponse,
	DynamicApprovalDecision,
	DynamicApprovalEffect,
	DynamicApprovalRequest,
} from "../index.js";

const authorities = createIdentityAuthorities();
const model = createCodexBrowserModel(authorities);
const child = model.ChildIdSchema.parse(authorities.identity.validator.childId);
const epoch = model.ChildEpochSchema.parse(authorities.identity.validator.epoch);
const caller = model.ThreadIdSchema.parse(authorities.identity.decoder.adoptThreadId("caller"));
const callerTurn = model.TurnIdSchema.parse(
	authorities.identity.decoder.adoptTurnId("caller-turn"),
);
const other = model.ThreadIdSchema.parse(
	authorities.identity.decoder.adoptThreadId("other-target"),
);
const otherTurn = model.TurnIdSchema.parse(authorities.identity.decoder.adoptTurnId("other-turn"));
const callIds = [
	model.DynamicToolCallIdSchema.parse(
		authorities.identity.decoder.adoptDynamicToolCallId("create-call"),
	),
	model.DynamicToolCallIdSchema.parse(
		authorities.identity.decoder.adoptDynamicToolCallId("fork-call"),
	),
	model.DynamicToolCallIdSchema.parse(
		authorities.identity.decoder.adoptDynamicToolCallId("send-call"),
	),
];
const operationIds = [
	authorities.operation.issuer.mintOperationId(),
	authorities.operation.issuer.mintOperationId(),
	authorities.operation.issuer.mintOperationId(),
	authorities.operation.issuer.mintOperationId(),
	authorities.operation.issuer.mintOperationId(),
];

function identity(
	tool: "create_thread" | "fork_thread" | "send_message_to_thread",
	callId: number,
	operationId: number,
) {
	return model.DynamicApprovalIdentitySchema.parse({
		child,
		epoch,
		threadId: caller,
		turnId: callerTurn,
		callId: callIds[callId],
		namespace: "archboard_app",
		tool,
		manifestHash: "manifest-hash",
		operationId: operationIds[operationId],
	});
}

function requestFor(
	approvalIdentity: ReturnType<typeof identity>,
	approvalEffect: DynamicApprovalEffect,
): DynamicApprovalRequest {
	const draft = {
		kind: "dynamic_approval_request" as const,
		identity: approvalIdentity,
		effect: approvalEffect,
		effectHash: `sha256:${"0".repeat(64)}`,
		createdAtMs: 1_787_682_840_000,
		expiresAtMs: 1_787_682_930_000,
	};
	return model.DynamicApprovalRequestSchema.parse({
		...draft,
		effectHash: model.effectHashForRequest({ identity: approvalIdentity, effect: approvalEffect }),
	});
}

const createIdentity = identity("create_thread", 0, 0);
const createEffect = model.DynamicApprovalEffectSchema.parse({
	tool: "create_thread",
	arguments: { prompt: "Create a workhorse" },
	callerAuthority: "caller-authority",
	targetAuthority: null,
	contextAuthority: "context-authority",
	effectiveBoundary: null,
	mutationOperationId: operationIds[0],
	initialTurnOperationId: operationIds[1],
	visualSummary: "Create a workhorse with the reviewed prompt",
});
const createRequest = requestFor(createIdentity, createEffect);

const forkIdentity = identity("fork_thread", 1, 2);
const forkEffect = model.DynamicApprovalEffectSchema.parse({
	tool: "fork_thread",
	arguments: { threadId: caller, beforeTurnId: null, prompt: "Fork this turn" },
	callerAuthority: "caller-authority",
	targetAuthority: "caller-target-authority",
	contextAuthority: "context-authority",
	effectiveBoundary: { relation: "self", beforeTurnId: callerTurn },
	mutationOperationId: operationIds[2],
	initialTurnOperationId: operationIds[3],
	visualSummary: "Fork the current caller at its executing turn",
});
const forkRequest = requestFor(forkIdentity, forkEffect);

const sendIdentity = identity("send_message_to_thread", 2, 4);
const sendEffect = model.DynamicApprovalEffectSchema.parse({
	tool: "send_message_to_thread",
	arguments: { threadId: other, prompt: "Please inspect the architecture" },
	callerAuthority: "caller-authority",
	targetAuthority: "target-authority",
	contextAuthority: "context-authority",
	effectiveBoundary: null,
	mutationOperationId: operationIds[4],
	initialTurnOperationId: null,
	visualSummary: "Send a bounded message to the other thread",
});
const sendRequest = requestFor(sendIdentity, sendEffect);

function browserEffect(effect: DynamicApprovalEffect): BrowserDynamicApprovalEffect {
	if (effect.tool === "create_thread") {
		return model.BrowserDynamicApprovalEffectSchema.parse({
			tool: effect.tool,
			arguments: effect.arguments,
			target: null,
			effectiveBoundary: effect.effectiveBoundary,
			mutationOperationId: effect.mutationOperationId,
			initialTurnOperationId: effect.initialTurnOperationId,
			visualSummary: effect.visualSummary,
		});
	}
	if (effect.tool === "fork_thread") {
		return model.BrowserDynamicApprovalEffectSchema.parse({
			tool: effect.tool,
			arguments: effect.arguments,
			target: effect.arguments.threadId,
			effectiveBoundary: effect.effectiveBoundary,
			mutationOperationId: effect.mutationOperationId,
			initialTurnOperationId: effect.initialTurnOperationId,
			visualSummary: effect.visualSummary,
		});
	}
	return model.BrowserDynamicApprovalEffectSchema.parse({
		tool: effect.tool,
		arguments: effect.arguments,
		target: effect.arguments.threadId,
		effectiveBoundary: effect.effectiveBoundary,
		mutationOperationId: effect.mutationOperationId,
		initialTurnOperationId: effect.initialTurnOperationId,
		visualSummary: effect.visualSummary,
	});
}

function approvalFor(
	request: DynamicApprovalRequest,
	state: BrowserDynamicApproval["state"],
	decision: BrowserDynamicApproval["decision"],
	delivery: BrowserDynamicApproval["delivery"],
	toolResult: BrowserDynamicApproval["toolResult"],
): BrowserDynamicApproval {
	return model.BrowserDynamicApprovalSchema.parse({
		kind: "dynamic_approval",
		state,
		identity: request.identity,
		effect: browserEffect(request.effect),
		effectHash: request.effectHash,
		createdAtMs: request.createdAtMs,
		expiresAtMs: request.expiresAtMs,
		decision,
		delivery,
		toolResult,
		binding:
			state === "pending"
				? {
						commandId: model.BrowserCommandIdSchema.parse(
							authorities.identity.issuer.mintBrowserCommandId(),
						),
						paneId: "pane-caller",
						capturedLink: { threadId: caller, childId: child, epoch },
					}
				: null,
		resumable: false,
	});
}

function decisionFor(
	request: DynamicApprovalRequest,
	outcome: DynamicApprovalDecision["outcome"],
	cause: string,
	decidedAtMs = request.createdAtMs + 1,
): DynamicApprovalDecision {
	return model.DynamicApprovalDecisionSchema.parse({
		outcome,
		identity: request.identity,
		effectHash: request.effectHash,
		decidedAtMs,
		cause,
	});
}

const pending = approvalFor(createRequest, "pending", null, null, null);
const response: BrowserDynamicApprovalResponse = model.BrowserDynamicApprovalResponseSchema.parse({
	kind: "browser_command",
	command: "dynamicApprovalRespond",
	commandId: pending.binding!.commandId,
	paneId: pending.binding!.paneId,
	childId: child,
	epoch,
	capturedLink: pending.binding!.capturedLink,
	identity: createRequest.identity,
	effectHash: createRequest.effectHash,
	decision: "approve",
});

function createDynamicFixture() {
	return {
		authorities,
		model,
		requests: [createRequest, forkRequest, sendRequest],
		effects: [createEffect, forkEffect, sendEffect],
		pending,
		response,
		caller,
		callerTurn,
		other,
		otherTurn,
		child,
		epoch,
	};
}

export { approvalFor, decisionFor, createDynamicFixture };
