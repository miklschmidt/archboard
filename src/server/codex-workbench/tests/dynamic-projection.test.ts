import { expect, test } from "bun:test";

import {
	createDynamicAuthorityTokenIssuer,
	type DynamicToolApprovalRequest,
} from "../../../runtime/codex-dynamic-tools/index.js";
import { EMPTY_SPOKEN_APPROVAL_SNAPSHOT } from "../../../runtime/codex-spoken-approval/index.js";
import {
	CODEX_APPROVAL_EXPIRY_MS,
	createCodexBrowserModel,
} from "../../../shared/codex-browser-model/index.js";
import {
	createIdentityAuthorities,
	IdentityValidationError,
	type IdentityAuthorities,
} from "../../../shared/codex-workbench-identity/index.js";
import {
	projectCodexBrowserState,
	type BrowserProjectionInput,
	type DynamicApprovalOwnerRequest,
	type DynamicApprovalOwnerView,
} from "../index.js";

const PRIVATE_PATHS = [
	"/private/dynamic-create",
	"/private/dynamic-fork",
	"/private/dynamic-send",
	"/private/dynamic-identity",
] as const;

function ownerRequest(value: DynamicToolApprovalRequest): DynamicToolApprovalRequest {
	return value;
}

function compileDeepReadonlyDynamicOwner(view: DynamicApprovalOwnerView): void {
	const request: DynamicApprovalOwnerRequest = view.request;
	void request;
	if (view.request.effect.tool === "create_thread") {
		// @ts-expect-error Dynamic owner arguments are recursively readonly.
		view.request.effect.arguments.prompt = "mutated";
	}
	if (view.request.effect.tool === "fork_thread") {
		// @ts-expect-error Dynamic owner boundaries are recursively readonly.
		view.request.effect.effectiveBoundary.beforeTurnId = "mutated";
	}
}

void compileDeepReadonlyDynamicOwner;

