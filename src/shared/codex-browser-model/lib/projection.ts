import type {
	CodexResponseByMethod,
	CodexServerNotificationParamsByMethod,
} from "../../codex-app-server-contract/index.js";
import type {
	BrowserAccount,
	BrowserApproval,
	BrowserCommandLease,
	BrowserCoordinator,
	BrowserLogin,
	BrowserOperationOutcome,
	BrowserQueue,
	BrowserReadiness,
	BrowserSemanticDelivery,
	BrowserSettings,
	BrowserSnapshot,
	BrowserThreadLink,
	BrowserTimeline,
	BrowserVoice,
	BrowserSchemas,
} from "./browser.js";
import { BROWSER_ACCOUNT_TYPE_BY_CODEX_TYPE } from "./browser.js";
import type { BrowserDynamicApproval } from "./dynamic-approval.js";

export interface CodexAccountProjectionInput {
	readonly kind: "codex_account_response";
	readonly response: CodexResponseByMethod["account/read"];
}

export type BrowserAccountProjectionInput =
	| CodexAccountProjectionInput
	| Extract<
			BrowserAccount,
			{ readonly state: "unknown" | "signed_out" | "login_pending" | "failed" }
	  >;

type CodexThreadSettings =
	CodexServerNotificationParamsByMethod["thread/settings/updated"]["threadSettings"];

export interface CodexSettingsProjectionInput {
	readonly kind: "codex_thread_settings";
	readonly owner: BrowserSettings["owner"];
	readonly settings: Pick<
		CodexThreadSettings,
		| "model"
		| "effort"
		| "serviceTier"
		| "approvalPolicy"
		| "approvalsReviewer"
		| "sandboxPolicy"
		| "activePermissionProfile"
	>;
}

export interface CodexQueueProjectionInput {
	readonly kind: "codex_queue";
	readonly submissions:
		| readonly {
				readonly id: BrowserQueue["entries"][number]["submissionId"];
				readonly input: readonly { readonly type: string; readonly text?: string }[];
		  }[]
		| null;
}

export interface CodexSemanticProjectionInput {
	readonly kind: "codex_semantic";
	readonly outcome: {
		readonly targetThreadId: BrowserSemanticDelivery["threadId"] | null;
		readonly outcome: BrowserSemanticDelivery["delivery"];
		readonly reason: string | null;
	} | null;
	readonly freshness: {
		readonly capturedAtMs: number;
		readonly freshUntilMs: number;
	} | null;
}

export interface CodexCoordinatorProjectionInput {
	readonly kind: "codex_coordinator";
	readonly state: BrowserCoordinator["state"] | "inspect_only";
	readonly threadId: BrowserCoordinator["threadId"];
	readonly configured: {
		readonly model: string;
		readonly effort: string | null;
	} | null;
	readonly effective: {
		readonly model: string;
		readonly effort: string | null;
		readonly serviceTier: string | null;
	} | null;
	readonly reason: string | null;
}

export interface CodexVoiceProjectionInput {
	readonly kind: "codex_voice";
	readonly mediaReady: boolean;
	readonly generation: { readonly browserSessionId: string } | null;
	readonly coordinatorState: CodexCoordinatorProjectionInput["state"];
	readonly transcript: readonly {
		readonly itemId: string;
		readonly sequence: number;
		readonly role: BrowserVoice["transcript"][number]["speaker"];
		readonly text: string;
		readonly status: string;
	}[];
}

export interface BrowserProjectionInput {
	readonly readiness: BrowserReadiness;
	readonly account: BrowserAccountProjectionInput;
	readonly login: BrowserLogin;
	readonly threadLink: BrowserThreadLink;
	readonly timeline: BrowserTimeline | null;
	readonly queue: CodexQueueProjectionInput;
	readonly settings: readonly CodexSettingsProjectionInput[];
	readonly approvals: readonly BrowserApproval[];
	readonly dynamicApprovals: readonly BrowserDynamicApproval[];
	readonly semantic: CodexSemanticProjectionInput;
	readonly coordinator: CodexCoordinatorProjectionInput;
	readonly voice: CodexVoiceProjectionInput;
	readonly lease: BrowserCommandLease | null;
	readonly operation: BrowserOperationOutcome | null;
}

export type BrowserProjectionResult =
	| { readonly tag: "projected"; readonly snapshot: BrowserSnapshot }
	| {
			readonly tag: "refused";
			readonly reason: "secret_input" | "invalid_projection";
			readonly message: string;
	  };

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

function freezeProjection<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value)) freezeProjection(child);
	}
	return value;
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
			return {
				mode: "read_only",
				network: policy.networkAccess ? "enabled" : "restricted",
			};
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

function projectQueue(input: CodexQueueProjectionInput) {
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

/**
 * The one normalized-owner to browser-state adapter. It selects the closed
 * browser fields, refuses secret-bearing inputs, and never exposes a Codex
 * envelope or private producer field to the browser.
 */
export function projectCodexBrowserState(
	model: Pick<BrowserSchemas, "BrowserSnapshotSchema">,
	input: BrowserProjectionInput,
): BrowserProjectionResult {
	if (containsSecretKey(input)) {
		return Object.freeze({
			tag: "refused",
			reason: "secret_input",
			message: "The browser projection contains a secret-bearing field.",
		});
	}

	const parsed = model.BrowserSnapshotSchema.safeParse({
		kind: "snapshot",
		version: 1,
		readiness: input.readiness,
		account: projectAccount(input.account),
		login: input.login,
		threadLink: input.threadLink,
		timeline: input.timeline,
		queue: projectQueue(input.queue),
		settings: input.settings.map(projectSettings),
		approvals: input.approvals,
		dynamicApprovals: input.dynamicApprovals,
		semantic: projectSemantic(input.semantic),
		coordinator: projectCoordinator(input.coordinator),
		voice: projectVoice(input.voice),
		lease: input.lease,
		operation: input.operation,
	});
	if (!parsed.success) {
		return Object.freeze({
			tag: "refused",
			reason: "invalid_projection",
			message: "The normalized owner state cannot be represented by the browser contract.",
		});
	}
	return Object.freeze({ tag: "projected", snapshot: freezeProjection(parsed.data) });
}
