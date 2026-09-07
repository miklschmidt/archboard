import type {
	BrowserAccount,
	BrowserCoordinator,
	BrowserQueue,
	BrowserSemanticDelivery,
	BrowserSettings,
	BrowserVoice,
} from "@/shared/codex-browser-model";
import type { ApprovalOwnerView } from "@/runtime/codex-approvals";
import type {
	BrowserProjectionInput,
	BrowserProjectionResult,
	CodexCoordinatorProjectionInput,
	CodexQueueProjectionInput,
	CodexQueuedSubmissionProjectionInput,
	CodexSemanticProjectionInput,
	CodexSettingsProjectionInput,
	CodexVoiceProjectionInput,
} from "@/server/codex-workbench/lib/projection-contract";
import { projectApproval } from "@/server/codex-workbench/lib/approval-projection";
import {
	projectDynamicApproval,
	type DynamicProjectionIdentity,
	type DynamicProjectionModel,
} from "@/server/codex-workbench/lib/dynamic-approval-projection";
import { projectSpokenApproval } from "@/server/codex-workbench/lib/spoken-approval-projection";
import {
	projectThreadCandidates,
	projectThreadLink,
	projectTimeline,
} from "@/server/codex-workbench/lib/thread-projection";
import { deepFreeze } from "@/server/codex-workbench/lib/snapshot-bounds";

export {
	BROWSER_DELTA_MAX_BYTES,
	BROWSER_SNAPSHOT_MAX_BYTES,
	BROWSER_SNAPSHOT_MIN_BYTES,
	assertBrowserDeltaBounded,
	assertBrowserSnapshotBounded,
	assertBrowserSnapshotBudget,
	diffBrowserSnapshots,
	fitBrowserSnapshotBounded,
} from "@/server/codex-workbench/lib/snapshot-bounds";

type CodexAccountType = NonNullable<
	Extract<
		BrowserProjectionInput["account"],
		{ readonly kind: "codex_account_response" }
	>["response"]["account"]
>["type"];
type SandboxPolicy = CodexSettingsProjectionInput["settings"]["sandboxPolicy"];

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

/**
 * Whether any object reachable from the value carries a key that names a secret.
 * @param value The value to search.
 * @param seen Objects already visited, so a cycle terminates.
 * @returns True when a secret-bearing key is present anywhere.
 */
function containsSecretKey(value: unknown, seen = new Set<object>()): boolean {
	if (value === null || typeof value !== "object" || seen.has(value)) return false;
	seen.add(value);
	if (Array.isArray(value)) return value.some((entry) => containsSecretKey(entry, seen));
	return Object.entries(value).some(
		([key, entry]) => SECRET_KEYS.has(key) || containsSecretKey(entry, seen),
	);
}

/**
 * Project the account as the browser presents it, from a Codex read or a host-known state.
 * @param input The account projection input.
 * @returns The browser account.
 */
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

/**
 * Project one owner's thread settings for the browser.
 * @param input The settings projection input.
 * @returns The browser settings.
 */
function projectSettings(input: CodexSettingsProjectionInput): BrowserSettings {
	const settings = input.settings;
	return {
		kind: "settings",
		owner: input.owner,
		model: settings.model,
		effort: settings.effort,
		serviceTier: settings.serviceTier,
		approvalPolicy: projectApprovalPolicy(settings.approvalPolicy),
		approvalsReviewer: settings.approvalsReviewer,
		sandbox: projectSandbox(settings.sandboxPolicy),
		activePermissionProfile:
			settings.activePermissionProfile === null
				? null
				: {
						id: settings.activePermissionProfile.id,
						extends: settings.activePermissionProfile.extends,
					},
	};
}

/**
 * Copy the approval policy, keeping only the granular fields the browser presents.
 * @param policy The Codex approval policy.
 * @returns The browser approval policy.
 */