function ownerViews(authorities: IdentityAuthorities): readonly DynamicApprovalOwnerView[] {
	const authority = createDynamicAuthorityTokenIssuer();
	const callerThreadId = authorities.identity.decoder.adoptThreadId("dynamic-caller");
	const callerTurnId = authorities.identity.decoder.adoptTurnId("dynamic-caller-turn");
	const forkTarget = authorities.identity.decoder.adoptThreadId("dynamic-fork-target");
	const forkBefore = authorities.identity.decoder.adoptTurnId("dynamic-fork-before");
	const sendTarget = authorities.identity.decoder.adoptThreadId("dynamic-send-target");
	const binding = () => ({
		commandId: authorities.identity.issuer.mintBrowserCommandId(),
		paneId: "dynamic-pane",
		capturedLink: {
			threadId: callerThreadId,
			childId: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
		},
	});
	const identity = (
		tool: DynamicToolApprovalRequest["effect"]["tool"],
		operationId: string,
		call: string,
	) => ({
		child: authorities.identity.validator.childId,
		epoch: authorities.identity.validator.epoch,
		threadId: callerThreadId,
		turnId: callerTurnId,
		callId: authorities.identity.decoder.adoptDynamicToolCallId(call),
		namespace: "archboard_app" as const,
		tool,
		manifestHash: "projection-manifest",
		operationId,
		futurePrivateIdentity: PRIVATE_PATHS[3],
	});
	const createOperation = String(authorities.operation.issuer.mintOperationId());
	const createSource = {
		identity: identity("create_thread", createOperation, "dynamic-create-call"),
		effect: {
			tool: "create_thread" as const,
			arguments: { prompt: "Create a bounded thread", privatePath: PRIVATE_PATHS[0] },
			callerAuthority: authority.issue(),
			targetAuthority: null,
			contextAuthority: authority.issue(),
			effectiveBoundary: null,
			mutationOperationId: createOperation,
			initialTurnOperationId: String(authorities.operation.issuer.mintOperationId()),
			visualSummary: "Create one thread",
			privatePath: PRIVATE_PATHS[0],
		},
		effectHash: `sha256:${"a".repeat(64)}`,
		createdAtMs: 100,
		expiresAtMs: 100 + CODEX_APPROVAL_EXPIRY_MS,
		privatePath: PRIVATE_PATHS[0],
	};
	const create = ownerRequest(createSource);

	const forkOperation = String(authorities.operation.issuer.mintOperationId());
	const forkSource = {
		identity: identity("fork_thread", forkOperation, "dynamic-fork-call"),
		effect: {
			tool: "fork_thread" as const,
			arguments: {
				threadId: authorities.identity.decoder.serializeCodexIdentity(forkTarget),
				beforeTurnId: authorities.identity.decoder.serializeCodexIdentity(forkBefore),
				prompt: "Continue from one turn",
				privatePath: PRIVATE_PATHS[1],
			},
			callerAuthority: authority.issue(),
			targetAuthority: authority.issue(),
			contextAuthority: authority.issue(),
			effectiveBoundary: {
				relation: "other" as const,
				beforeTurnId: authorities.identity.decoder.serializeCodexIdentity(forkBefore),
			},
			mutationOperationId: forkOperation,
			initialTurnOperationId: String(authorities.operation.issuer.mintOperationId()),
			visualSummary: "Fork one thread",
			privatePath: PRIVATE_PATHS[1],
		},
		effectHash: `sha256:${"b".repeat(64)}`,
		createdAtMs: 200,
		expiresAtMs: 200 + CODEX_APPROVAL_EXPIRY_MS,
		privatePath: PRIVATE_PATHS[1],
	};
	const fork = ownerRequest(forkSource);

	const sendOperation = String(authorities.operation.issuer.mintOperationId());
	const sendSource = {
		identity: identity("send_message_to_thread", sendOperation, "dynamic-send-call"),
		effect: {
			tool: "send_message_to_thread" as const,
			arguments: {
				threadId: authorities.identity.decoder.serializeCodexIdentity(sendTarget),
				prompt: "Send one bounded message",
				privatePath: PRIVATE_PATHS[2],
			},
			callerAuthority: authority.issue(),
			targetAuthority: authority.issue(),
			contextAuthority: authority.issue(),
			effectiveBoundary: null,
			mutationOperationId: sendOperation,
			initialTurnOperationId: null,
			visualSummary: "Send one message",
			privatePath: PRIVATE_PATHS[2],
		},
		effectHash: `sha256:${"c".repeat(64)}`,
		createdAtMs: 300,
		expiresAtMs: 300 + CODEX_APPROVAL_EXPIRY_MS,
		privatePath: PRIVATE_PATHS[2],
	};
	const send = ownerRequest(sendSource);

	return [
		{ request: create, binding: binding() },
		{ request: fork, binding: binding() },
		{ request: send, binding: binding() },
	];
}

function selfForkOwner(authorities: IdentityAuthorities): DynamicApprovalOwnerView {
	const authority = createDynamicAuthorityTokenIssuer();
	const threadId = authorities.identity.decoder.adoptThreadId("dynamic-self-fork");
	const turnId = authorities.identity.decoder.adoptTurnId("dynamic-self-fork-turn");
	const operationId = String(authorities.operation.issuer.mintOperationId());
	const request = ownerRequest({
		identity: {
			child: authorities.identity.validator.childId,
			epoch: authorities.identity.validator.epoch,
			threadId,
			turnId,
			callId: authorities.identity.decoder.adoptDynamicToolCallId("dynamic-self-fork-call"),
			namespace: "archboard_app",
			tool: "fork_thread",
			manifestHash: "projection-manifest",
			operationId,
		},
		effect: {
			tool: "fork_thread",
			arguments: {
				threadId: authorities.identity.decoder.serializeCodexIdentity(threadId),
				beforeTurnId: null,
				prompt: null,
			},
			callerAuthority: authority.issue(),
			targetAuthority: authority.issue(),
			contextAuthority: authority.issue(),
			effectiveBoundary: { relation: "self", beforeTurnId: String(turnId) },
			mutationOperationId: operationId,
			initialTurnOperationId: null,
			visualSummary: "Fork the caller before its active turn",
		},
		effectHash: `sha256:${"d".repeat(64)}`,
		createdAtMs: 400,
		expiresAtMs: 400 + CODEX_APPROVAL_EXPIRY_MS,
	});
	return {
		request,
		binding: {
			commandId: authorities.identity.issuer.mintBrowserCommandId(),
			paneId: "dynamic-pane",
			capturedLink: {
				threadId,
				childId: authorities.identity.validator.childId,
				epoch: authorities.identity.validator.epoch,
			},
		},
	};
}

