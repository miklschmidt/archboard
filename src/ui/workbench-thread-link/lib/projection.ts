import type { BrowserThreadLink } from "../../../shared/codex-browser-model/index.js";

import { projectThreadLinkAccount } from "./account.js";
import { projectThreadLinkSelection } from "./candidates.js";
import { projectThreadLinkReadiness, THREAD_LINK_COMMAND_PREREQUISITE } from "./readiness.js";
import type {
	ThreadLinkCreateOffer,
	ThreadLinkInventory,
	ThreadLinkPanelInput,
	ThreadLinkPanelSnapshot,
} from "./contract.js";

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

function currentLinkDisclosure(link: BrowserThreadLink): ThreadLinkPanelSnapshot["currentLink"] {
	if (link.state === "executable")
		return Object.freeze({
			state: link.state,
			label: "Executable link",
			detail: `This pane is bound to thread ${link.threadId} in the current child epoch, and accepts direct input.`,
			threadId: link.threadId,
		});
	if (link.state === "inspect_only")
		return Object.freeze({
			state: link.state,
			label: "Inspect-only link",
			detail: `This pane can inspect thread ${link.threadId} but cannot drive it. ${link.reason ?? "The host named no reason."}`,
			threadId: link.threadId,
		});
	return Object.freeze({
		state: link.state,
		label: "No thread link",
		detail:
			"This pane is not linked to a Codex thread. Create a workhorse thread, or attach a listed one. Archboard never picks one for you.",
		threadId: null,
	});
}

/**
 * Create is offered on its own prerequisites: it needs a ready, thread-capable,
 * leased pane and nothing else. It never consults the thread list, and no
 * recent thread is ever adopted in its place.
 */
function createOffer(input: ThreadLinkPanelInput): ThreadLinkCreateOffer {
	const enabled = input.capabilities.supportsCommand("threadLinkCreate");
	return Object.freeze({
		command: "threadLinkCreate",
		label: "Create a workhorse thread",
		prerequisite: `${THREAD_LINK_COMMAND_PREREQUISITE} No thread list is required.`,
		enabled,
		blockedReason: enabled
			? null
			: `Create is unavailable. It needs: ${THREAD_LINK_COMMAND_PREREQUISITE.toLowerCase()}`,
	});
}

export function projectThreadLinkPanel(input: ThreadLinkPanelInput): ThreadLinkPanelSnapshot {
	const link = input.state.snapshot?.threadLink ?? UNBOUND_LINK;
	return Object.freeze({
		paneId: input.paneId,
		readiness: projectThreadLinkReadiness({
			state: input.state,
			capabilities: input.capabilities,
			hostRecoveryIntents: input.hostRecoveryIntents,
		}),
		currentLink: currentLinkDisclosure(link),
		create: createOffer(input),
		selection: projectThreadLinkSelection({
			inventory: input.state.snapshot?.threadCandidates ?? UNKNOWN_CANDIDATES,
			currentLink: link,
			capabilities: input.capabilities,
		}),
		account: projectThreadLinkAccount({
			snapshot: input.state.snapshot,
			capabilities: input.capabilities,
		}),
		action: input.action,
	});
}