function projectApprovalPolicy(
	policy: CodexSettingsProjectionInput["settings"]["approvalPolicy"],
): BrowserSettings["approvalPolicy"] {
	if (typeof policy === "string") return policy;
	return {
		granular: {
			sandbox_approval: policy.granular.sandbox_approval,
			rules: policy.granular.rules,
			skill_approval: policy.granular.skill_approval,
			request_permissions: policy.granular.request_permissions,
			mcp_elicitations: policy.granular.mcp_elicitations,
		},
	};
}

/**
 * The browser's word for a sandbox's network flag.
 * @param networkAccess Whether the sandbox allows network access.
 * @returns The network presentation.
 */
function sandboxNetwork(networkAccess: boolean): BrowserSettings["sandbox"]["network"] {
	return networkAccess ? "enabled" : "restricted";
}

/**
 * Fail at compile time when a sandbox policy is left unprojected; at run time
 * the call always throws, naming the policy.
 * @param policy The policy no arm handled.
 */
function unprojectedSandbox(policy: never): never {
	throw new Error(`the sandbox policy ${JSON.stringify(policy)} has no browser projection`);
}

/**
 * Project the sandbox policy as the mode and network access the browser presents.
 * @param policy The Codex sandbox policy.
 * @returns The browser sandbox presentation.
 */
function projectSandbox(policy: SandboxPolicy): BrowserSettings["sandbox"] {
	switch (policy.type) {
		case "dangerFullAccess":
			return { mode: "full_access", network: "unspecified" };
		case "readOnly":
			return { mode: "read_only", network: sandboxNetwork(policy.networkAccess) };
		case "externalSandbox":
			return { mode: "external", network: policy.networkAccess };
		case "workspaceWrite":
			return { mode: "workspace_write", network: sandboxNetwork(policy.networkAccess) };
		default:
			return unprojectedSandbox(policy);
	}
}

/**
 * The queue's condition against the workhorse it belongs to.
 *
 * Every arm is derived from an authoritative fact the projection already holds:
 * the thread-link status the host read for this pane, and that thread's own
 * pending approvals. That is five of the eleven statuses the closed contract
 * allows, and the other six are deliberately never produced here:
 *
 * - `interrupted`, `completed` and `failed` describe a workhorse *turn*. The
 *   timeline owns turn status; a queue holds pending submissions, and a
 *   submission that ran has already left the list.
 * - `stale` and `reconnecting` are transport facts. The browser transport knows
 *   its own sequence gaps and socket state; the host would only be guessing.
 * - `outcome_unknown` belongs to one command's settlement, which the gateway
 *   already publishes as its own operation outcome.
 *
 * An executable link is only ever `idle` or `active`, and a queue is published
 * only for the link it was read for, so there is no unloaded or errored arm to
 * map here.
 * @param submissions The pending submissions.
 * @param link The pane's thread link.
 * @param approvals The owner's approvals.
 * @returns The queue status.
 */
function projectQueueStatus(
	submissions: readonly CodexQueuedSubmissionProjectionInput[],
	link: BrowserProjectionInput["threadLink"],
	approvals: readonly ApprovalOwnerView[],
): BrowserQueue["status"] {
	if (submissions.length === 0) return "empty";
	if (link.status !== "active") return "queued";
	const blocked = approvals.some(
		(view) => view.snapshot.state === "pending" && view.snapshot.threadId === link.threadId,
	);
	return blocked ? "approval_blocked" : "running";
}

/**
 * Project the workhorse queue for the browser.
 * @param input The queue projection input.
 * @param link The pane's thread link.
 * @param approvals The owner's approvals.
 * @returns The browser queue.
 */
function projectQueue(
	input: CodexQueueProjectionInput,
	link: BrowserProjectionInput["threadLink"],
	approvals: readonly ApprovalOwnerView[],
): BrowserQueue {
	if (input.submissions === null) return { kind: "queue", status: "unavailable", entries: [] };
	const submissions = input.submissions;
	return {
		kind: "queue",
		status: projectQueueStatus(submissions, link, approvals),
		entries: submissions.map((entry) => {
			const textInput = entry.input.find((item) => item.type === "text");
			return {
				submissionId: entry.id,
				prompt:
					textInput?.type === "text" && typeof textInput.text === "string"
						? textInput.text
						: "[non-text input]",
				// `thread/queue/list` answers with pending submissions only: a started
				// submission becomes a turn and leaves the list, so the per-entry axis
				// has exactly one authoritative value at this seam.
				status: "queued" as const,
				operationId: entry.operationId,
			};
		}),
	};
}

