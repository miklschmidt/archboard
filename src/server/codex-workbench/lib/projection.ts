import type {
	BrowserAccount,
	BrowserCoordinator,
	BrowserDynamicApproval,
	BrowserDynamicApprovalEffect,
	BrowserQueue,
	BrowserSemanticDelivery,
	BrowserSettings,
	BrowserSnapshot,
	BrowserSchemas,
	BrowserThreadLink,
	BrowserThreadLinkSourcePresentation,
} from "../../../shared/codex-browser-model/index.js";
import {
	IdentityValidationError,
	type TrustedIdentityDecoder,
	type TurnId,
} from "../../../shared/codex-workbench-identity/index.js";
import type { BrowserSnapshotDelta } from "./contract.js";
import type {
	BrowserProjectionInput,
	BrowserProjectionResult,
	CodexCoordinatorProjectionInput,
	CodexQueueProjectionInput,
	CodexSemanticProjectionInput,
	CodexSettingsProjectionInput,
	CodexVoiceProjectionInput,
	DynamicApprovalOwnerView,
} from "./projection-contract.js";
import { projectApproval } from "./approval-projection.js";

type CodexAccountType = NonNullable<
	Extract<
		BrowserProjectionInput["account"],
		{ readonly kind: "codex_account_response" }
	>["response"]["account"]
>["type"];

const BROWSER_ACCOUNT_TYPE_BY_CODEX_TYPE = {
	apiKey: "apiKey",
	chatgpt: "chatgpt",
	amazonBedrock: "amazonBedrock",
} as const satisfies Record<CodexAccountType, string>;

const SECRET_KEYS = new Set([
	"apiKey",
	"accessToken",
	"secretAccessKey",
	"sessionToken",
	"password",
	"refreshToken",
]);

function containsSecretKey(value: unknown, seen = new Set<object>()): boolean {
	if (value === null || typeof value !== "object") return false;
	if (seen.has(value)) return false;
	seen.add(value);
	if (Array.isArray(value)) return value.some((entry) => containsSecretKey(entry, seen));
	for (const [key, entry] of Object.entries(value)) {
		if (SECRET_KEYS.has(key) || containsSecretKey(entry, seen)) return true;
	}
	return false;
}

function projectAccount(input: BrowserProjectionInput["account"]): BrowserAccount {
	if (input.kind !== "codex_account_response") return input;
	const account = input.response.account;
	if (account === null) return { kind: "account", state: "signed_out" };
	return {
		kind: "account",
		state: "ready",
		accountType: BROWSER_ACCOUNT_TYPE_BY_CODEX_TYPE[account.type],
	};
}

function projectSettings(input: CodexSettingsProjectionInput): BrowserSettings {
	const settings = input.settings;
	return {
		kind: "settings",
		owner: input.owner,
		model: settings.model,
		effort: settings.effort,
		serviceTier: settings.serviceTier,
		approvalPolicy: settings.approvalPolicy,
		approvalsReviewer: settings.approvalsReviewer,
		sandbox: projectSandbox(settings.sandboxPolicy),
		activePermissionProfile: settings.activePermissionProfile,
	};
}

function projectSandbox(
	policy: CodexSettingsProjectionInput["settings"]["sandboxPolicy"],
): BrowserSettings["sandbox"] {
	switch (policy.type) {
		case "dangerFullAccess":
			return { mode: "full_access", network: "unspecified" };
		case "readOnly":
			return { mode: "read_only", network: policy.networkAccess ? "enabled" : "restricted" };
		case "externalSandbox":
			return { mode: "external", network: policy.networkAccess };
		case "workspaceWrite":
			return {
				mode: "workspace_write",
				network: policy.networkAccess ? "enabled" : "restricted",
			};
	}
	const unhandled: never = policy;
	return unhandled;
}