function projectionInput(owners: readonly DynamicApprovalOwnerView[]): BrowserProjectionInput {
	const link = owners[0]!.binding.capturedLink;
	return {
		readiness: { kind: "readiness", state: "thread_capable" },
		account: { kind: "account", state: "signed_out" },
		login: { kind: "login", state: "idle" },
		threadLink: {
			kind: "thread_link",
			state: "executable",
			...link,
			source: "appServer",
			status: "idle",
			loaded: true,
			canAcceptDirectInput: true,
			reason: null,
		},
		threadCandidates: { kind: "codex_thread_candidates", state: "unknown" },
		timeline: null,
		queue: { kind: "codex_queue", submissions: [] },
		settings: [],
		approvals: [],
		dynamicApprovals: owners,
		semantic: { kind: "codex_semantic", outcome: null, freshness: null },
		coordinator: {
			kind: "codex_coordinator",
			state: "unbound",
			threadId: null,
			configured: null,
			effective: null,
			reason: null,
		},
		voice: {
			kind: "codex_voice",
			mediaReady: false,
			generation: null,
			coordinatorState: "unbound",
			transcript: [],
		},
		spokenApproval: EMPTY_SPOKEN_APPROVAL_SNAPSHOT,
		lease: null,
		operation: null,
	};
}

test("the sole public projection closes all three dynamic approval presentations", () => {
	const authorities = createIdentityAuthorities();
	const owners = ownerViews(authorities);
	const result = projectCodexBrowserState(
		createCodexBrowserModel(authorities),
		authorities.identity.decoder,
		projectionInput(owners),
	);
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") {
		throw new Error("dynamic projection was refused");
	}
	const projected = result.snapshot.dynamicApprovals;
	expect(projected.map((approval) => approval.effect.tool)).toEqual([
		"create_thread",
		"fork_thread",
		"send_message_to_thread",
	]);
	expect(projected.map((approval) => approval.state)).toEqual(["pending", "pending", "pending"]);
	const identityKeys = [
		"callId",
		"child",
		"epoch",
		"manifestHash",
		"namespace",
		"operationId",
		"threadId",
		"tool",
		"turnId",
	];
	for (const approval of projected) {
		expect(Object.keys(approval.identity).toSorted()).toEqual(identityKeys);
		expect(Object.isFrozen(approval.identity)).toBe(true);
	}
	expect(Object.keys(projected[0]!).toSorted()).toEqual([
		"binding",
		"createdAtMs",
		"decision",
		"delivery",
		"effect",
		"effectHash",
		"expiresAtMs",
		"identity",
		"kind",
		"resumable",
		"state",
		"toolResult",
	]);
	const effectKeys = [
		"arguments",
		"effectiveBoundary",
		"initialTurnOperationId",
		"mutationOperationId",
		"target",
		"tool",
		"visualSummary",
	];
	for (const approval of projected) {
		expect(Object.keys(approval.effect).toSorted()).toEqual(effectKeys);
	}
	expect(projected.map((approval) => Object.keys(approval.effect.arguments).toSorted())).toEqual([
		["prompt"],
		["beforeTurnId", "prompt", "threadId"],
		["prompt", "threadId"],
	]);
	expect(projected[0]?.effect.target).toBeNull();
	const fork = projected[1]!.effect;
	const send = projected[2]!.effect;
	if (fork.tool !== "fork_thread" || send.tool !== "send_message_to_thread") {
		throw new Error("dynamic effect order changed");
	}
	expect(fork.target).toBe(fork.arguments.threadId);
	expect(fork.effectiveBoundary.beforeTurnId).toBe(fork.arguments.beforeTurnId);
	expect(send.target).toBe(send.arguments.threadId);
	const wire = JSON.stringify(projected);
	for (const privatePath of PRIVATE_PATHS) {
		expect(wire).not.toContain(privatePath);
	}
	for (const owner of owners) {
		expect(wire).not.toContain(owner.request.effect.callerAuthority);
		expect(wire).not.toContain(owner.request.effect.contextAuthority);
		if (owner.request.effect.targetAuthority !== null) {
			expect(wire).not.toContain(owner.request.effect.targetAuthority);
		}
	}
	expect(Object.isFrozen(projected)).toBe(true);
	expect(Object.isFrozen(projected[0]?.effect)).toBe(true);
});

