// The owners the application composes over one pane's workbench transport:
// the voice session adapter, the queue, approvals and thread-link
// controllers, and the host doors the runtime opens. One set per transport
// generation; the runtime itself is the one authoritative Codex runtime.

import { createSnapshotCache, type SnapshotStore } from "@/ui/application/lib/snapshot-cache";
import type { BrowserWorkbenchMediaOwner } from "@/ui/codex-workbench-media";
import type { VoiceControlsActions } from "@/ui/voice-controls/contracts";
import { createVoiceSession, type VoiceSession } from "@/ui/voice-session";
import type { WorkbenchQueueCommandView, WorkbenchThreadLinkActions } from "@/ui/workbench";
import {
	createWorkbenchApprovalsController,
	type WorkbenchApprovalsController,
} from "@/ui/workbench-approvals";
import {
	createWorkbenchQueueController,
	type WorkbenchQueueController,
} from "@/ui/workbench-queue";
import type { WorkbenchRuntimeHost } from "@/ui/workbench-runtime";
import { createThreadLinkController, workbenchThreadLinkActions } from "@/ui/workbench-thread-link";
import type { ThreadLinkController } from "@/ui/workbench-thread-link/contracts";
import type { BrowserWorkbenchTransport } from "@/ui/workbench-transport";

/** The approvals controller's state as the cards read it. */
interface ApprovalDecisions {
	readonly busy: readonly string[];
	/** Error text per approval key: an invalid or refused decision. */
	readonly errors: Readonly<Record<string, string>>;
}

/** The owners over one transport. */
interface WorkbenchOwners {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
	readonly voice: VoiceSession;
	readonly queue: WorkbenchQueueController;
	readonly approvals: WorkbenchApprovalsController;
	readonly threadLink: ThreadLinkController;
	readonly threadLinkActions: WorkbenchThreadLinkActions;
	/** The queue controller's command state, cached per publication. */
	readonly queueCommand: SnapshotStore<WorkbenchQueueCommandView>;
	/** The approvals controller's decisions, cached per publication. */
	readonly approvalDecisions: SnapshotStore<ApprovalDecisions>;
	readonly host: WorkbenchRuntimeHost;
	/** Release the adapters' subscriptions; the transport and media outlive them. */
	readonly dispose: () => void;
}

/** What the owners need from the application. */
interface WorkbenchOwnersOptions {
	readonly paneId: string;
	readonly transport: BrowserWorkbenchTransport;
	readonly media: BrowserWorkbenchMediaOwner;
	readonly openAgentSettings: () => void;
}

/**
 * The voice controls' actions over the session adapter. Each control is fire
 * and forget: the adapter publishes the outcome through its own view.
 * @param voice The adapter.
 * @returns The actions.
 */
function voiceActions(voice: VoiceSession): VoiceControlsActions {
	return Object.freeze({
		/** Start voice. */
		start: (): void => {
			void voice.start();
		},
		/** Mute the microphone. */
		mute: (): void => {
			void voice.mute();
		},
		/** Unmute the microphone. */
		unmute: (): void => {
			void voice.unmute();
		},
		/** Stop voice. */
		stop: (): void => {
			void voice.stop();
		},
		/** Restart voice. */
		restart: (): void => {
			void voice.restart();
		},
	});
}

/**
 * Copy text to the clipboard, when the browser allows it: an insecure
 * context has no clipboard, and a denied permission rejects.
 * @param text The exact text.
 */
function copyText(text: string): void {
	try {
		globalThis.navigator.clipboard.writeText(text).catch(() => undefined);
	} catch {
		// No clipboard in this context; the text stays where it is shown.
	}
}

/**
 * The queue command view from the controller's state.
 * @param queue The queue controller.
 * @returns The view.
 */
function queueCommandView(queue: WorkbenchQueueController): WorkbenchQueueCommandView {
	const { pending, settlement } = queue.commandState();
	const ownership: Record<string, string> = {};
	for (const entry of queue.view().entries) {
		ownership[entry.submissionId] = entry.ownershipLabel;
	}
	return {
		pending: pending === null ? null : `Queue ${pending.control} is on the wire…`,
		settlement:
			settlement === null ? null : { tone: settlement.state, message: settlement.message },
		ownership,
	};
}

/**
 * The approval decisions from the controller's state.
 * @param approvals The approvals controller.
 * @returns The busy keys and the error text per key.
 */
function approvalDecisions(approvals: WorkbenchApprovalsController): ApprovalDecisions {
	const state = approvals.decisionState();
	const errors: Record<string, string> = {};
	for (const [key, result] of state.results) {
		if (result.status === "invalid") {
			errors[key] = result.errors.map((error) => `${error.name}: ${error.message}`).join(" ");
		} else if (result.status === "refused") {
			errors[key] = result.message;
		}
	}
	return { busy: state.busyApprovals, errors };
}

/**
 * Compose the owners over one transport.
 * @param options The pane, the transport, its media owner and the settings door.
 * @returns The owners.
 */
function createWorkbenchOwners(options: WorkbenchOwnersOptions): WorkbenchOwners {
	const { paneId, transport, media, openAgentSettings } = options;
	const voice = createVoiceSession({ realtime: media, transport, paneId });
	const queue = createWorkbenchQueueController(transport);
	const approvals = createWorkbenchApprovalsController(transport);
	const threadLink = createThreadLinkController({
		/**
		 * The pane an action is captured against. The application offers no host
		 * recovery of its own, so every recovery is the transport's or none.
		 * @returns The capture.
		 */
		capturePane: () => ({ paneId, transport, hostRecoveryIntents: [] }),
	});
	const host: WorkbenchRuntimeHost = {
		openAgentSettings,
		// The candidate chooser lives in the agent settings dialog.
		chooseThread: openAgentSettings,
		voice: voiceActions(voice),
		copyText,
	};
	return Object.freeze({
		paneId,
		transport,
		voice,
		queue,
		approvals,
		threadLink,
		threadLinkActions: workbenchThreadLinkActions(threadLink, { openChooser: openAgentSettings }),
		queueCommand: createSnapshotCache(queue.subscribe, () => queueCommandView(queue)),
		approvalDecisions: createSnapshotCache(approvals.subscribe, () => approvalDecisions(approvals)),
		host,
		/** Release the voice adapter; the controllers hold no subscriptions of their own. */
		dispose: (): void => {
			voice.dispose();
		},
	});
}

export {
	createWorkbenchOwners,
	type ApprovalDecisions,
	type WorkbenchOwners,
	type WorkbenchOwnersOptions,
};