function projectQueue(input: CodexQueueProjectionInput): BrowserQueue {
	if (input.submissions === null) return { kind: "queue", status: "unavailable", entries: [] };
	return {
		kind: "queue",
		status: input.submissions.length === 0 ? "empty" : "queued",
		entries: input.submissions.map((entry) => {
			const textInput = entry.input.find((item) => item.type === "text");
			return {
				submissionId: entry.id,
				prompt:
					textInput?.type === "text" && typeof textInput.text === "string"
						? textInput.text
						: "[non-text input]",
				status: "queued" as const,
				operationId: null,
			};
		}),
	};
}

function projectThreadLinkSource(
	source: Exclude<BrowserProjectionInput["threadLink"]["source"], null>,
): BrowserThreadLinkSourcePresentation {
	if (typeof source === "string") {
		switch (source) {
			case "cli":
			case "vscode":
			case "exec":
			case "appServer":
				return "standard";
			case "unknown":
				return "unknown";
		}
		const unhandled: never = source;
		return unhandled;
	}
	if ("custom" in source) return "custom";
	if ("subAgent" in source) return "subagent";
	const unhandled: never = source;
	return unhandled;
}

function projectThreadLink(input: BrowserProjectionInput["threadLink"]): BrowserThreadLink {
	switch (input.state) {
		case "unbound":
			return {
				kind: input.kind,
				state: input.state,
				childId: input.childId,
				epoch: input.epoch,
				threadId: input.threadId,
				sourcePresentation: null,
				status: input.status,
				loaded: input.loaded,
				canAcceptDirectInput: input.canAcceptDirectInput,
				reason: input.reason,
			};
		case "inspect_only":
			return {
				kind: input.kind,
				state: input.state,
				childId: input.childId,
				epoch: input.epoch,
				threadId: input.threadId,
				sourcePresentation: projectThreadLinkSource(input.source),
				status: input.status,
				loaded: input.loaded,
				canAcceptDirectInput: input.canAcceptDirectInput,
				reason: input.reason,
			};
		case "executable":
			return {
				kind: input.kind,
				state: input.state,
				childId: input.childId,
				epoch: input.epoch,
				threadId: input.threadId,
				sourcePresentation: "standard",
				status: input.status,
				loaded: input.loaded,
				canAcceptDirectInput: input.canAcceptDirectInput,
				reason: input.reason,
			};
	}
}

function projectSemantic(input: CodexSemanticProjectionInput): BrowserSemanticDelivery | null {
	if (input.outcome === null || input.outcome.targetThreadId === null || input.freshness === null)
		return null;
	return {
		kind: "semantic_delivery",
		threadId: input.outcome.targetThreadId,
		delivery: input.outcome.outcome,
		capturedAtMs: input.freshness.capturedAtMs,
		freshUntilMs: input.freshness.freshUntilMs,
		reason: input.outcome.reason,
	};
}

function projectCoordinator(input: CodexCoordinatorProjectionInput): BrowserCoordinator {
	return {
		kind: "coordinator",
		state: input.state === "inspect_only" ? "failed" : input.state,
		threadId: input.threadId,
		activeTurnId: null,
		configuredModel: input.configured?.model ?? null,
		configuredEffort: input.configured?.effort ?? null,
		model: input.effective?.model ?? null,
		effort: input.effective?.effort ?? null,
		serviceTier: input.effective?.serviceTier ?? null,
		reason: input.reason,
	};
}

function projectVoice(input: CodexVoiceProjectionInput) {
	return {
		kind: "voice",
		state: !input.mediaReady
			? "unavailable"
			: input.generation !== null
				? "active"
				: input.coordinatorState === "ready"
					? "ready"
					: "unavailable",
		realtimeSessionId: input.mediaReady ? (input.generation?.browserSessionId ?? null) : null,
		transcript: input.transcript.map((record) => ({
			itemId: record.itemId,
			sequence: record.sequence,
			speaker: record.role,
			text: record.text,
			final: record.status === "final",
		})),
		delivery: null,
		reason: input.mediaReady ? null : "Browser audio is unavailable for this socket.",
	};
}

