// The thread-link panel: readiness, the current link, the create offer, the
// candidate selection, the account, and the published action.

import type { BrowserThreadLink } from "@/shared/codex-browser-model";
import type {
	ThreadLinkCreateOffer,
	ThreadLinkInventory,
	ThreadLinkPanelInput,
	ThreadLinkPanelSnapshot,
} from "@/ui/workbench-thread-link/contracts";
import { projectThreadLinkAccount } from "@/ui/workbench-thread-link/lib/account";
import { projectThreadLinkSelection } from "@/ui/workbench-thread-link/lib/candidates";
import { projectThreadLinkReadiness } from "@/ui/workbench-thread-link/lib/readiness";

const UNBOUND_LINK: BrowserThreadLink = Object.freeze({
	kind: "thread_link",
	state: "unbound",
	childId: null,
	epoch: null,
	threadId: null,
	sourcePresentation: null,
	status: "notLoaded",
	loaded: false,
	canAcceptDirectInput: false,
	reason: null,
});

const UNKNOWN_CANDIDATES: ThreadLinkInventory = Object.freeze({
	kind: "thread_candidates",
	state: "unknown",
	records: [],
	truncated: false,
	reason: null,
});

/**
 * The current link as the panel shows it.
 * @param link The published link.
 * @returns The disclosure.
 */
function currentLinkDisclosure(link: BrowserThreadLink): ThreadLinkPanelSnapshot["currentLink"] {
	if (link.state === "executable") {
		return Object.freeze({
			state: link.state,
			label: "Agent connected",
			detail: "This conversation can work on the board.",
			threadId: link.threadId,
		});
	}
	if (link.state === "inspect_only") {
		return Object.freeze({
			state: link.state,
			label: "Read-only conversation",
			detail: `This conversation is read only. ${link.reason ?? "Choose another conversation to work on the board."}`,
			threadId: link.threadId,
		});
	}
	return Object.freeze({
		state: link.state,
		label: "No agent connected",
		detail: "Start an agent for this board or choose an existing conversation.",
		threadId: null,
	});
}

/**
 * Create is offered on its own prerequisites: it needs a ready, thread-capable
 * pane and nothing else. It never consults the thread list, and no recent
 * thread is ever adopted in its place.
 * @param input The panel input.
 * @returns The offer.
 */
function createOffer(input: ThreadLinkPanelInput): ThreadLinkCreateOffer {
	const enabled = input.capabilities.supportsCommand("threadLinkCreate");
	return Object.freeze({
		command: "threadLinkCreate",
		label: "Start agent",
		enabled,
		blockedReason: enabled ? null : createBlock(input),
	});
}

/**
 * Why create is blocked.
 * @param input The panel input.
 * @returns The reason.
 */
function createBlock(input: ThreadLinkPanelInput): string {
	return input.state.state === "thread_capable"
		? "Refresh the connection and try again."
		: projectThreadLinkReadiness(input).detail;
}

/**
 * The thread-link panel.
 * @param input The panel input.
 * @returns The panel.
 */
function projectThreadLinkPanel(input: ThreadLinkPanelInput): ThreadLinkPanelSnapshot {
	const link = input.state.snapshot?.threadLink ?? UNBOUND_LINK;
	return Object.freeze({
		paneId: input.paneId,
		readiness: projectThreadLinkReadiness(input),
		currentLink: currentLinkDisclosure(link),
		create: createOffer(input),
		selection: projectThreadLinkSelection({
			inventory: input.state.snapshot?.threadCandidates ?? UNKNOWN_CANDIDATES,
			currentLink: link,
			capabilities: input.capabilities,
		}),
		account: projectThreadLinkAccount(input),
		action: input.action,
	});
}

export { projectThreadLinkPanel };
