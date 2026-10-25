import type { BrowserOwnerProjection } from "#server/protocol/projection/projection-contract.ts";
import type { BrowserReadiness } from "#shared/schemas/browser/snapshot.ts";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	LoginId,
	ThreadId,
} from "@archboard/codex-app-server/identity";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "#runtime/rules/thread-link/contract.ts";

const CLOCK_START = 1_787_682_840_000;

function executableLink(
	childId: ChildId,
	epoch: ChildEpoch,
	threadId: ThreadId,
): ThreadLinkSnapshot {
	return {
		kind: "thread_link",
		state: "executable",
		childId,
		epoch,
		threadId,
		source: "appServer",
		status: "idle",
		loaded: true,
		canAcceptDirectInput: true,
		reason: null,
	};
}

function bindingFor(
	linkKey: string,
	revision: number,
	link: ThreadLinkSnapshot,
): ThreadLinkBindingSnapshot {
	return {
		linkKey,
		revision,
		link,
		cas: {
			revision,
			linkKey,
			childId: link.childId,
			epoch: link.epoch,
			threadId: link.threadId,
		},
	};
}

function readinessFor(state: BrowserReadiness["state"], loginId: LoginId): BrowserReadiness {
	if (
		state === "stopped" ||
		state === "storage_mismatch" ||
		state === "reconnecting" ||
		state === "incompatible_contract"
	) {
		return { kind: "readiness", state, reason: "fixture" };
	}
	if (state === "backoff") {
		return { kind: "readiness", state, retryAtMs: CLOCK_START + 1, reason: "fixture" };
	}
	if (state === "login_pending") {
		return { kind: "readiness", state, loginId };
	}
	return { kind: "readiness", state };
}

const readyAccount = (): BrowserOwnerProjection["account"] => ({
	kind: "codex_account_response",
	response: {
		account: { type: "chatgpt", email: "gateway@example.test", planType: "plus" },
		requiresOpenaiAuth: true,
		workspaceRouting: null,
	},
});

function commandTarget(lease: {
	readonly commandId: BrowserCommandId;
	readonly paneId: string;
	readonly childId: ChildId;
	readonly epoch: ChildEpoch;
}) {
	return {
		kind: "browser_command" as const,
		commandId: lease.commandId,
		paneId: lease.paneId,
		childId: lease.childId,
		epoch: lease.epoch,
	};
}

export { CLOCK_START, executableLink, bindingFor, readinessFor, readyAccount, commandTarget };