type DynamicProjectionModel = Pick<
	BrowserSchemas,
	"BrowserDynamicApprovalEffectSchema" | "BrowserDynamicApprovalSchema" | "BrowserSnapshotSchema"
>;

type DynamicProjectionIdentity = Pick<
	TrustedIdentityDecoder,
	"adoptThreadId" | "adoptTurnId" | "parseTurnId"
>;

/** Dynamic boundaries may already carry an authority-issued turn; request arguments stay raw. */
function adoptBoundaryTurnId(identity: DynamicProjectionIdentity, value: string): TurnId {
	try {
		return identity.parseTurnId(value);
	} catch (error) {
		if (!(error instanceof IdentityValidationError) || error.code !== "invalid-shape") throw error;
		return identity.adoptTurnId(value);
	}
}

function projectDynamicApprovalEffect(
	model: DynamicProjectionModel,
	identity: DynamicProjectionIdentity,
	request: DynamicApprovalOwnerView["request"],
): BrowserDynamicApprovalEffect {
	const effect = request.effect;
	if (effect.tool === "create_thread")
		return model.BrowserDynamicApprovalEffectSchema.parse({
			tool: effect.tool,
			arguments: { prompt: effect.arguments.prompt },
			target: null,
			effectiveBoundary: null,
			mutationOperationId: effect.mutationOperationId,
			initialTurnOperationId: effect.initialTurnOperationId,
			visualSummary: effect.visualSummary,
		});

	const threadId = identity.adoptThreadId(effect.arguments.threadId);
	if (effect.tool === "fork_thread") {
		const requestedBeforeTurnId =
			effect.arguments.beforeTurnId === null
				? null
				: identity.adoptTurnId(effect.arguments.beforeTurnId);
		const effectiveBeforeTurnId =
			effect.effectiveBoundary.beforeTurnId === null
				? null
				: adoptBoundaryTurnId(identity, effect.effectiveBoundary.beforeTurnId);
		return model.BrowserDynamicApprovalEffectSchema.parse({
			tool: effect.tool,
			arguments: {
				threadId,
				beforeTurnId: requestedBeforeTurnId,
				prompt: effect.arguments.prompt,
			},
			target: threadId,
			effectiveBoundary: {
				relation: effect.effectiveBoundary.relation,
				beforeTurnId: effectiveBeforeTurnId,
			},
			mutationOperationId: effect.mutationOperationId,
			initialTurnOperationId: effect.initialTurnOperationId,
			visualSummary: effect.visualSummary,
		});
	}

	return model.BrowserDynamicApprovalEffectSchema.parse({
		tool: effect.tool,
		arguments: { threadId, prompt: effect.arguments.prompt },
		target: threadId,
		effectiveBoundary: null,
		mutationOperationId: effect.mutationOperationId,
		initialTurnOperationId: null,
		visualSummary: effect.visualSummary,
	});
}

function projectDynamicApproval(
	model: DynamicProjectionModel,
	identity: DynamicProjectionIdentity,
	owner: DynamicApprovalOwnerView,
): BrowserDynamicApproval {
	const { request, binding } = owner;
	return model.BrowserDynamicApprovalSchema.parse({
		kind: "dynamic_approval",
		state: "pending",
		identity: {
			child: request.identity.child,
			epoch: request.identity.epoch,
			threadId: request.identity.threadId,
			turnId: request.identity.turnId,
			callId: request.identity.callId,
			namespace: request.identity.namespace,
			tool: request.identity.tool,
			manifestHash: request.identity.manifestHash,
			operationId: request.identity.operationId,
		},
		effect: projectDynamicApprovalEffect(model, identity, request),
		effectHash: request.effectHash,
		createdAtMs: request.createdAtMs,
		expiresAtMs: request.expiresAtMs,
		decision: null,
		delivery: null,
		toolResult: null,
		binding: {
			commandId: binding.commandId,
			paneId: binding.paneId,
			capturedLink: {
				threadId: binding.capturedLink.threadId,
				childId: binding.capturedLink.childId,
				epoch: binding.capturedLink.epoch,
			},
		},
		resumable: false,
	});
}

