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
import type { BrowserDynamicApproval } from "./dynamic-approval.js";

export interface CodexAccountProjectionInput {
	readonly kind: "codex_account_response";
	readonly response: CodexResponseByMethod["account/read"];
}

export interface CodexSettingsProjectionInput {
	readonly kind: "codex_thread_settings";
	readonly owner: BrowserSettings["owner"];
	readonly notification: CodexServerNotificationParamsByMethod["thread/settings/updated"];
}

export interface BrowserProjectionInput {
	readonly readiness: BrowserReadiness;
	readonly account: BrowserAccount | CodexAccountProjectionInput;
	readonly login: BrowserLogin;
	readonly threadLink: BrowserThreadLink;
	readonly timeline: BrowserTimeline | null;
	readonly queue: BrowserQueue;
	readonly settings: readonly (BrowserSettings | CodexSettingsProjectionInput)[];
	readonly approvals: readonly BrowserApproval[];
	readonly dynamicApprovals: readonly BrowserDynamicApproval[];
	readonly semantic: BrowserSemanticDelivery | null;
	readonly coordinator: BrowserCoordinator;
	readonly voice: BrowserVoice;
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
	switch (account.type) {
		case "apiKey":
		case "chatgpt":
		case "amazonBedrock":
			return { kind: "account", state: "ready", accountType: account.type };
	}
	throw new Error("The normalized account response has an unsupported account type.");
}

function projectSettings(input: BrowserSettings | CodexSettingsProjectionInput): BrowserSettings {
	if (input.kind !== "codex_thread_settings") return input;
	const settings = input.notification.threadSettings;
	return {
		kind: "settings",
		owner: input.owner,
		model: settings.model,
		effort: settings.effort,
		serviceTier: settings.serviceTier,
		approvalPolicy: settings.approvalPolicy,
		approvalsReviewer: settings.approvalsReviewer,
		sandboxPolicy: settings.sandboxPolicy,
		activePermissionProfile: settings.activePermissionProfile,
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
		queue: input.queue,
		settings: input.settings.map(projectSettings),
		approvals: input.approvals,
		dynamicApprovals: input.dynamicApprovals,
		semantic: input.semantic,
		coordinator: input.coordinator,
		voice: input.voice,
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
