import type { BrowserOwnerProjection, BrowserReadiness } from "../index.js";
import type {
	BrowserCommandId,
	ChildEpoch,
	ChildId,
	LoginId,
	ThreadId,
} from "../../../shared/codex-workbench-identity/index.js";
import type {
	ThreadLinkBindingSnapshot,
	ThreadLinkSnapshot,
} from "../../../runtime/codex-thread-link/index.js";

export const CLOCK_START = 1_787_682_840_000;

export function executableLink(
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

export function bindingFor(
	paneId: string,
	revision: number,
	link: ThreadLinkSnapshot,
): ThreadLinkBindingSnapshot {
	return {
		paneId,
		revision,
		link,
		cas: {
			revision,
			paneId,
			childId: link.childId,
			epoch: link.epoch,
			threadId: link.threadId,
		},
	};
}

export function readinessFor(state: BrowserReadiness["state"], loginId: LoginId): BrowserReadiness {
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

export const readyAccount = (): BrowserOwnerProjection["account"] => ({
	kind: "codex_account_response",
	response: {
		account: { type: "chatgpt", email: "gateway@example.test", planType: "plus" },
		requiresOpenaiAuth: true,
	},
});

export function commandTarget(lease: {
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