test("self-fork projection keeps the requested and effective boundaries distinct", () => {
	const authorities = createIdentityAuthorities();
	const owner = selfForkOwner(authorities);
	const result = projectCodexBrowserState(
		createCodexBrowserModel(authorities),
		authorities.identity.decoder,
		projectionInput([owner]),
	);
	expect(result.tag).toBe("projected");
	if (result.tag !== "projected") {
		throw new Error("self-fork projection was refused");
	}
	const effect = result.snapshot.dynamicApprovals[0]?.effect;
	if (effect?.tool !== "fork_thread") {
		throw new Error("self-fork effect was not projected");
	}
	expect(effect.arguments.beforeTurnId).toBeNull();
	expect(effect.effectiveBoundary).toEqual({
		relation: "self",
		beforeTurnId: owner.request.identity.turnId,
	});
	expect(Object.isFrozen(effect.arguments)).toBe(true);
	expect(Object.isFrozen(effect.effectiveBoundary)).toBe(true);
});

test("effective fork boundaries refuse canonical wrong-domain and unissued identities", () => {
	const authorities = createIdentityAuthorities();
	const model = createCodexBrowserModel(authorities);
	const owner = ownerViews(authorities)[1]!;
	const foreignAuthorities = createIdentityAuthorities();
	const boundaries = [
		{
			value: String(authorities.identity.decoder.adoptThreadId("wrong-boundary-domain")),
			code: "wrong-domain",
		},
		{
			value: String(foreignAuthorities.identity.decoder.adoptTurnId("unissued-boundary")),
			code: "unissued",
		},
	] as const;

	for (const boundary of boundaries) {
		try {
			authorities.identity.decoder.parseTurnId(boundary.value);
			throw new Error("invalid boundary unexpectedly parsed");
		} catch (error) {
			expect(error).toBeInstanceOf(IdentityValidationError);
			if (!(error instanceof IdentityValidationError)) {
				throw error;
			}
			expect(error.code).toBe(boundary.code);
		}
		if (owner.request.effect.tool !== "fork_thread") {
			throw new Error("other-fork fixture changed tools");
		}
		const invalidOwner: DynamicApprovalOwnerView = {
			...owner,
			request: {
				...owner.request,
				effect: {
					...owner.request.effect,
					arguments: { ...owner.request.effect.arguments, beforeTurnId: boundary.value },
					effectiveBoundary: { relation: "other", beforeTurnId: boundary.value },
				},
			},
		};
		const result = projectCodexBrowserState(
			model,
			authorities.identity.decoder,
			projectionInput([invalidOwner]),
		);
		expect(result).toEqual({
			tag: "refused",
			reason: "invalid_projection",
			message: "The normalized owner state cannot be represented by the browser contract.",
		});
	}
});