export function projectCodexBrowserState(
	model: DynamicProjectionModel,
	identity: DynamicProjectionIdentity,
	input: BrowserProjectionInput,
): BrowserProjectionResult {
	if (containsSecretKey(input))
		return Object.freeze({
			tag: "refused",
			reason: "secret_input",
			message: "The browser projection contains a secret-bearing field.",
		});

	try {
		const parsed = model.BrowserSnapshotSchema.safeParse({
			kind: "snapshot",
			version: 1,
			readiness: input.readiness,
			account: projectAccount(input.account),
			login: input.login,
			threadLink: projectThreadLink(input.threadLink),
			timeline: input.timeline,
			queue: projectQueue(input.queue),
			settings: input.settings.map(projectSettings),
			approvals: input.approvals.map(projectApproval),
			dynamicApprovals: input.dynamicApprovals.map((owner) =>
				projectDynamicApproval(model, identity, owner),
			),
			semantic: projectSemantic(input.semantic),
			coordinator: projectCoordinator(input.coordinator),
			voice: projectVoice(input.voice),
			lease: input.lease,
			operation: input.operation,
		});
		if (!parsed.success) throw new Error("The browser snapshot schema rejected owner state.");
		return Object.freeze({ tag: "projected", snapshot: deepFreeze(parsed.data) });
	} catch {
		return Object.freeze({
			tag: "refused",
			reason: "invalid_projection",
			message: "The normalized owner state cannot be represented by the browser contract.",
		});
	}
}

export const BROWSER_SNAPSHOT_MAX_BYTES = 1_048_576;
export const BROWSER_DELTA_MAX_BYTES = 262_144;

type BrowserSnapshotKey = Exclude<keyof BrowserSnapshot, "kind" | "version">;
const SNAPSHOT_KEYS: readonly BrowserSnapshotKey[] = [
	"readiness",
	"account",
	"login",
	"threadLink",
	"timeline",
	"queue",
	"settings",
	"approvals",
	"dynamicApprovals",
	"semantic",
	"coordinator",
	"voice",
	"lease",
	"operation",
];

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) deepFreeze(child);
	}
	return value;
}

function wireBytes(value: unknown): number {
	const encoded = JSON.stringify(value);
	if (encoded === undefined) throw new Error("browser gateway produced a non-JSON value");
	return new TextEncoder().encode(encoded).byteLength;
}

function assertBounded(value: unknown, limit: number, kind: string): void {
	if (wireBytes(value) > limit) throw new Error(`the browser ${kind} exceeds its wire-size bound`);
}

function sameWireValue(left: unknown, right: unknown): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function diffBrowserSnapshots(
	previous: BrowserSnapshot,
	next: BrowserSnapshot,
): BrowserSnapshotDelta | null {
	const delta: Record<string, unknown> = {};
	for (const key of SNAPSHOT_KEYS) {
		if (!sameWireValue(previous[key], next[key])) delta[key] = next[key];
	}
	if (Object.keys(delta).length === 0) return null;
	assertBounded(delta, BROWSER_DELTA_MAX_BYTES, "delta");
	return deepFreeze(delta) as BrowserSnapshotDelta;
}

export function assertBrowserSnapshotBounded(snapshot: BrowserSnapshot): void {
	assertBounded(snapshot, BROWSER_SNAPSHOT_MAX_BYTES, "snapshot");
}

export function assertBrowserDeltaBounded(delta: BrowserSnapshotDelta): void {
	assertBounded(delta, BROWSER_DELTA_MAX_BYTES, "delta");
}