/**
 * Project the last semantic delivery, when the host holds a complete, fresh record of one.
 * @param input The semantic projection input.
 * @returns The browser semantic delivery, or null.
 */
function projectSemantic(input: CodexSemanticProjectionInput): BrowserSemanticDelivery | null {
	const { outcome, freshness } = input;
	if (outcome === null || freshness === null) return null;
	if (outcome.targetThreadId === null) return null;
	return {
		kind: "semantic_delivery",
		threadId: outcome.targetThreadId,
		delivery: outcome.outcome,
		capturedAtMs: freshness.capturedAtMs,
		freshUntilMs: freshness.freshUntilMs,
		reason: outcome.reason,
	};
}

/**
 * Project the coordinator for the browser; an inspect-only coordinator presents as failed.
 * @param input The coordinator projection input.
 * @returns The browser coordinator.
 */
function projectCoordinator(input: CodexCoordinatorProjectionInput): BrowserCoordinator {
	const configured = input.configured ?? { model: null, effort: null };
	const effective = input.effective ?? { model: null, effort: null, serviceTier: null };
	return {
		kind: "coordinator",
		state: input.state === "inspect_only" ? "failed" : input.state,
		threadId: input.threadId,
		activeTurnId: null,
		configuredModel: configured.model,
		configuredEffort: configured.effort,
		model: effective.model,
		effort: effective.effort,
		serviceTier: effective.serviceTier,
		reason: input.reason,
	};
}

/**
 * The voice state for this socket: unavailable without browser media, active
 * while a realtime generation runs, ready only when the coordinator is.
 * @param input The voice projection input.
 * @returns The browser voice state.
 */
function voiceState(input: CodexVoiceProjectionInput): BrowserVoice["state"] {
	if (!input.mediaReady) return "unavailable";
	if (input.generation !== null) return "active";
	return input.coordinatorState === "ready" ? "ready" : "unavailable";
}

/**
 * The realtime session the browser owns, when its media is ready and a generation runs.
 * @param input The voice projection input.
 * @returns The browser session id, or null.
 */
function realtimeSessionId(input: CodexVoiceProjectionInput): string | null {
	if (!input.mediaReady) return null;
	return input.generation?.browserSessionId ?? null;
}

/**
 * Project the voice channel for the browser.
 * @param input The voice projection input.
 * @returns The browser voice presentation.
 */
function projectVoice(input: CodexVoiceProjectionInput) {
	return {
		kind: "voice",
		state: voiceState(input),
		realtimeSessionId: realtimeSessionId(input),
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
 * Project the owners' state into one validated browser snapshot, refusing
 * input that carries a secret or that the browser contract cannot represent.
 * @param model The browser schema owner.
 * @param identity The trusted identity decoder.
 * @param input The owners' state for one pane.
 * @returns The projected snapshot, or the refusal.
 */
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
			threadCandidates: projectThreadCandidates(input.threadCandidates),
			timeline: projectTimeline(input.timeline),
			queue: projectQueue(input.queue, input.threadLink, input.approvals),
			settings: input.settings.map(projectSettings),
			approvals: input.approvals.map(projectApproval),
			dynamicApprovals: input.dynamicApprovals.map((owner) =>
				projectDynamicApproval(model, identity, owner),
			),
			semantic: projectSemantic(input.semantic),
			coordinator: projectCoordinator(input.coordinator),
			voice: projectVoice(input.voice),
			spokenApproval: projectSpokenApproval(
				model,
				input.spokenApproval,
				input.approvals,
				input.coordinator,
				input.voice,
			),
			voiceContext: input.voiceContext ?? null,
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
